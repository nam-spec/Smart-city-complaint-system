import Sidebar from "./Sidebar";
import SurgeAlertBell from "./SurgeAlertBell";
import ComplaintSearch from "./ComplaintSearch";

function AdminLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />

      <div className="flex-1 min-w-0">
        {/* Top bar: global complaint search + live surge alerts */}
        <div className="sticky top-0 z-40 h-14 px-6 flex items-center justify-between gap-4 bg-white/90 backdrop-blur border-b border-slate-200">
          <ComplaintSearch />
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden md:inline text-[11px] font-semibold uppercase tracking-wider text-slate-400">Surge alerts</span>
            <SurgeAlertBell />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export default AdminLayout;
