import { useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

function Navbar() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav style={{ padding: "15px", borderBottom: "1px solid #ccc" }}>
      <h2>Smart City System</h2>

      {user && (
        <>
          {user.role === "citizen" && (
            <>
              <Link to="/" style={{ marginRight: "15px" }}>
                Dashboard
              </Link>
              <Link to="/submit" style={{ marginRight: "15px" }}>
                Submit Complaint
              </Link>
            </>
          )}

          {user.role === "admin" && (
            <Link to="/admin" style={{ marginRight: "15px" }}>
              Admin Dashboard
            </Link>
          )}

          <button onClick={handleLogout}>
            Logout
          </button>
        </>
      )}
    </nav>
  );
}

export default Navbar;