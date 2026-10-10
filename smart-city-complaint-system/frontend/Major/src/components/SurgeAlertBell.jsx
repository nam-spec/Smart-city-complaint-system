import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { BACKEND_URL } from "../api/axios";

const LEVEL_STYLE = {
  critical: { dot: "bg-red-600", toast: "border-red-500 bg-red-50", text: "text-red-800", label: "Critical" },
  warning: { dot: "bg-orange-500", toast: "border-orange-400 bg-orange-50", text: "text-orange-800", label: "Surge" },
  watch: { dot: "bg-amber-400", toast: "border-amber-300 bg-amber-50", text: "text-amber-800", label: "Possible surge" },
  info: { dot: "bg-emerald-500", toast: "border-emerald-300 bg-emerald-50", text: "text-emerald-800", label: "Resolved" }
};

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(date).toLocaleDateString();
}

function beep(level) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const tones = level === "critical" ? [880, 660, 880] : [740];
    tones.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.start(t);
      o.stop(t + 0.17);
    });
  } catch {
    /* audio not allowed until the user interacts with the page */
  }
}

/**
 * Admin surge-alert centre: bell with unread badge, dropdown list, live pop-up toasts,
 * sound and desktop notifications. Receives alerts live over Server-Sent Events and
 * falls back to polling every 30 s if the stream is unavailable.
 */
