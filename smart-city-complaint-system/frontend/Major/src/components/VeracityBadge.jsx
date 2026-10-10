import { useState, useRef } from "react";
import { categoryLabel } from "../utils/labels";

const STATUS_STYLE = {
  VERIFIED: { label: "Verified", icon: "✓", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  SUSPICIOUS: { label: "Suspicious", icon: "⚠️", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  FAKE_MISMATCH: { label: "Mismatch", icon: "⛔", cls: "bg-rose-100 text-rose-800 border-rose-300" },
  LIKELY_FAKE: { label: "Likely fake", icon: "🚫", cls: "bg-rose-600 text-white border-rose-700" },
  DUPLICATE: { label: "Re-used photo", icon: "♻️", cls: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300" },
  UNVERIFIED: { label: "Unverified", icon: "•", cls: "bg-slate-100 text-slate-500 border-slate-200" }
};

/** Evidence verdict badge with an expandable panel listing why a photo was flagged. */
function VeracityBadge({ complaint: c, compact = false }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);

  const toggle = () => {
    if (!open && btnRef.current) {
      // fixed positioning so the panel is not clipped by scrollable table containers
      const r = btnRef.current.getBoundingClientRect();
      const width = 320;
      setPos({
        top: Math.min(r.bottom + 6, window.innerHeight - 340),
        left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))
      });
    }
    setOpen(o => !o);
  };
  const status = c.veracityStatus || (c.isFake ? "FAKE_MISMATCH" : "UNVERIFIED");
  const s = STATUS_STYLE[status] || STATUS_STYLE.UNVERIFIED;
  const risk = typeof c.fakeRiskScore === "number" ? c.fakeRiskScore : null;
  const match = typeof c.textImageMatch === "number" ? c.textImageMatch : null;
  const signals = (c.fakeSignals || []).filter(x => x.code !== "NO_CAMERA_DATA");

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        ref={btnRef}
        onClick={toggle}
        title={c.veracityExplanation || s.label}
        className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border shadow-sm cursor-pointer inline-flex items-center gap-1 ${s.cls}`}
      >
        <span>{s.icon}</span> {s.label}
      </button>
      {!compact && (risk !== null || c.imageCategory) && (
        <div className="mt-1 text-[10px] text-slate-400 leading-tight">
          {c.imageCategory && <div>📷 <span className="capitalize">{categoryLabel(c.imageCategory)}</span>{match !== null && ` · match ${(match * 100).toFixed(0)}%`}</div>}
          {risk !== null && risk > 0.05 && <div>fake risk {(risk * 100).toFixed(0)}%</div>}
        </div>
      )}

      {open && (
        <div
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 w-80 max-h-80 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-xs text-slate-600 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800">Evidence check</span>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">✕</button>
          </div>
          <p className="leading-snug">{c.veracityExplanation || "No details."}</p>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <div className="bg-slate-50 rounded-lg p-1.5">Text says<br /><b className="capitalize">{categoryLabel(c.rootCauseCategory || c.category)}</b></div>
            <div className="bg-slate-50 rounded-lg p-1.5">Photo shows<br /><b className="capitalize">{categoryLabel(c.imageCategory || c.clipVisualCategory)}</b></div>
            <div className="bg-slate-50 rounded-lg p-1.5">Text–photo match<br /><b>{match !== null ? `${(match * 100).toFixed(0)}%` : "—"}</b></div>
            <div className="bg-slate-50 rounded-lg p-1.5">Fake risk<br /><b>{risk !== null ? `${(risk * 100).toFixed(0)}%` : "—"}</b></div>
          </div>
          {signals.length > 0 && (
            <ul className="space-y-1">
              {signals.map((sig, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-rose-500">●</span>
                  <span><b className="text-slate-700">{sig.code.replaceAll("_", " ").toLowerCase()}</b> — {sig.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default VeracityBadge;
