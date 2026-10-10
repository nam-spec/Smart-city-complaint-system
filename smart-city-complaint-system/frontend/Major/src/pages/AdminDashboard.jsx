import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { complaintMatches } from "../utils/complaintSearch";
import api from "../api/axios";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

/* ───────────────── Icons ───────────────── */

const Icon = ({ d, size = 18, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={d} />
  </svg>
);

const Icons = {
  total:
    "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  resolved: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  pending: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  avgtime: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  surge: "M13 2L3 14h9l-1 8 10-12h-9l1-8z"
};

const CHART_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#64748b",
];

const getPriorityColor = (score) => {
  if (score >= 0.75) return "bg-red-50 text-red-700 border-red-100";
  if (score >= 0.45) return "bg-amber-50 text-amber-700 border-amber-100";
  return "bg-emerald-50 text-emerald-700 border-emerald-100";
};

/* ───────────────── Components ───────────────── */

const StatCard = ({ label, value, iconPath, accent, onClick }) => (
  <div 
    onClick={onClick}
    className={`bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm relative overflow-hidden group ${onClick ? "cursor-pointer hover:border-indigo-300 transition-all" : ""}`}
  >
    <div className="flex justify-between items-center relative z-10">
      <div>
        <p className="text-xs uppercase font-bold tracking-wider text-slate-400">{label}</p>
        <p className="text-2xl font-black text-slate-800 mt-2">{value ?? "—"}</p>
      </div>
      <div
        className={`flex items-center justify-center w-10 h-10 rounded-xl text-white shadow-md ${accent}`}
      >
        <Icon d={iconPath} />
      </div>
    </div>
  </div>
);

const SectionCard = ({ title, children }) => (
  <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
    <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 font-bold text-slate-800">
      {title}
    </div>
    <div className="p-6">{children}</div>
  </div>
);

