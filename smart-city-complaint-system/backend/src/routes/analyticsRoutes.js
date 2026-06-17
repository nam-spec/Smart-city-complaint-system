const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { getBasicStats } = require("../controllers/analyticsController");
const { getCategoryDistribution } = require("../controllers/analyticsController");
const { getAverageResolutionTime } = require("../controllers/analyticsController");
const router = express.Router();

router.get(
  "/basic",
  protect,
  authorize("admin"),
  getBasicStats
);


router.get(
  "/categories",
  protect,
  authorize("admin"),
  getCategoryDistribution
);



router.get(
  "/avg-resolution-time",
  protect,
  authorize("admin"),
  getAverageResolutionTime
);

const { getHotspots, getMLMetrics, getMLExplainability } = require("../controllers/analyticsController");

router.get(
  "/hotspots",
  protect,
  authorize("admin"),
  getHotspots
);

router.get(
  "/ml-metrics",
  protect,
  authorize("admin"),
  getMLMetrics
);

router.get(
  "/ml-explainability",
  protect,
  authorize("admin"),
  getMLExplainability
);

module.exports = router;