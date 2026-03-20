const jwt = require("jsonwebtoken");
const User = require("../models/User");

exports.protect = async (req, res, next) => {
  let token;

  // Check Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized, token missing" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findById(decoded.id).select("-password");
    console.log("Authorization header:", req.headers.authorization);
    console.log("Decoded token:", decoded);

    next();
  } catch (error) {
    return res.status(401).json({ message: "Not authorized, token invalid" });
  }
};

exports.authorize = (...roles) => {
  return (req, res, next) => {
    console.log("User role from token:", req.user.role);
    console.log("Allowed roles:", roles);
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Access denied: insufficient permissions"
      });
    }
    next();
  };
};
