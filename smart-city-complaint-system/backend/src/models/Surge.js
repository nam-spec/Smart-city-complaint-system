const mongoose = require("mongoose");

const surgeSchema = new mongoose.Schema(
  {
    cellId: {
      type: String,
      required: true,
      index: true
    },
    centroid: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true }
    },
    category: {
      type: String,
      required: true,
      index: true
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    peakAt: {
      type: Date,
      default: Date.now
    },
    resolvedAt: {
      type: Date
    },
    status: {
      type: String,
      enum: ["active", "resolved"],
      default: "active",
      index: true
    },
    complaintCount: {
      type: Number,
      default: 0
    },
    distinctUsers: {
      type: Number,
      default: 0
    },
    peakZ: {
      type: Number,
      default: 0
    },
    minP: {
      type: Number,
      default: 1.0
    },
    quietWindows: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

// Compound index for active surges by category
surgeSchema.index({ cellId: 1, category: 1, status: 1 });

module.exports = mongoose.model("Surge", surgeSchema);
