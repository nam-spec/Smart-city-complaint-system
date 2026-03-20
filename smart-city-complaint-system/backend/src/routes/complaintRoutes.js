const express = require("express");
const {
  createComplaint,
  getAllComplaints,
  updateComplaintStatus
} = require("../controllers/complaintController");
const { protect, authorize } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

router.post(
  "/",
  protect,
  authorize("citizen"),
  upload.single("image"),
  createComplaint
);

// Admin: Get all complaints
router.get(
  "/",
  protect,
  authorize("admin","citizen"),
  getAllComplaints
);

// Admin: Update complaint status
router.patch(
  "/:id/status",
  protect,
  authorize("admin"),
  updateComplaintStatus
);
module.exports = router;
