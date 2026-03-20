import { useContext } from "react";
import { Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useContext(AuthContext);

  // If not logged in → go to login
  if (!user) {
    return <Navigate to="/login" />;
  }

  // If role not allowed → redirect to home
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" />;
  }

  return children;
}

export default ProtectedRoute;