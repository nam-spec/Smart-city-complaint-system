const mongoose = require("mongoose");

/**
 * Admin alerts raised automatically by the surge engine.
 *  POSSIBLE_SURGE   early warning: unusual rise that has not yet met the confirmed-surge test
 *  SURGE_CONFIRMED  neighbourhood surge confirmed (p < 0.01, >= 5 complaints, >= 3 citizens)
 *  SURGE_ESCALATED  an active surge keeps growing (peak z-score up >= 50%)
 *  CITYWIDE_SURGE   one category is spiking across the whole city in the last hour
 *  SURGE_RESOLVED   an active surge returned to normal
 */
const alertSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["POSSIBLE_SURGE", "SURGE_CONFIRMED", "SURGE_ESCALATED", "CITYWIDE_SURGE", "SURGE_RESOLVED"],
      required: true,
      index: true
    },
    level: {
      type: String,
      enum: ["info", "watch", "warning", "critical"],
      default: "warning",
      index: true
    },
    title: { type: String, required: true },
    message: { type: String, default: "" },
    category: { type: String, index: true },
    cellId: { type: String },
    centroid: {
      lat: { type: Number },
      lng: { type: Number }
    },
    surgeId: { type: mongoose.Schema.Types.ObjectId, ref: "Surge", default: null },
    metrics: {
      observed: Number,
      expected: Number,
      pValue: Number,
      zScore: Number,
      distinctUsers: Number,
      strength: Number,
      windowMinutes: Number
    },
    // Used to avoid alert storms: the same dedupKey is not re-raised within its cooldown
    dedupKey: { type: String, index: true },
    acknowledged: { type: Boolean, default: false, index: true },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    acknowledgedAt: { type: Date }
  },
  { timestamps: true }
);

alertSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Alert", alertSchema);
