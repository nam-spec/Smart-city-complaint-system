const express = require("express");
const router = express.Router();
const surgeController = require("../controllers/surgeController");
const { protect, authorize } = require("../middleware/authMiddleware");

// Surge Analytics Endpoints
// (previously unauthenticated - anyone could list surges or inject simulated ones)
router.get("/", protect, authorize("admin", "citizen"), surgeController.getAllSurges);
router.post("/simulate", protect, authorize("admin"), surgeController.simulateSurge);
router.get("/:id", protect, authorize("admin"), surgeController.getSurgeById);

module.exports = router;