function SurgeAlertBell() {
  const [alerts, setAlerts] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [live, setLive] = useState(false);
  const [notifPerm, setNotifPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "denied");
  const seen = useRef(new Set());
  const firstLoad = useRef(true);

  const pushToast = useCallback((a) => {
    setToasts(prev => [a, ...prev].slice(0, 4));
    if (a.level !== "critical") {
      setTimeout(() => setToasts(prev => prev.filter(t => t._id !== a._id)), 12000);
    }
  }, []);

  const handleNew = useCallback((a) => {
    if (!a || seen.current.has(a._id)) return;
    seen.current.add(a._id);
    setAlerts(prev => [a, ...prev].slice(0, 50));
    if (!a.acknowledged) setUnread(u => u + 1);
    if (a.level === "info") return; // resolved notices: no pop-up
    pushToast(a);
    beep(a.level);
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
      try {
        new Notification(a.title, { body: a.message, tag: a._id });
      } catch {
        /* ignore */
      }
    }
  }, [pushToast]);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/alerts?limit=30");
      const list = res.data.alerts || [];
      if (firstLoad.current) {
        list.forEach(a => seen.current.add(a._id));
        setAlerts(list);
        firstLoad.current = false;
      } else {
        // polling mode: announce anything we have not seen yet
        list.slice().reverse().forEach(a => {
          if (!seen.current.has(a._id)) handleNew(a);
        });
      }
      setUnread(res.data.unread || 0);
    } catch (e) {
      console.error("Failed to load alerts", e);
    }
  }, [handleNew]);

  useEffect(() => {
    const initial = setTimeout(load, 0);
    const token = localStorage.getItem("token");
    let es = null;
    let poll = null;
    const startPolling = () => {
      if (!poll) poll = setInterval(load, 30000);
    };
    if (typeof EventSource !== "undefined" && token) {
      es = new EventSource(`${BACKEND_URL}/api/alerts/stream?token=${encodeURIComponent(token)}`);
      es.addEventListener("hello", () => setLive(true));
      es.addEventListener("alert", (ev) => {
        try {
          handleNew(JSON.parse(ev.data));
        } catch {
          /* ignore malformed */
        }
      });
      es.onerror = () => {
        setLive(false);
        startPolling(); // EventSource retries on its own; poll meanwhile
      };
    } else {
      startPolling();
    }
    return () => {
      clearTimeout(initial);
      if (es) es.close();
      if (poll) clearInterval(poll);
    };
  }, [load, handleNew]);

  const ack = async (id) => {
    try {
      await api.patch(`/alerts/${id}/ack`);
      setAlerts(prev => prev.map(a => (a._id === id ? { ...a, acknowledged: true } : a)));
      setUnread(u => Math.max(0, u - 1));
      setToasts(prev => prev.filter(t => t._id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const ackAll = async () => {
    try {
      await api.post("/alerts/ack-all");
      setAlerts(prev => prev.map(a => ({ ...a, acknowledged: true })));
      setUnread(0);
      setToasts([]);
    } catch (e) {
      console.error(e);
    }
  };

  const enableNotifications = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setNotifPerm(p);
  };

  return (
    <>
      {/* Bell */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="relative w-9 h-9 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:text-indigo-600 hover:border-indigo-300 transition cursor-pointer"
          title={live ? "Surge alerts (live)" : "Surge alerts"}
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center animate-pulse">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
          <span className={`absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full ${live ? "bg-emerald-500" : "bg-slate-300"}`} />
        </button>

        {open && (
          <div className="absolute right-0 mt-2 z-50 w-96 max-w-[calc(100vw-2rem)] max-h-[70vh] bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <div className="font-extrabold text-slate-800 text-sm">Surge alerts</div>
                <div className="text-[10px] text-slate-400">{live ? "● Live" : "○ Polling every 30 s"} · {unread} unread</div>
              </div>
              <div className="flex gap-2">
                {notifPerm === "default" && (
                  <button onClick={enableNotifications} className="text-[10px] font-semibold text-indigo-600 hover:underline cursor-pointer">
                    Desktop alerts
                  </button>
                )}
                {unread > 0 && (
                  <button onClick={ackAll} className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer">
                    Mark all read
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-y-auto divide-y divide-slate-100">
              {alerts.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-400">No alerts yet. You will be notified here automatically when a surge starts.</div>
              )}
              {alerts.map(a => {
                const st = LEVEL_STYLE[a.level] || LEVEL_STYLE.warning;
                return (
                  <div key={a._id} className={`px-4 py-3 text-xs ${a.acknowledged ? "opacity-60" : ""}`}>
                    <div className="flex items-start gap-2">
                      <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-bold ${st.text}`}>{st.label}</span>
                          <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(a.createdAt)}</span>
                        </div>
                        <div className="font-semibold text-slate-800 mt-0.5">{a.title}</div>
                        <p className="text-slate-500 mt-0.5 leading-snug">{a.message}</p>
                        <div className="flex gap-3 mt-1.5">
                          {a.surgeId && (
                            <Link to={`/admin/surges/${a.surgeId}`} onClick={() => setOpen(false)} className="text-indigo-600 font-semibold hover:underline">
                              View surge →
                            </Link>
                          )}
                          {!a.acknowledged && (
                            <button onClick={() => ack(a._id)} className="text-slate-500 font-semibold hover:text-slate-800 cursor-pointer">
                              Acknowledge
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Pop-up toasts */}
      <div className="fixed bottom-5 right-5 z-50 space-y-3 w-96 max-w-[calc(100vw-2.5rem)]">
        {toasts.map(a => {
          const st = LEVEL_STYLE[a.level] || LEVEL_STYLE.warning;
          return (
            <div key={a._id} className={`border-l-4 ${st.toast} rounded-xl shadow-xl p-4 text-xs bg-white`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className={`font-black uppercase tracking-wider text-[10px] ${st.text}`}>
                    {a.level === "critical" ? "🚨 " : "⚠️ "}{st.label}
                  </div>
                  <div className="font-bold text-slate-800 mt-0.5">{a.title}</div>
                  <p className="text-slate-600 mt-1 leading-snug">{a.message}</p>
                </div>
                <button onClick={() => setToasts(prev => prev.filter(t => t._id !== a._id))} className="text-slate-400 hover:text-slate-700 cursor-pointer">✕</button>
              </div>
              <div className="flex gap-3 mt-2">
                {a.surgeId && (
                  <Link to={`/admin/surges/${a.surgeId}`} className="text-indigo-600 font-semibold hover:underline">View surge →</Link>
                )}
                <button onClick={() => ack(a._id)} className="text-slate-500 font-semibold hover:text-slate-800 cursor-pointer">Acknowledge</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default SurgeAlertBell;
