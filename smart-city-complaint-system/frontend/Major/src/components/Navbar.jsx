import { useContext } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

function Navbar() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  if (!user) return null;

  return (
    <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-6 py-3.5 flex items-center justify-between transition-all">
      
      {/* Brand logo */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <span className="text-lg font-bold tracking-tight text-slate-900">UrbanPulse</span>
        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
          {user.role}
        </span>
      </div>

      {/* Nav Links & Profile */}
      <div className="flex items-center gap-6">
        
        {user.role === "citizen" && (
          <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl">
            <Link 
              to="/" 
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                location.pathname === "/" 
                  ? "bg-white text-indigo-600 shadow-sm" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              My Dashboard
            </Link>
            <Link 
              to="/submit" 
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                location.pathname === "/submit" 
                  ? "bg-white text-indigo-600 shadow-sm" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Submit Complaint
            </Link>
          </div>
        )}

        {/* User initials & logout */}
        <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
          
          <div className="flex flex-col text-right">
            <span className="text-xs font-semibold text-slate-800 leading-tight">{user.name}</span>
            <span className="text-[10px] text-slate-400">{user.role === 'admin' ? 'System Administrator' : 'Citizen Member'}</span>
          </div>

          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center border border-indigo-200 text-indigo-700 font-bold text-xs">
            {user.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
          </div>

          <button 
            onClick={handleLogout}
            title="Log Out"
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
          </button>

        </div>

      </div>

    </nav>
  );
}

export default Navbar;