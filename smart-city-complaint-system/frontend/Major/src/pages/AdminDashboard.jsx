import { useEffect, useState } from "react";
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

const StatCard = ({ label, value, iconPath, accent }) => (
  <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
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
  const [stats, setStats] = useState(null);
  const [categoryData, setCategoryData] = useState([]);
  const [avgTime, setAvgTime] = useState(0);
  const [complaints, setComplaints] = useState([]);
  const [filteredComplaints, setFilteredComplaints] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [b, c, comp, avg] = await Promise.all([
          api.get("/analytics/basic"),
          api.get("/analytics/categories"),
          api.get("/complaints"),
          api.get("/analytics/avg-resolution-time"),
        ]);

        setStats(b.data);
        setCategoryData(c.data);
        setComplaints(comp.data);
        setFilteredComplaints(comp.data);
        setAvgTime(avg.data.averageResolutionHours);
      } catch (err) {
        console.error("Dashboard data load error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
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
          prev.map(c => c._id === id ? { ...c, status: newStatus, resolvedAt: newStatus === "Resolved" ? new Date() : null } : c)
        );
        // Refresh counts
        api.get("/analytics/basic").then(res => setStats(res.data));
        api.get("/analytics/avg-resolution-time").then(res => setAvgTime(res.data.averageResolutionHours));
      })
      .catch(err => console.error("Error updating status:", err));
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

  // Categories list for filter
  const categories = [...new Set(complaints.map(c => c.category))];

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50/50">
      
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200/80 px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 leading-none">Control Tower</h1>
          <p className="text-xs text-slate-400 mt-1.5">Welcome back, Admin 👋</p>
        </div>
      </header>

      {/* Page Content */}
      <main className="p-8 space-y-8 animate-fade-in">

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          <StatCard
            label="Total Grievances"
            value={stats?.total}
            iconPath={Icons.total}
            accent="bg-gradient-to-tr from-indigo-500 to-indigo-600 shadow-indigo-500/20"
          />
          <StatCard
            label="Resolved Complaints"
            value={stats?.resolved}
            iconPath={Icons.resolved}
            accent="bg-gradient-to-tr from-emerald-500 to-emerald-600 shadow-emerald-500/20"
          />
          <StatCard
            label="Pending Review"
            value={stats?.pending}
            iconPath={Icons.pending}
            accent="bg-gradient-to-tr from-amber-500 to-amber-600 shadow-amber-500/20"
          />
          <StatCard
            label="Avg Resolution Time"
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
                placeholder="Search description..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 transition-all w-44"
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
                  filteredComplaints.map((c) => (
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
                        <span className={`px-2.5 py-1 rounded-full text-xs font-black border ${getPriorityColor(c.priorityScoreS2)}`}>
                          {c.priorityScoreS2?.toFixed(2)}
                        </span>
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
                  ))
                )}
              </tbody>
            </table>
          </div>

        </div>

      </main>
    </div>
  );
}
