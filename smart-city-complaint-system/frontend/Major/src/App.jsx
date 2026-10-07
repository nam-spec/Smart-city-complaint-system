import { useContext } from "react";
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AuthContext } from "./context/AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Home from "./pages/Home";
import AdminDashboard from "./pages/AdminDashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import SubmitComplaint from "./pages/SubmitComplaint";
import Navbar from "./components/Navbar";
import AdminLayout from "./components/AdminLayout";
import ComplaintMap from "./pages/ComplaintMap";
import AdminComplaints from "./pages/AdminComplaints";
import AdminHotspots from "./pages/AdminHotspots";
import AdminDiagnostics from "./pages/AdminDiagnostics";
import SurgeHistory from "./pages/SurgeHistory";
import SurgeDetail from "./pages/SurgeDetail";

function App() {
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isAdminPage = location.pathname.startsWith("/admin");

  return (
    <>
      {!isAdminPage && location.pathname !== "/login" && location.pathname !== "/register" && user && <Navbar />}

      <Routes>
        <Route 
          path="/login" 
          element={
            user ? <Navigate to={user.role === "admin" ? "/admin" : "/"} replace /> : <Login />
          } 
        />
        <Route path="/register" element={<Register />} />

        <Route
          path="/"
          element={
            !user ? (
              <Login />
            ) : user.role === "admin" ? (
              <Navigate to="/admin" replace />
            ) : (
              <ProtectedRoute allowedRoles={["citizen"]}>
                <Home />
              </ProtectedRoute>
            )
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

        <Route
          path="/admin/surges/history"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminLayout>
                <SurgeHistory />
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/surges/:id"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminLayout>
                <SurgeDetail />
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/diagnostics"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminLayout>
                <AdminDiagnostics />
              </AdminLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}

export default App;