/* ───────────────── Dashboard ───────────────── */

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [categoryData, setCategoryData] = useState([]);
  const [avgTime, setAvgTime] = useState(0);
  const [complaints, setComplaints] = useState([]);
  const [filteredComplaints, setFilteredComplaints] = useState([]);
  const [activeSurges, setActiveSurges] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchDashboardData = async () => {
    try {
      const [b, c, comp, avg, surgesRes] = await Promise.all([
        api.get("/analytics/basic"),
        api.get("/analytics/categories"),
        api.get("/complaints"),
        api.get("/analytics/avg-resolution-time"),
        api.get("/analytics/surges?status=active").catch(() => ({ data: { surges: [] } }))
      ]);

      setStats(b.data);
      setCategoryData(c.data);
      setComplaints(comp.data);
      setFilteredComplaints(comp.data);
      setAvgTime(avg.data.averageResolutionHours);
      if (surgesRes.data && surgesRes.data.surges) {
        setActiveSurges(surgesRes.data.surges);
      }
    } catch (err) {
      console.error("Dashboard data load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    let result = complaints;

    if (searchTerm) {
      result = result.filter(c => complaintMatches(c, searchTerm));
    }

    if (categoryFilter !== "all") {
      result = result.filter(c => c.category === categoryFilter);
    }

    if (statusFilter !== "all") {
      result = result.filter(c => c.status === statusFilter);
    }

    setFilteredComplaints(result);
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, statusFilter, complaints]);

  const handleStatusChange = (id, newStatus) => {
    api.patch(`/complaints/${id}/status`, { status: newStatus })
      .then(() => {
        setComplaints(prev => 
          prev.map(c => c._id === id ? { ...c, status: newStatus, resolvedAt: newStatus === "Resolved" ? new Date() : null } : c)
        );
        api.get("/analytics/basic").then(res => setStats(res.data));
        api.get("/analytics/avg-resolution-time").then(res => setAvgTime(res.data.averageResolutionHours));
      })
      .catch(err => console.error("Error updating status:", err));
  };

  const handleSimulateSurge = async () => {
    try {
      setSimulating(true);
      const res = await api.post("/analytics/surges/simulate", { category: "water", lat: 19.0760, lng: 72.8777 });
      if (res.data && res.data.success) {
        await fetchDashboardData();
      }
    } catch (err) {
      console.error("Failed to simulate surge:", err);
    } finally {
      setSimulating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-50 text-slate-400">
        <div className="space-y-2 text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-semibold">Loading UrbanPulse Dashboard...</p>
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
          <h1 className="text-2xl font-black text-slate-900 leading-none">Control Tower</h1>
          <p className="text-xs text-slate-400 mt-1.5">Welcome back, Admin 👋</p>
        </div>
        <button
          onClick={handleSimulateSurge}
          disabled={simulating}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs shadow-md shadow-red-600/20 transition-all cursor-pointer disabled:opacity-50"
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
          {simulating ? "Injecting Surge..." : "🔥 Simulate Surge (Live Demo)"}
        </button>
      </header>

      {/* Page Content */}
      <main className="p-8 space-y-8 animate-fade-in">

        {/* Active Surges Red Banner */}
        {activeSurges.length > 0 && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white shadow-lg shadow-red-600/20 flex flex-col sm:flex-row items-center justify-between gap-4 animate-pulse">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔥</span>
              <div>
                <h3 className="font-extrabold text-sm uppercase tracking-wide">
                  {activeSurges.length} Active Spatial Surge{activeSurges.length > 1 ? "s" : ""} Detected!
                </h3>
                <p className="text-xs text-red-100">
                  Empirical Bayes Shrinkage engine identified statistical anomaly clusters (p &lt; 0.01).
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate("/admin/surges/history")}
              className="px-4 py-2 rounded-xl bg-white text-red-700 font-bold text-xs hover:bg-red-50 transition-all cursor-pointer whitespace-nowrap shadow-sm"
            >
              View Active Surges →
            </button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            label="Total Grievances"
            value={stats?.total}
            iconPath={Icons.total}
            accent="bg-gradient-to-tr from-indigo-500 to-indigo-600 shadow-indigo-500/20"
          />
          <StatCard
            label="Active Surges"
            value={activeSurges.length}
            iconPath={Icons.surge}
            accent="bg-gradient-to-tr from-red-500 to-rose-600 shadow-red-500/20"
            onClick={() => navigate("/admin/surges/history")}
          />
          <StatCard
            label="Resolved"
            value={stats?.resolved}
            iconPath={Icons.resolved}
            accent="bg-gradient-to-tr from-emerald-500 to-emerald-600 shadow-emerald-500/20"
          />
          <StatCard
            label="Pending"
            value={stats?.pending}
            iconPath={Icons.pending}
            accent="bg-gradient-to-tr from-amber-500 to-amber-600 shadow-amber-500/20"
          />
          <StatCard
            label="Fake / Mismatches"
            value={complaints.filter(c => c.isFake || c.veracityStatus === "FAKE_MISMATCH").length}
            iconPath="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            accent="bg-gradient-to-tr from-rose-600 to-pink-600 shadow-rose-600/20"
          />
          <StatCard
            label="Avg Resolution"
            value={`${avgTime}h`}
            iconPath={Icons.avgtime}
            accent="bg-gradient-to-tr from-violet-500 to-violet-600 shadow-violet-500/20"
          />
        </div>

        {/* Charts & Distributions */}
        <div className="grid grid-cols-1 gap-6">
          <SectionCard title="Spatio-Temporal Category Distribution">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="category" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    {categoryData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </div>

        {/* Search, Filter, and Complaints Table */}
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
          
          <div className="px-6 py-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
            <h2 className="font-bold text-slate-800">Grievance Backlog & Priorities</h2>
            
            {/* Search/Filters */}
            <div className="flex flex-wrap items-center gap-3">
              
              <input
                type="text"
                placeholder="Search text, category, fake, marathi…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 transition-all w-64"
              />

              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="all">All Categories</option>
                {categories.map((c, i) => (
                  <option key={i} value={c}>{c}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Resolved">Resolved</option>
              </select>

            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase text-[10px] tracking-wider font-bold bg-slate-50/20">
                  <th className="px-6 py-3.5">Grievance Description</th>
                  <th className="px-6 py-3.5">Category</th>
                  <th className="px-6 py-3.5">STSEP Priority</th>
                  <th className="px-6 py-3.5">Status Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredComplaints.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center py-12 text-slate-400">
                      No complaints matched the criteria
                    </td>
                  </tr>
                ) : (
                  (() => {
                    const totalPages = Math.max(1, Math.ceil(filteredComplaints.length / itemsPerPage));
                    const startIndex = (currentPage - 1) * itemsPerPage;
                    const paginated = filteredComplaints.slice(startIndex, startIndex + itemsPerPage);

                    return paginated.map((c) => (
                      <tr key={c._id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-800 max-w-md truncate">
                          {c.description}
                        </td>
                        <td className="px-6 py-4">
                          <span className="capitalize font-semibold text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60">
                            {c.category}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-black border ${getPriorityColor(c.finalPriority || c.priorityScoreS2)}`}>
                              {(c.finalPriority || c.priorityScoreS2)?.toFixed(2)}
                            </span>
                            {c.surgeFlag && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-red-100 text-red-700 border border-red-200">
                                🔥 SURGE
                              </span>
                            )}
                            {(c.isFake || c.veracityStatus === "FAKE_MISMATCH") && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                                ⚠️ FAKE
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={c.status}
                            onChange={(e) => handleStatusChange(c._id, e.target.value)}
                            className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs text-slate-700 focus:outline-none cursor-pointer hover:border-slate-300 transition"
                          >
                            <option value="Pending">Pending</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Resolved">Resolved</option>
                          </select>
                        </td>
                      </tr>
                    ));
                  })()
                )}
              </tbody>
            </table>
          </div>

          {/* Admin Dashboard Pagination Bar */}
          {filteredComplaints.length > 0 && (
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
              <div>
                Showing <strong className="text-slate-800">{(currentPage - 1) * itemsPerPage + 1}</strong> to <strong className="text-slate-800">{Math.min(currentPage * itemsPerPage, filteredComplaints.length)}</strong> of <strong className="text-slate-800">{filteredComplaints.length}</strong> entries
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
                  <span className="text-slate-400">of {Math.max(1, Math.ceil(filteredComplaints.length / itemsPerPage))}</span>
                </div>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.max(1, Math.ceil(filteredComplaints.length / itemsPerPage))))}
                  disabled={currentPage >= Math.ceil(filteredComplaints.length / itemsPerPage)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
