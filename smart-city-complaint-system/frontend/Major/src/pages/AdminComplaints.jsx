import { useEffect, useState } from "react";
import api, { BACKEND_URL } from "../api/axios";

function AdminComplaints() {
  const [complaints, setComplaints] = useState([]);
  const [filteredComplaints, setFilteredComplaints] = useState([]);
  const [activeSurges, setActiveSurges] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/complaints"),
      api.get("/analytics/surges?status=active").catch(() => ({ data: { surges: [] } }))
    ])
      .then(([compRes, surgeRes]) => {
        setComplaints(compRes.data);
        setFilteredComplaints(compRes.data);
        setActiveSurges(surgeRes.data.surges || []);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let result = complaints;

    if (searchTerm) {
      result = result.filter(c => 
        c.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (categoryFilter !== "all") {
      result = result.filter(c => c.category === categoryFilter);
    }

    if (statusFilter !== "all") {
      result = result.filter(c => c.status === statusFilter);
    }

    setFilteredComplaints(result);
  }, [searchTerm, categoryFilter, statusFilter, complaints]);

  const handleStatusChange = (id, newStatus) => {
    api.patch(`/complaints/${id}/status`, { status: newStatus })
      .then(() => {
        setComplaints(prev => 
          prev.map(item => 
            item._id === id 
              ? { ...item, status: newStatus, resolvedAt: newStatus === "Resolved" ? new Date() : null } 
              : item
          )
        );
      })
      .catch(err => console.error("Error updating status:", err));
  };

  const getPriorityColor = (score) => {
    if (score >= 0.75) return "bg-red-50 text-red-700 border-red-100";
    if (score >= 0.45) return "bg-amber-50 text-amber-700 border-amber-100";
    return "bg-emerald-50 text-emerald-700 border-emerald-100";
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-50 text-slate-450">
        <div className="space-y-2 text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-semibold">Loading backlog database...</p>
        </div>
      </div>
    );
  }

  const categories = [...new Set(complaints.map(c => c.category))];

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50/50">
      
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200/80 px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 leading-none">Grievance Backlog</h1>
          <p className="text-xs text-slate-400 mt-1.5">Manage and update status of all submitted public reports.</p>
        </div>
      </header>

      {/* Main Backlog List */}
      <main className="p-8 space-y-6">

        {/* Active Surge Banner */}
        {activeSurges.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center justify-between text-red-900">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-red-600 animate-ping"></span>
              <div>
                <span className="font-bold text-xs uppercase tracking-wider text-red-700">Active Spatial Surges Detected</span>
                <p className="text-xs text-slate-700 mt-0.5">
                  {activeSurges.length} active complaint surge{activeSurges.length > 1 ? "s" : ""} in progress. Dynamic priority boost (+0.20 × strength) active on affected neighborhood complaints.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {activeSurges.map(s => (
                <span key={s._id} className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-red-600 text-white shadow-sm">
                  {s.category} (Peak Z: {s.peakZ})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Filter controls panel */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Search backlog</span>
            <input
              type="text"
              placeholder="Search descriptions..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all w-64"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Category</span>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="all">All Categories</option>
                {categories.map((c, i) => (
                  <option key={i} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Status</span>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Resolved">Resolved</option>
              </select>
            </div>
          </div>
        </div>

        {/* Complaints Table */}
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase text-[10px] tracking-wider font-bold bg-slate-50/20">
                  <th className="px-6 py-4">Evidence</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Lat, Lng Coordinates</th>
                  <th className="px-6 py-4">Final Queue Score</th>
                  <th className="px-6 py-4">CLIP Veracity</th>
                  <th className="px-6 py-4">Submitted On</th>
                  <th className="px-6 py-4">Status & Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredComplaints.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center py-12 text-slate-450">
                      No complaints matched the filter criteria
                    </td>
                  </tr>
                ) : (
                  filteredComplaints.map((c) => {
                    const finalScore = c.freshFinalPriority || c.finalPriority || c.priorityScoreS2 || 0;
                    const isSurge = c.surgeFlag || (c.surgeId && c.surgeId.status === "active");

                    return (
                    <tr key={c._id} className="hover:bg-slate-50/40 transition-colors">
                      
                      {/* Image evidence */}
                      <td className="px-6 py-4">
                        {c.imagePath ? (
                          <img
                            src={`${BACKEND_URL}/${c.imagePath}`}
                            alt="complaint evidence"
                            className="w-11 h-11 object-cover rounded-xl border border-slate-100 shadow-sm"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-slate-100/80 border border-slate-200/50 flex flex-col items-center justify-center text-[8px] text-slate-400 font-bold leading-none text-center">
                            <span>Seeded</span>
                            <span>Record</span>
                          </div>
                        )}
                      </td>

                      {/* Description */}
                      <td className="px-6 py-4 font-medium text-slate-800 max-w-xs truncate" title={c.description}>
                        {c.description}
                      </td>

                      {/* Category */}
                      <td className="px-6 py-4">
                        <span className="capitalize font-semibold text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60">
                          {c.category}
                        </span>
                      </td>

                      {/* Coordinates */}
                      <td className="px-6 py-4 text-xs font-mono text-slate-500">
                        {c.latitude?.toFixed(4)}, {c.longitude?.toFixed(4)}
                      </td>

                      {/* Priority Score & Surge Badge */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-black border ${getPriorityColor(finalScore)}`}>
                            {finalScore.toFixed(3)}
                          </span>
                          {isSurge && (
                            <span 
                              title={`${c.observedCount || 6} reports vs ${c.expectedCount ? Number(c.expectedCount).toFixed(2) : "1.00"} normal, p < 0.001`}
                              className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-red-600 text-white animate-pulse shadow-sm cursor-help"
                            >
                              SURGE
                            </span>
                          )}
                        </div>
                      </td>

                      {/* CLIP Veracity Status */}
                      <td className="px-6 py-4">
                        {c.isFake || c.veracityStatus === "FAKE_MISMATCH" ? (
                          <span 
                            title={c.veracityExplanation || "CLIP cross-modal image-text mismatch"}
                            className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-300 shadow-sm cursor-help inline-flex items-center gap-1"
                          >
                            <span>⚠️</span> FAKE / MISMATCH
                          </span>
                        ) : c.veracityStatus === "SUSPICIOUS" ? (
                          <span 
                            title={c.veracityExplanation || "CLIP low cross-modal similarity"}
                            className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-50 text-amber-800 border border-amber-200 cursor-help inline-flex items-center gap-1"
                          >
                            <span>⚠️</span> SUSPICIOUS
                          </span>
                        ) : c.veracityStatus === "VERIFIED" ? (
                          <span 
                            title={`CLIP Similarity: ${((c.veracityScore || 1.0) * 100).toFixed(1)}% (${c.clipVisualCategory || c.category})`}
                            className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-help inline-flex items-center gap-1"
                          >
                            <span>✓</span> VERIFIED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] text-slate-400 bg-slate-100">
                            UNVERIFIED
                          </span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="px-6 py-4 text-xs text-slate-400">
                        {new Date(c.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric"
                        })}
                      </td>

                      {/* Status Action select */}
                      <td className="px-6 py-4">
                        <select
                          value={c.status}
                          onChange={(e) => handleStatusChange(c._id, e.target.value)}
                          className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs text-slate-700 focus:outline-none cursor-pointer hover:border-slate-350 transition"
                        >
                          <option value="Pending">Pending</option>
                          <option value="In Progress">In Progress</option>
                        </select>
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>

        </div>

      </main>
    </div>
  );
}

export default AdminComplaints;
