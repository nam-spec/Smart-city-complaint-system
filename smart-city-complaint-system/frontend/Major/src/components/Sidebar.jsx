import { NavLink, useNavigate } from "react-router-dom";
import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";

function Sidebar() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  if (!user || user.role !== "admin") return null;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="w-64 h-screen bg-gray-800 text-white p-5">
      <h2 className="text-xl font-bold mb-6">Admin Panel</h2>

      <nav className="flex flex-col gap-2">
        <NavLink
          to="/admin"
          end
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2 rounded-lg transition ${
              isActive
                ? "bg-indigo-600 text-white shadow-md"
                : "text-slate-300 hover:bg-slate-700"
            }`
          }
        >
          Dashboard
        </NavLink>

        <NavLink
          to="/admin/complaints"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2 rounded-lg transition ${
              isActive
                ? "bg-indigo-600 text-white"
                : "text-slate-300 hover:bg-slate-700"
            }`
          }
        >
          Complaints
        </NavLink>

        <NavLink
          to="/admin/hotspots"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2 rounded-lg transition ${
              isActive
                ? "bg-indigo-600 text-white"
                : "text-slate-300 hover:bg-slate-700"
            }`
          }
        >
          Hotspots
        </NavLink>

        <NavLink
          to="/admin/map"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2 rounded-lg transition ${
              isActive
                ? "bg-indigo-600 text-white"
                : "text-slate-300 hover:bg-slate-700"
            }`
          }
        >
          Complaint Map
        </NavLink>

        <button
          onClick={handleLogout}
          className="mt-6 bg-red-500 hover:bg-red-600 transition p-2 rounded cursor-pointer"
        >
          Logout
        </button>
      </nav>
    </div>
  );
}

export default Sidebar;
