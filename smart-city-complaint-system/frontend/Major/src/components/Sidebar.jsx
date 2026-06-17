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

  const navItems = [
    {
      to: "/admin",
      label: "Overview",
      end: true,
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
        </svg>
      )
    },
    {
      to: "/admin/complaints",
      label: "Complaints",
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
        </svg>
      )
    },
    {
      to: "/admin/hotspots",
      label: "Density Hotspots",
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>
        </svg>
      )
    },
    {
      to: "/admin/map",
      label: "Complaint Map",
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
        </svg>
      )
    },
    {
      to: "/admin/diagnostics",
      label: "ML Diagnostics",
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
      )
    }
  ];

  return (
    <div className="w-64 h-screen bg-slate-900 border-r border-slate-800 text-slate-100 flex flex-col justify-between">
      
      {/* Top Section */}
      <div className="p-6">
        
        {/* Branding Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight text-white">UrbanPulse</span>
          <span className="text-[9px] font-semibold tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Admin</span>
        </div>

        {/* Navigation items */}
        <nav className="space-y-1">
          {navItems.map((item, i) => (
            <NavLink
              key={i}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/15"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* User profile and logout at the bottom */}
      <div className="p-6 border-t border-slate-800 space-y-4">
        
        {/* Profile Details */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-indigo-400 font-bold text-xs">
            {user.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
          </div>
          <div className="flex flex-col truncate">
            <span className="text-xs font-semibold text-slate-200 truncate leading-tight">{user.name}</span>
            <span className="text-[10px] text-slate-500 truncate">{user.email}</span>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800 hover:bg-red-500/10 text-slate-400 hover:text-red-400 font-medium border border-slate-800 hover:border-red-500/20 transition-all cursor-pointer text-sm"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
          Log Out
        </button>
      </div>

    </div>
  );
}

export default Sidebar;
