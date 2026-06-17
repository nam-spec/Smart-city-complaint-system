import { useEffect, useState } from "react";
import api, { BACKEND_URL } from "../api/axios";
import { Link } from "react-router-dom";

function Home() {
  const [complaints, setComplaints] = useState([]);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/complaints")
      .then((res) => {
        setComplaints(res.data);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const total = complaints.length;
  const pending = complaints.filter(c => c.status === "Pending").length;
  const inProgress = complaints.filter(c => c.status === "In Progress").length;
  const resolved = complaints.filter(c => c.status === "Resolved").length;

  const getPriorityBadgeColor = (score) => {
    if (score >= 0.75) return "bg-red-50 text-red-700 border-red-100";
    if (score >= 0.45) return "bg-amber-50 text-amber-700 border-amber-100";
    return "bg-emerald-50 text-emerald-700 border-emerald-100";
  };

  const getPriorityText = (score) => {
    if (score >= 0.75) return "Critical Priority";
    if (score >= 0.45) return "Medium Priority";
    return "Standard Priority";
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 sm:p-8 font-sans animate-fade-in">

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 bg-white border border-slate-200/80 p-6 rounded-2xl shadow-sm">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Citizen Dashboard
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Submit tag-based reports and track spatio-temporal prioritization statuses in real time.
          </p>
        </div>

        <Link
          to="/submit"
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold transition shadow-md shadow-indigo-600/10 hover:scale-[1.01] text-sm cursor-pointer"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Report New Complaint
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        
        <div className="bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm relative overflow-hidden group hover:border-indigo-100 transition">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-bl-[80px] -z-10 group-hover:scale-105 transition duration-300"></div>
          <span className="text-xs uppercase font-bold tracking-wider text-slate-400">Total Registered</span>
          <p className="text-3xl font-black text-slate-800 mt-2">{total}</p>
        </div>

        <div className="bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm relative overflow-hidden group hover:border-amber-100 transition">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 rounded-bl-[80px] -z-10 group-hover:scale-105 transition duration-300"></div>
          <span className="text-xs uppercase font-bold tracking-wider text-slate-400">Pending Review</span>
          <p className="text-3xl font-black text-amber-600 mt-2">{pending}</p>
        </div>

        <div className="bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm relative overflow-hidden group hover:border-blue-100 transition">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-[80px] -z-10 group-hover:scale-105 transition duration-300"></div>
          <span className="text-xs uppercase font-bold tracking-wider text-slate-400">In Progress</span>
          <p className="text-3xl font-black text-blue-600 mt-2">{inProgress}</p>
        </div>

        <div className="bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm relative overflow-hidden group hover:border-emerald-100 transition">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-[80px] -z-10 group-hover:scale-105 transition duration-300"></div>
          <span className="text-xs uppercase font-bold tracking-wider text-slate-400">Resolved Complaints</span>
          <p className="text-3xl font-black text-emerald-600 mt-2">{resolved}</p>
        </div>

      </div>

      {/* Main content grid: List of complaints */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
        
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="font-bold text-slate-800">
            Registered Service Grievances
          </h2>
          <span className="text-xs text-slate-400 font-medium">Click on a complaint to view details</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading complaints...</div>
        ) : complaints.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            No complaints submitted yet. Click "Report New Complaint" above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase text-[10px] tracking-wider font-bold bg-slate-50/20">
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3">STSEP Priority</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {complaints.map((c) => (
                  <tr 
                    key={c._id} 
                    onClick={() => setSelectedComplaint(c)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors duration-200"
                  >
                    <td className="px-6 py-4.5 font-medium text-slate-800 max-w-sm truncate">
                      {c.description}
                    </td>
                    <td className="px-6 py-4.5">
                      <span className="capitalize font-semibold text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60">
                        {c.category}
                      </span>
                    </td>
                    <td className="px-6 py-4.5">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getPriorityBadgeColor(c.priorityScoreS2)}`}>
                        {c.priorityScoreS2?.toFixed(2)} - {getPriorityText(c.priorityScoreS2)}
                      </span>
                    </td>
                    <td className="px-6 py-4.5">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                          c.status === "Resolved"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : c.status === "In Progress"
                            ? "bg-blue-50 text-blue-700 border-blue-100"
                            : "bg-amber-50 text-amber-700 border-amber-100"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* Details Modal */}
      {selectedComplaint && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-fade-in">
            
            {/* Modal Header */}
            <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-black text-slate-800 text-lg">Grievance Analysis Breakdown</h3>
              <button 
                onClick={() => setSelectedComplaint(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition hover:bg-slate-100 cursor-pointer"
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              
              {/* Description */}
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Report Description</span>
                <p className="text-slate-800 text-sm leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  {selectedComplaint.description}
                </p>
              </div>

              {/* Grid: Coordinates & Category */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Spatio-Location Coordinates</span>
                  <span className="text-xs text-slate-700 font-semibold block">Lat: {selectedComplaint.latitude?.toFixed(5)}</span>
                  <span className="text-xs text-slate-700 font-semibold block">Lng: {selectedComplaint.longitude?.toFixed(5)}</span>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Model Classification</span>
                  <span className="capitalize text-slate-800 font-bold block text-sm">{selectedComplaint.category}</span>
                  <span className="text-[10px] text-slate-400">Classified using ML Pipeline</span>
                </div>
              </div>

              {/* STSEP Engine Priority Signal Breakdown */}
              <div className="border border-slate-100 rounded-2xl p-5 space-y-4">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block border-b pb-2">Spatio-Temporal priority engine (STSEP) signals</span>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Severity Score</span>
                    <strong className="text-slate-700 text-sm">{(selectedComplaint.severityScore || 0).toFixed(2)}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Spatial Density</span>
                    <strong className="text-slate-700 text-sm">{selectedComplaint.spatialDensity || 0} pts</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Temporal Density</span>
                    <strong className="text-slate-700 text-sm">{selectedComplaint.temporalDensity || 0} pts</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Acceleration</span>
                    <strong className="text-slate-700 text-sm">{(selectedComplaint.acceleration || 0).toFixed(2)}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-3 mt-1">
                  <div className="p-2.5 bg-indigo-50/40 rounded-xl">
                    <span className="text-[10px] text-indigo-500 font-semibold block">Stage-1 Priority Score (CV-Weighted)</span>
                    <span className="text-lg font-black text-indigo-600">{(selectedComplaint.priorityScore || 0).toFixed(2)}</span>
                  </div>
                  <div className="p-2.5 bg-violet-50/40 rounded-xl">
                    <span className="text-[10px] text-violet-500 font-semibold block">Stage-2 Rank (NDCG-Weighted)</span>
                    <span className="text-lg font-black text-violet-600">{(selectedComplaint.priorityScoreS2 || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Image & metadata */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Complaint Metadata</span>
                  <div className="text-xs text-slate-500 space-y-1">
                    <div>Submitted: {new Date(selectedComplaint.createdAt).toLocaleString()}</div>
                    <div>Status: <span className="font-semibold text-slate-700">{selectedComplaint.status}</span></div>
                    {selectedComplaint.resolvedAt && (
                      <div>Resolved: {new Date(selectedComplaint.resolvedAt).toLocaleString()}</div>
                    )}
                  </div>
                </div>

                {/* Evidence Image */}
                {selectedComplaint.imagePath ? (
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Uploaded Evidence</span>
                    <img
                      src={`${BACKEND_URL}/${selectedComplaint.imagePath}`}
                      alt="Evidence Upload"
                      className="w-full h-36 object-cover rounded-2xl border border-slate-100 shadow-sm"
                    />
                  </div>
                ) : (
                  <div className="p-4 bg-slate-100/50 border border-slate-200 border-dashed rounded-2xl text-center text-xs text-slate-400">
                    No image uploaded (Seeded historical record)
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setSelectedComplaint(null)}
                className="bg-slate-800 hover:bg-slate-900 text-white font-semibold px-4.5 py-2 rounded-xl transition text-xs cursor-pointer"
              >
                Close Details
              </button>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}

export default Home;