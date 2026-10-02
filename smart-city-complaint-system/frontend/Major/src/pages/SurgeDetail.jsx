import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

function SurgeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSurgeDetail = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/analytics/surges/${id}`);
        const result = await res.json();
        if (result.success) {
          setData(result);
        } else {
          setError(result.message || "Surge not found");
        }
      } catch (err) {
        setError("Failed to fetch surge details");
      } finally {
        setLoading(false);
      }
    };
    fetchSurgeDetail();
  }, [id]);

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 bg-slate-950 min-h-screen">
        Loading spatial surge metrics and member complaints...
      </div>
    );
  }

  if (error || !data || !data.surge) {
    return (
      <div className="p-12 text-center text-red-400 bg-slate-950 min-h-screen space-y-4">
        <p className="text-lg font-bold">{error || "Surge not found"}</p>
        <button
          onClick={() => navigate("/admin/surges/history")}
          className="px-4 py-2 bg-slate-800 text-slate-200 rounded-xl hover:bg-slate-700"
        >
          ← Back to Surge History
        </button>
      </div>
    );
  }

  const { surge, memberComplaints } = data;
  const isActive = surge.status === "active";
  const expected10m = surge.expectedBaseline10min || 1.0;
  const pValFormatted = surge.minP !== undefined && surge.minP < 0.001 ? "p < 0.001" : `p = ${(surge.minP || 0.001).toFixed(4)}`;
  const zScoreFormatted = surge.peakZ ? surge.peakZ.toFixed(2) : "N/A";

  return (
    <div className="p-8 space-y-8 bg-slate-950 min-h-screen text-slate-100">
      
      {/* Navigation Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/admin/surges/history")}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            ← Back
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white capitalize">
                {surge.category} Spatial Surge Event
              </h1>
              {isActive ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/30">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                  ACTIVE SURGE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  RESOLVED
                </span>
              )}
            </div>
            <p className="text-slate-400 text-xs mt-1 font-mono">
              H3 Res 8 Center Cell: <span className="text-indigo-300">{surge.cellId}</span> | Neighborhood: 7 cells cluster
            </p>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Stat 1: Observed Complaints */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Observed (10-min Window)</span>
          <div className="text-3xl font-extrabold text-white flex items-baseline gap-2">
            {surge.complaintCount} <span className="text-sm font-normal text-slate-400">reports</span>
          </div>
          <p className="text-xs text-slate-400">Total verified in 7-cell disk</p>
        </div>

        {/* Stat 2: Expected Shrunk Baseline */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Expected Baseline (10-min)</span>
          <div className="text-3xl font-extrabold text-indigo-400 flex items-baseline gap-2">
            {expected10m.toFixed(2)} <span className="text-sm font-normal text-slate-400">reports</span>
          </div>
          <p className="text-xs text-slate-400">Empirical Bayes Shrinkage (k=20)</p>
        </div>

        {/* Stat 3: Poisson Significance & Z-score */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Statistical Hypothesis</span>
          <div className="text-3xl font-extrabold text-amber-400">
            {pValFormatted}
          </div>
          <p className="text-xs text-slate-400">Poisson Tail Anomaly (Z = {zScoreFormatted})</p>
        </div>

        {/* Stat 4: Distinct Citizens */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Distinct Users</span>
          <div className="text-3xl font-extrabold text-emerald-400">
            👥 {surge.distinctUsers || 1}
          </div>
          <p className="text-xs text-slate-400">Anti-spam rule check (≥ 3 req)</p>
        </div>

      </div>

      {/* Why Flagged Explanation Box */}
      <div className="p-6 bg-gradient-to-r from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-500/30 rounded-2xl space-y-3">
        <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm uppercase tracking-wider">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Empirical Bayes Anomaly Explanation ("Why Flagged")
        </div>
        <p className="text-slate-300 text-sm leading-relaxed">
          This spatial surge was automatically flagged by UrbanPulse because <strong className="text-white">{surge.complaintCount} complaints</strong> for <strong className="text-white capitalize">{surge.category}</strong> were received within a 10-minute sliding window across the 7-cell H3 neighborhood disk (<span className="font-mono text-indigo-300">{surge.cellId}</span>). The expected shrunk baseline for this location & time slot is only <strong className="text-white">{expected10m.toFixed(2)} complaints</strong>. The Poisson tail probability is <strong className="text-amber-300">{pValFormatted}</strong> with a Poisson anomaly Z-score of <strong className="text-amber-300">Z = {zScoreFormatted}</strong>. Since observed count ≥ 5, distinct citizens ≥ 3, and p &lt; 0.01, anti-spam validation passed and all complaints in this cluster received a priority boost.
        </p>
      </div>

      {/* Member Complaints Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Cluster Member Complaints ({memberComplaints ? memberComplaints.length : 0})</h2>
          <span className="text-xs text-slate-400">Complaints in neighborhood since surge start</span>
        </div>

        {memberComplaints && memberComplaints.length > 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 text-xs uppercase font-semibold">
                <tr>
                  <th className="py-4 px-6">Complaint Description</th>
                  <th className="py-4 px-6">Citizen</th>
                  <th className="py-4 px-6">Stage-2 S2</th>
                  <th className="py-4 px-6">Surge Boost</th>
                  <th className="py-4 px-6">Final Priority</th>
                  <th className="py-4 px-6">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {memberComplaints.map((c) => (
                  <tr key={c._id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-4 px-6 text-slate-200 font-medium max-w-md truncate">
                      {c.title || c.description}
                    </td>
                    <td className="py-4 px-6 text-slate-400 text-xs">
                      {c.citizen ? c.citizen.name : "Anonymous"}
                    </td>
                    <td className="py-4 px-6 font-mono text-slate-300">
                      {c.priorityScoreS2 ? c.priorityScoreS2.toFixed(3) : "N/A"}
                    </td>
                    <td className="py-4 px-6 font-mono text-red-400 font-bold">
                      +{c.surgeStrength ? (0.20 * c.surgeStrength).toFixed(3) : "0.200"}
                    </td>
                    <td className="py-4 px-6 font-mono font-extrabold text-amber-300 text-base">
                      {c.finalPriority ? c.finalPriority.toFixed(3) : "N/A"}
                    </td>
                    <td className="py-4 px-6 text-slate-400 text-xs">
                      {new Date(c.createdAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 bg-slate-900/50 border border-slate-800 rounded-2xl text-sm">
            No active member complaints recorded in this window.
          </div>
        )}
      </div>

    </div>
  );
}

export default SurgeDetail;
