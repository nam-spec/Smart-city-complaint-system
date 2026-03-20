import Sidebar from "./Sidebar";

function AdminLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />

      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}

export default AdminLayout;