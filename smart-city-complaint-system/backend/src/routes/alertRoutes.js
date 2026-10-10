const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const { getAlerts, acknowledgeAlert, acknowledgeAll, streamAlerts } = require("../controllers/alertController");

const router = express.Router();

// Live push (auth via ?token= because EventSource cannot set headers)
router.get("/stream", streamAlerts);

router.get("/", protect, authorize("admin"), getAlerts);
router.post("/ack-all", protect, authorize("admin"), acknowledgeAll);
router.patch("/:id/ack", protect, authorize("admin"), acknowledgeAlert);

module.exports = router;
