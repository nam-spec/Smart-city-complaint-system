const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

// Any logged-in user
router.get("/profile", protect, (req, res) => {
  res.json({
    message: "Protected user profile",
    user: req.user
  });
});

// Only admin
router.get("/admin", protect, authorize("admin"), (req, res) => {
  res.json({ message: "Welcome Admin" });
});

module.exports = router;
