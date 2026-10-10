import { useEffect, useMemo, useRef, useState } from "react";
import api, { BACKEND_URL } from "../api/axios";
import VeracityBadge from "./VeracityBadge";
import { languageLabel, categoryLabel } from "../utils/labels";
import { complaintMatches } from "../utils/complaintSearch";

const pretty = categoryLabel;

const STATUS_DOT = {
  VERIFIED: "bg-emerald-500", SUSPICIOUS: "bg-amber-400", FAKE_MISMATCH: "bg-rose-500",
  LIKELY_FAKE: "bg-rose-600", DUPLICATE: "bg-fuchsia-500", UNVERIFIED: "bg-slate-300"
};

/**
 * Global complaint search in the admin top bar.
 * Searches description, English translation, category / root cause / symptom, photo category,
 * language, status, evidence verdict, citizen name/email and complaint ID.
 * Clicking a result opens the full complaint with its photo and evidence check.
 */
function ComplaintSearch() {
  const [complaints, setComplaints] = useState([]);
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await api.get("/complaints");
      setComplaints(Array.isArray(res.data) ? res.data : []);
      setLoadedAt(Date.now());
    } catch (e) {
      console.error("Search: failed to load complaints", e);
    } finally {
      setLoading(false);
    }
  };

  // reload on focus if data is older than 20 s, so newly uploaded complaints show up
  const onFocus = () => {
    setOpen(true);
    if (Date.now() - loadedAt > 20000) refresh();
  };

  useEffect(() => {
    const close = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    const shortcut = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setOpen(false);
        setSelected(null);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", shortcut);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", shortcut);
    };
  }, []);

  const results = useMemo(() => {
    const q = query.trim();
    const list = q ? complaints.filter(c => complaintMatches(c, q)) : complaints;
    return [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 30);
  }, [complaints, query]);

  const total = query.trim() ? complaints.filter(c => complaintMatches(c, query.trim())).length : complaints.length;

  return (
    <>
      <div ref={boxRef} className="relative flex-1 max-w-xl">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onFocus={onFocus}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            placeholder="Search complaints - text, category, language, 'fake', status, ID…  (Ctrl+K)"
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-100/80 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          />
        </div>

        {open && (
          <div className="absolute left-0 right-0 mt-2 z-50 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
              <span>
                {loading ? "Loading…" : `${total} complaint${total === 1 ? "" : "s"}${query.trim() ? " found" : " (newest first)"}`}
              </span>
              <button onClick={refresh} className="font-semibold text-indigo-600 hover:underline cursor-pointer">Refresh</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
              {!loading && results.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-400">No complaints match “{query}”.</div>
              )}
              {results.map(c => (
                <button
                  key={c._id}
                  onClick={() => { setSelected(c); setOpen(false); }}
                  className="w-full text-left px-4 py-2.5 flex gap-3 items-center hover:bg-indigo-50/50 transition cursor-pointer"
                >
                  {c.imagePath ? (
                    <img src={`${BACKEND_URL}/${c.imagePath}`} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-100 shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-slate-100 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-800 truncate">{c.description}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
                      <span className="capitalize font-semibold text-slate-600">{pretty(c.rootCauseCategory || c.category)}</span>
                      {c.language && c.language !== "en" && <span className="text-indigo-500">{languageLabel(c.language)}</span>}
                      <span>{c.status}</span>
                      <span className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[c.veracityStatus] || "bg-slate-300"}`} />
                        {pretty(c.veracityStatus || "UNVERIFIED").toLowerCase()}
                      </span>
                      <span>{new Date(c.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-mono text-slate-400">#{selected._id}</div>
                <h2 className="text-lg font-extrabold text-slate-800 capitalize">{pretty(selected.rootCauseCategory || selected.category)} complaint</h2>
                <div className="text-xs text-slate-400">
                  {new Date(selected.createdAt).toLocaleString()} · {selected.citizen?.name || "Citizen"} · {selected.status}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700 text-lg cursor-pointer">✕</button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                {selected.imagePath ? (
                  <a href={`${BACKEND_URL}/${selected.imagePath}`} target="_blank" rel="noreferrer">
                    <img src={`${BACKEND_URL}/${selected.imagePath}`} alt="evidence" className="w-full max-h-80 object-contain rounded-2xl border border-slate-200 bg-slate-50" />
                  </a>
                ) : (
                  <div className="h-48 rounded-2xl bg-slate-100 flex items-center justify-center text-xs text-slate-400">No image</div>
                )}
                <div className="mt-3"><VeracityBadge complaint={selected} /></div>
              </div>
              <div className="space-y-3 text-xs">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Description</div>
                  <p className="text-sm text-slate-800 mt-0.5">{selected.description}</p>
                  {selected.englishGloss && selected.language !== "en" && (
                    <p className="text-[11px] text-slate-400 mt-1">Understood as: {selected.englishGloss}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Info label="Language" value={languageLabel(selected.language) || "—"} />
                  <Info label="Root cause" value={pretty(selected.rootCauseCategory || selected.category)} />
                  <Info label="Symptom" value={pretty(selected.symptomCategory)} />
                  <Info label="Text confidence" value={selected.textConfidence ? `${(selected.textConfidence * 100).toFixed(0)}%` : "—"} />
                  <Info label="Photo shows" value={pretty(selected.imageCategory || selected.clipVisualCategory)} />
                  <Info label="Text–photo match" value={typeof selected.textImageMatch === "number" ? `${(selected.textImageMatch * 100).toFixed(0)}%` : "—"} />
                  <Info label="Fake risk" value={typeof selected.fakeRiskScore === "number" ? `${(selected.fakeRiskScore * 100).toFixed(0)}%` : "—"} />
                  <Info label="Severity" value={selected.severityScore?.toFixed?.(2) ?? "—"} />
                  <Info label="Queue score" value={(selected.freshFinalPriority ?? selected.finalPriority ?? 0).toFixed(3)} />
                  <Info label="Surge" value={selected.surgeFlag ? `Yes (${selected.observedCount} vs ${Number(selected.expectedCount || 0).toFixed(2)} expected)` : "No"} />
                </div>
                {selected.causeText && (
                  <div className="text-[11px] text-slate-500">Cause found in text: “{selected.causeText}”</div>
                )}
                {selected.needsManualReview && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-2 font-semibold">Needs manual review</div>
                )}
                <div className="text-[10px] text-slate-400 font-mono">
                  {selected.latitude?.toFixed(5)}, {selected.longitude?.toFixed(5)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Info({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-xl p-2">
      <div className="text-[10px] uppercase font-bold text-slate-400">{label}</div>
      <div className="font-semibold text-slate-800 capitalize">{value}</div>
    </div>
  );
}

export default ComplaintSearch;
