const jwt = require("jsonwebtoken");
const Alert = require("../models/Alert");
const User = require("../models/User");
const { addClient, clientCount } = require("../utils/alertService");

/** GET /api/alerts?unread=true&limit=50 */
exports.getAlerts = async (req, res) => {
  try {
    const filter = {};
    if (req.query.unread === "true") filter.acknowledged = false;
    if (req.query.type) filter.type = req.query.type;
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const [alerts, unread] = await Promise.all([
      Alert.find(filter).sort({ createdAt: -1 }).limit(limit),
      Alert.countDocuments({ acknowledged: false })
    ]);
    res.json({ success: true, unread, alerts });
  } catch (err) {
    console.error("Error fetching alerts:", err);
    res.status(500).json({ success: false, message: "Failed to fetch alerts" });
  }
};

/** PATCH /api/alerts/:id/ack */
exports.acknowledgeAlert = async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      { acknowledged: true, acknowledgedBy: req.user._id, acknowledgedAt: new Date() },
      { new: true }
    );
    if (!alert) return res.status(404).json({ success: false, message: "Alert not found" });
    res.json({ success: true, alert });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to acknowledge alert" });
  }
};

/** POST /api/alerts/ack-all */
exports.acknowledgeAll = async (req, res) => {
  try {
    const r = await Alert.updateMany(
      { acknowledged: false },
      { acknowledged: true, acknowledgedBy: req.user._id, acknowledgedAt: new Date() }
    );
    res.json({ success: true, updated: r.modifiedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to acknowledge alerts" });
  }
};

/**
 * GET /api/alerts/stream?token=JWT
 * Server-Sent Events stream of new alerts. EventSource cannot send an Authorization
 * header, so the admin's JWT is passed as a query parameter.
 */
exports.streamAlerts = async (req, res) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(401).end();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("role");
    if (!user || user.role !== "admin") return res.status(403).end();
  } catch (e) {
    return res.status(401).end();
  }

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders();
  res.write(`event: hello\ndata: ${JSON.stringify({ connected: true, clients: clientCount() + 1 })}\n\n`);
  addClient(res);
};
