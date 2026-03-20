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

const Icon = ({ d, size = 20, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="1.8"
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
  avgtime: "M13 10V3L4 14h7v7l9-11h-7z",
  hotspot:
    "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z",
  chart:
    "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10",
  table: "M3 10h18M3 14h18M3 6h18M3 18h18",
};

const CHART_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a78bfa",
  "#c4b5fd",
  "#ddd6fe",
];

const PRIORITY_COLOR = (score) => {
  if (score >= 8) return "bg-red-100 text-red-700";
  if (score >= 5) return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
};

/* ───────────────── Components ───────────────── */

const StatCard = ({ label, value, iconPath, accent }) => (
  <div className="rounded-xl bg-white border p-5 shadow-sm">
    <div className="flex justify-between items-center">
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-2xl font-bold">{value ?? "—"}</p>
      </div>
      <div
        className={`flex items-center justify-center w-10 h-10 rounded-lg text-white ${accent}`}
      >
        <Icon d={iconPath} size={18} />
      </div>
    </div>
  </div>
);

const SectionCard = ({ title, children }) => (
  <div className="bg-white rounded-xl border shadow-sm">
    <div className="border-b px-5 py-3 font-semibold text-slate-700">
      {title}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

/* ───────────────── Dashboard ───────────────── */

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [categoryData, setCategoryData] = useState([]);
  const [avgTime, setAvgTime] = useState(0);
  const [hotspots, setHotspots] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [b, c, h, comp, avg] = await Promise.all([
          api.get("/analytics/basic"),
          api.get("/analytics/categories"),
          api.get("/analytics/hotspots"),
          api.get("/complaints"),
          api.get("/analytics/avg-resolution-time"),
        ]);

        setStats(b.data);
        setCategoryData(c.data);
        setHotspots(h.data);
        setComplaints(comp.data);
        setAvgTime(avg.data.averageResolutionHours);

        const init = {};
        comp.data.forEach((c) => (init[c._id] = c.status));
        setStatuses(init);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Top Header */}
      <header className="bg-white border-b px-6 py-4 flex justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dashboard Overview</h1>
          <p className="text-sm text-slate-500">Welcome back Admin 👋</p>
        </div>
      </header>

      {/* Page Content */}
      <main className="space-y-6">

        <div> className="p-6"
          {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Complaints"
            value={stats?.total}
            iconPath={Icons.total}
            accent="bg-indigo-500"
          />
          <StatCard
            label="Resolved"
            value={stats?.resolved}
            iconPath={Icons.resolved}
            accent="bg-green-500"
          />
          <StatCard
            label="Pending"
            value={stats?.pending}
            iconPath={Icons.pending}
            accent="bg-yellow-500"
          />
          <StatCard
            label="Avg Resolution Time"
            value={`${avgTime}h`}
            iconPath={Icons.avgtime}
            accent="bg-purple-500"
          />
        </div>

        {/* Chart */}
        <SectionCard title="Category Distribution">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count">
                {categoryData.map((_, i) => (
                  <Cell
                    key={i}
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* Complaints Table */}
        <SectionCard title="Complaints">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Description</th>
                <th className="text-left py-2">Category</th>
                <th className="text-left py-2">Priority</th>
                <th className="text-left py-2">Status</th>
              </tr>
            </thead>

            <tbody>
              {complaints.map((c) => (
                <tr key={c._id} className="border-b">
                  <td className="py-2">{c.description}</td>
                  <td>{c.category}</td>

                  <td>
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold ${PRIORITY_COLOR(
                        c.priorityScore
                      )}`}
                    >
                      {c.priorityScore}
                    </span>
                  </td>

                  <td>
                    <select
                      value={statuses[c._id]}
                      onChange={(e) =>
                        setStatuses((prev) => ({
                          ...prev,
                          [c._id]: e.target.value,
                        }))
                      }
                    >
                      <option>Pending</option>
                      <option>In Progress</option>
                      <option>Resolved</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
        </div>
      </main>
    </div>
  );
}
