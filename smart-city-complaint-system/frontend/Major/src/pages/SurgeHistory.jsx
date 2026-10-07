import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

function SurgeHistory() {
  const [surges, setSurges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [simulating, setSimulating] = useState(false);
  const [simulateMsg, setSimulateMsg] = useState(null);
  const navigate = useNavigate();

  const fetchSurges = async () => {
    try {
      setLoading(true);
      const url = statusFilter === "all" 
        ? "/analytics/surges" 
        : `/analytics/surges?status=${statusFilter}`;
      const res = await api.get(url);
      if (res.data && res.data.success) {
        setSurges(res.data.surges);
      }
    } catch (err) {
      console.error("Failed to fetch surges:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSurges();
  }, [statusFilter]);

  const handleSimulateSurge = async (category = "water") => {
    try {
      setSimulating(true);
      setSimulateMsg(null);
      const res = await api.post("/analytics/surges/simulate", {
        category,
        lat: 19.0760,
        lng: 72.8777
      });
      if (res.data && res.data.success) {
        setSimulateMsg({ type: "success", text: res.data.message });
        fetchSurges();
      } else {
        setSimulateMsg({ type: "error", text: res.data?.message || "Simulation failed" });
      }
    } catch (err) {
      console.error(err);
      setSimulateMsg({ type: "error", text: err.response?.data?.message || "Error simulating surge" });
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="p-8 space-y-8 bg-slate-950 min-h-screen text-slate-100">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">Spatial Surge History & Tracking</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              H3 Res 8 Poisson Engine
            </span>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Real-time monitoring of empirical bayes shrinkage spatial surge events across neighborhood clusters.
          </p>
        </div>

        {/* Live Demo Simulation Trigger */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleSimulateSurge("water")}
            disabled={simulating}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-medium text-sm shadow-lg shadow-red-600/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            {simulating ? "Injecting Surge..." : "🔥 Simulate Surge (Live Demo)"}
          </button>
        </div>
      </div>

      {simulateMsg && (
        <div className={`p-4 rounded-xl text-sm font-medium border flex items-center justify-between ${
          simulateMsg.type === "success" 
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
            : "bg-red-500/10 border-red-500/30 text-red-400"
        }`}>
          <span>{simulateMsg.text}</span>
          <button onClick={() => setSimulateMsg(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl">
          {["all", "active", "resolved"].map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                statusFilter === tab 
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20" 
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab} Surges
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-400">
          Total Surges Found: <span className="font-bold text-white">{surges.length}</span>
        </div>
      </div>

      {/* Surges List Table */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm bg-slate-900/50 rounded-2xl border border-slate-800">
          Loading spatial surge records...
        </div>
      ) : surges.length === 0 ? (
        <div className="p-12 text-center text-slate-400 text-sm bg-slate-900/50 rounded-2xl border border-slate-800">
          No surge events found matching filter state <span className="text-indigo-400 font-semibold">"{statusFilter}"</span>.
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 text-xs uppercase font-semibold">
                <tr>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6">H3 Cell ID</th>
                  <th className="py-4 px-6">Category</th>
                  <th className="py-4 px-6">Observed vs Peak Z</th>
                  <th className="py-4 px-6">Poisson p-val</th>
                  <th className="py-4 px-6">Distinct Users</th>
                  <th className="py-4 px-6">Started</th>
                  <th className="py-4 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {surges.map((surge) => {
                  const isActive = surge.status === "active";
                  return (
                    <tr key={surge._id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-4 px-6">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/30">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                            ACTIVE
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            RESOLVED
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 font-mono text-xs text-indigo-300">
                        {surge.cellId}
                      </td>
                      <td className="py-4 px-6 capitalize font-semibold text-slate-200">
                        {surge.category}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-base">{surge.complaintCount}</span>
                          <span className="text-xs text-slate-400">(Z = {surge.peakZ ? surge.peakZ.toFixed(2) : "N/A"})</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 font-mono text-xs text-amber-400">
                        {surge.minP !== undefined ? (surge.minP < 0.001 ? "p < 0.001" : `p = ${surge.minP.toFixed(4)}`) : "p < 0.01"}
                      </td>
                      <td className="py-4 px-6 text-slate-300 font-medium">
                        👥 {surge.distinctUsers || 1} citizens
                      </td>
                      <td className="py-4 px-6 text-slate-400 text-xs">
                        {new Date(surge.startedAt).toLocaleString()}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => navigate(`/admin/surges/${surge._id}`)}
                          className="px-3.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-xs font-semibold border border-indigo-500/30 transition-all cursor-pointer"
                        >
                          View Analytics →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

export default SurgeHistory;
