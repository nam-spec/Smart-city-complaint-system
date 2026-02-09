const express = require("express");
const { createComplaint } = require("../controllers/complaintController");
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

module.exports = router;
