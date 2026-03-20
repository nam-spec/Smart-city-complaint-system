import { useEffect, useState } from "react";
import api from "../api/axios";
import { Link } from "react-router-dom";

function Home() {
  const [complaints, setComplaints] = useState([]);

  useEffect(() => {
    api.get("/complaints")
      .then((res) => setComplaints(res.data))
      .catch((err) => console.error(err));
  }, []);

  const total = complaints.length;
  const pending = complaints.filter(c => c.status === "Pending").length;
  const inProgress = complaints.filter(c => c.status === "In Progress").length;
  const resolved = complaints.filter(c => c.status === "Resolved").length;

  return (
    <div className="min-h-screen bg-slate-100 p-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">
          Citizen Dashboard
        </h1>

        <Link
          to="/submit"
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
        >
          Submit Complaint
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">

        <div className="bg-white p-5 rounded-xl shadow">
          <p className="text-sm text-slate-400">Total Complaints</p>
          <p className="text-2xl font-bold text-slate-800">{total}</p>
        </div>

        <div className="bg-white p-5 rounded-xl shadow">
          <p className="text-sm text-slate-400">Pending</p>
          <p className="text-2xl font-bold text-amber-600">{pending}</p>
        </div>

        <div className="bg-white p-5 rounded-xl shadow">
          <p className="text-sm text-slate-400">In Progress</p>
          <p className="text-2xl font-bold text-blue-600">{inProgress}</p>
        </div>

        <div className="bg-white p-5 rounded-xl shadow">
          <p className="text-sm text-slate-400">Resolved</p>
          <p className="text-2xl font-bold text-green-600">{resolved}</p>
        </div>

      </div>

      {/* Recent complaints */}
      <div className="bg-white rounded-xl shadow p-6">

        <h2 className="text-lg font-semibold mb-4 text-slate-700">
          Recent Complaints
        </h2>

        <div className="overflow-x-auto">
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
              {complaints.length === 0 && (
                <tr>
                  <td colSpan="4" className="text-center py-6 text-slate-400">
                    No complaints submitted yet
                  </td>
                </tr>
              )}

              {complaints.slice(0, 6).map((c) => (
                <tr key={c._id} className="border-b">

                  <td className="py-2">
                    {c.description}
                  </td>

                  <td className="py-2">
                    {c.category}
                  </td>

                  <td className="py-2">
                    {c.priorityScore}
                  </td>

                  <td className="py-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        c.status === "Resolved"
                          ? "bg-green-100 text-green-700"
                          : c.status === "In Progress"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-amber-100 text-amber-700"
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

      </div>

    </div>
  );
}

export default Home;