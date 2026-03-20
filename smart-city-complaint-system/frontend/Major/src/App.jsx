import { Routes, Route, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import Home from "./pages/Home";
import AdminDashboard from "./pages/AdminDashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import SubmitComplaint from "./pages/SubmitComplaint";
import Navbar from "./components/Navbar";
import AdminLayout from "./components/AdminLayout";
import ComplaintMap from "./pages/ComplaintMap";
import AdminComplaints from "./pages/AdminComplaints";
import AdminHotspots from "./pages/AdminHotspots";

function App() {
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith("/admin");

  return (
    <>
      {!isAdminPage && location.pathname !== "/login" && <Navbar />}

      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            <ProtectedRoute allowedRoles={["citizen"]}>
              <Home />
            </ProtectedRoute>
          }
        />

        <Route
          path="/submit"
          element={
            <ProtectedRoute allowedRoles={["citizen"]}>
              <SubmitComplaint />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminLayout>
                <AdminDashboard />
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/map"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminLayout>
                <ComplaintMap />
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/complaints"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminLayout>
                <AdminComplaints />
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/hotspots"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminLayout>
                <AdminHotspots />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}

export default App;
