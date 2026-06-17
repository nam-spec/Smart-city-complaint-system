import { useState, useContext } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import { AuthContext } from "../context/AuthContext";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await api.post("/auth/login", { email, password });
      login(res.data);

      if (res.data.user.role === "admin") {
        navigate("/admin");
      } else {
        navigate("/");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-950 font-sans text-slate-100 overflow-hidden relative">
      
      {/* Background Graphic Orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-900/20 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-violet-900/20 blur-[120px] pointer-events-none"></div>

      {/* Left side: Branding Panel */}
      <div className="hidden lg:flex lg:w-1/2 p-12 flex-col justify-between relative z-10 border-r border-slate-800 bg-slate-900/50 backdrop-blur-3xl">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">UrbanPulse</span>
        </div>

        <div className="space-y-6">
          <h1 className="text-5xl font-extrabold tracking-tight leading-none text-white max-w-lg">
            Intelligent Priority-Driven Civic Analytics.
          </h1>
          <p className="text-slate-400 text-lg max-w-md">
            Harnessing Spatio-Temporal analytics (STSEP) and machine learning for optimized community feedback and rapid grievance resolution.
          </p>
        </div>

        <div className="text-sm text-slate-500">
          © {new Date().getFullYear()} UrbanPulse System. Built with Node, React, and MongoDB.
        </div>
      </div>

      {/* Right side: Login Form Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative z-10">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          
          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-3xl font-bold tracking-tight text-white">Welcome back</h2>
            <p className="text-slate-400">Sign in to your UrbanPulse portal</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm flex items-center gap-3">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Email Address</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                  </svg>
                </span>
                <input
                  type="email"
                  placeholder="name@example.com"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  onChange={(e) => setEmail(e.target.value)}
                  value={email}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  onChange={(e) => setPassword(e.target.value)}
                  value={password}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white font-semibold transition-all duration-300 shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01]"
            >
              {loading ? "Authenticating..." : "Sign In"}
            </button>
          </form>

          <div className="mt-8 text-center text-sm text-slate-400">
            New to the portal?{" "}
            <Link to="/register" className="text-indigo-400 hover:text-indigo-300 font-semibold transition">
              Create an account
            </Link>
          </div>
          
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 text-xs text-slate-500 space-y-1">
            <span className="font-bold text-slate-400 block mb-1">Demo Credentials:</span>
            <div className="flex justify-between">
              <span>Admin: <strong className="text-indigo-400">admin@smartcity.gov</strong></span>
              <span>Citizen: <strong className="text-indigo-400">citizen@311.gov</strong></span>
            </div>
            <div className="text-center mt-1 border-t border-slate-800/50 pt-1">
              Password: <strong className="text-slate-400">password123</strong>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}

export default Login;