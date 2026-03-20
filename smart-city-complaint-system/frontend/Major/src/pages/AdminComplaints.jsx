import { useEffect, useState } from "react";
import api from "../api/axios";

function AdminComplaints() {
  const [complaints, setComplaints] = useState([]);

  useEffect(() => {
    api.get("/complaints").then((res) => setComplaints(res.data));
  }, []);

  return (
    <div className="p-6">

      <h1 className="text-xl font-semibold mb-6">
        All Complaints
      </h1>

      <div className="bg-white rounded-xl shadow p-6 overflow-x-auto">

        <table className="w-full text-sm">

          <thead className="border-b">
            <tr>
              <th className="text-left py-2">Description</th>
              <th className="text-left py-2">Category</th>
              <th className="text-left py-2">Priority</th>
              <th className="text-left py-2">Status</th>
              <th className="text-left py-2">Location</th>
              <th className="text-left py-2">Created</th>
              <th className="text-left py-2">Image</th>
              <th className="text-left py-2">Actions</th>
            </tr>
          </thead>

          <tbody>

            {complaints.map((c) => (

              <tr key={c._id} className="border-b">

                <td className="py-2 max-w-xs truncate">
                  {c.description}
                </td>

                <td className="py-2">
                  {c.category}
                </td>

                <td className="py-2">
                  {c.priorityScore}
                </td>

                <td className="py-2">
                  <span className={`px-2 py-1 rounded text-xs ${
                    c.status === "Resolved"
                      ? "bg-green-100 text-green-700"
                      : c.status === "In Progress"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}>
                    {c.status}
                  </span>
                </td>

                {/* LOCATION */}
                <td className="py-2 text-xs text-gray-500">
                  {c.latitude?.toFixed(3)}, {c.longitude?.toFixed(3)}
                </td>

                {/* CREATED DATE */}
                <td className="py-2 text-xs">
                  {new Date(c.createdAt).toLocaleDateString()}
                </td>

                {/* IMAGE */}
                <td className="py-2">
                  {c.imagePath && (
                    <img
                      src={`http://localhost:5000/${c.imagePath}`}
                      alt="complaint"
                      className="w-12 h-12 object-cover rounded"
                    />
                  )}
                </td>

                {/* ACTIONS */}
                <td className="py-2">

                  <select
                    value={c.status}
                    onChange={(e) => {
                      api.patch(`/complaints/${c._id}/status`, {
                        status: e.target.value
                      }).then(() => {
                        setComplaints((prev) =>
                          prev.map((item) =>
                            item._id === c._id
                              ? { ...item, status: e.target.value }
                              : item
                          )
                        );
                      });
                    }}
                    className="border rounded px-2 py-1 text-xs"
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

      </div>

    </div>
  );
}

export default AdminComplaints;
