const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { getBasicStats, getCategoryDistribution, getAverageResolutionTime, getHotspots, getMLMetrics, getMLExplainability } = require("../controllers/analyticsController");
const { getCellBaseline } = require("../controllers/surgeController");

const router = express.Router();

router.get("/basic", protect, authorize("admin"), getBasicStats);
router.get("/categories", protect, authorize("admin"), getCategoryDistribution);
router.get("/avg-resolution-time", protect, authorize("admin"), getAverageResolutionTime);
router.get("/hotspots", protect, authorize("admin"), getHotspots);
router.get("/ml-metrics", protect, authorize("admin"), getMLMetrics);
router.get("/ml-explainability", protect, authorize("admin"), getMLExplainability);
router.get("/cell-baseline", getCellBaseline);

module.exports = router;