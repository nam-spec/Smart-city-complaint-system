import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import api, { BACKEND_URL } from "../api/axios";
import { Link } from "react-router-dom";

const safeFormatNumber = (val, decimals = 2) => {
  const num = Number(val);
  if (isNaN(num)) return (0).toFixed(decimals);
  return num.toFixed(decimals);
};

function Home() {
  const [complaints, setComplaints] = useState([]);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    api.get("/complaints")
      .then((res) => {
        setComplaints(res.data || []);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const total = complaints.length;
  const pending = complaints.filter(c => c.status === "Pending").length;
  const inProgress = complaints.filter(c => c.status === "In Progress").length;
  const resolved = complaints.filter(c => c.status === "Resolved").length;

  const totalPages = Math.max(1, Math.ceil(complaints.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedComplaints = complaints.slice(startIndex, startIndex + itemsPerPage);

  const getPriorityBadgeColor = (score) => {
    const num = Number(score) || 0;
    if (num >= 0.75) return "bg-red-50 text-red-700 border-red-100";
    if (num >= 0.45) return "bg-amber-50 text-amber-700 border-amber-100";
    return "bg-emerald-50 text-emerald-700 border-emerald-100";
  };

  const getPriorityText = (score) => {
    const num = Number(score) || 0;
    if (num >= 0.75) return "Critical Priority";
    if (num >= 0.45) return "Medium Priority";
    return "Standard Priority";
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 sm:p-8 font-sans">

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
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 uppercase text-[10px] tracking-wider font-bold bg-slate-50/20">
                    <th className="px-6 py-3">Description</th>
                    <th className="px-6 py-3">Category</th>
                    <th className="px-6 py-3">Priority Level</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedComplaints.map((c) => {
                    const score = c.freshFinalPriority || c.finalPriority || c.priorityScoreS2 || 0;
                    return (
                      <tr 
                        key={c._id} 
                        onClick={() => setSelectedComplaint(c)}
                        className="hover:bg-slate-50/80 cursor-pointer transition-colors duration-200"
                      >
                        <td className="px-6 py-4.5 font-medium text-slate-800 max-w-sm truncate">
                          {c.title || c.description}
                        </td>
                        <td className="px-6 py-4.5">
                          <span className="capitalize font-semibold text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60">
                            {c.category}
                          </span>
                        </td>
                        <td className="px-6 py-4.5">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getPriorityBadgeColor(score)}`}>
                            {getPriorityText(score)}
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
                            {c.status || "Pending"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
              <div>
                Showing <strong className="text-slate-800">{startIndex + 1}</strong> to <strong className="text-slate-800">{Math.min(startIndex + itemsPerPage, complaints.length)}</strong> of <strong className="text-slate-800">{complaints.length}</strong> complaints
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  ← Previous
                </button>

                <div className="flex items-center gap-1 px-2">
                  <span className="font-semibold text-slate-700">Page {currentPage}</span>
                  <span className="text-slate-400">of {totalPages}</span>
                </div>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  Next →
                </button>
              </div>
            </div>
          </>
        )}

      </div>

      {/* Relevant Citizen Complaint Details Modal */}
      {selectedComplaint && createPortal(
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[99999]"
          onClick={() => setSelectedComplaint(null)}
        >
          <div 
            className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl my-auto relative z-[100000]"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Grievance Report Details</h3>
                <span className="text-xs text-slate-400">Reference ID: {selectedComplaint._id?.slice(-8)}</span>
              </div>
              <button 
                onClick={() => setSelectedComplaint(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg transition hover:bg-slate-100 cursor-pointer"
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Relevant Citizen Content */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              
              {/* Description */}
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Report Description</span>
                <p className="text-slate-800 text-sm leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100 font-medium">
                  {selectedComplaint.description || selectedComplaint.title}
                </p>
              </div>

              {/* Status & Priority Row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                
                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Category</span>
                  <span className="capitalize font-bold text-slate-800 text-xs block">{selectedComplaint.category || "Unclassified"}</span>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Current Status</span>
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                    selectedComplaint.status === "Resolved"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                      : selectedComplaint.status === "In Progress"
                      ? "bg-blue-50 text-blue-700 border-blue-100"
                      : "bg-amber-50 text-amber-700 border-amber-100"
                  }`}>
                    {selectedComplaint.status || "Pending"}
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl space-y-1 col-span-2 sm:col-span-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Priority Level</span>
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border ${getPriorityBadgeColor(selectedComplaint.freshFinalPriority || selectedComplaint.finalPriority || selectedComplaint.priorityScoreS2)}`}>
                    {getPriorityText(selectedComplaint.freshFinalPriority || selectedComplaint.finalPriority || selectedComplaint.priorityScoreS2)}
                  </span>
                </div>

              </div>

              {/* Location & Timestamps */}
              <div className="p-4 bg-indigo-50/30 border border-indigo-100/60 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">📍 Geo Location Coordinates:</span>
                  <span className="font-semibold text-slate-800 font-mono">
                    {safeFormatNumber(selectedComplaint.latitude, 4)}, {safeFormatNumber(selectedComplaint.longitude, 4)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs border-t border-indigo-100/50 pt-2">
                  <span className="text-slate-500">🗓️ Date Submitted:</span>
                  <span className="font-semibold text-slate-700">
                    {selectedComplaint.createdAt ? new Date(selectedComplaint.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "N/A"}
                  </span>
                </div>
                {selectedComplaint.resolvedAt && (
                  <div className="flex items-center justify-between text-xs border-t border-indigo-100/50 pt-2">
                    <span className="text-slate-500">✓ Resolution Date:</span>
                    <span className="font-semibold text-emerald-700">
                      {new Date(selectedComplaint.resolvedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </div>
                )}
              </div>

              {/* Uploaded Evidence Image */}
              {selectedComplaint.imagePath ? (
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Uploaded Evidence Image</span>
                  <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-900/5">
                    <img
                      src={`${BACKEND_URL}/${selectedComplaint.imagePath}`}
                      alt="Complaint Evidence"
                      className="w-full max-h-52 object-contain mx-auto"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-100/50 border border-slate-200 border-dashed rounded-2xl text-center text-xs text-slate-400">
                  No image evidence attached to this report.
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setSelectedComplaint(null)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2 rounded-xl transition text-xs cursor-pointer shadow-sm"
              >
                Close Details
              </button>
            </div>

          </div>

        </div>,
        document.body
      )}

    </div>
  );
}

export default Home;