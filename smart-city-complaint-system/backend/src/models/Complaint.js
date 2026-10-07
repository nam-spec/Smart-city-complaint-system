const mongoose = require("mongoose");

const complaintSchema = new mongoose.Schema(
  {
    citizen: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    description: {
      type: String,
      required: true,
      trim: true
    },

    category: {
      type: String,
      default: "Unclassified"
    },

    latitude: {
      type: Number,
      required: true
    },

    longitude: {
      type: Number,
      required: true
    },

    cellId: {
      type: String,
      index: true
    },

    imagePath: {
      type: String,
      required: false
    },

    severityScore: {
      type: Number,
      default: 0
    },

    spatialDensity: {
      type: Number,
      default: 0
    },

    temporalDensity: {
      type: Number,
      default: 0
    },

    acceleration: {
      type: Number,
      default: 0
    },

    priorityScore: {
      type: Number,
      default: 0
    },

    priorityScoreS2: {
      type: Number,
      default: 0
    },

    surgeFlag: {
      type: Boolean,
      default: false
    },

    surgeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Surge",
      default: null,
      index: true
    },

    observedCount: {
      type: Number,
      default: 0
    },

    expectedCount: {
      type: Number,
      default: 0
    },

    pValue: {
      type: Number,
      default: 1.0
    },

    surgeStrength: {
      type: Number,
      default: 0.0
    },

    finalPriority: {
      type: Number,
      default: 0.0
    },

    isFake: {
      type: Boolean,
      default: false
    },

    veracityScore: {
      type: Number,
      default: 1.0
    },

    veracityStatus: {
      type: String,
      enum: ["VERIFIED", "SUSPICIOUS", "FAKE_MISMATCH"],
      default: "VERIFIED"
    },

    veracityExplanation: {
      type: String,
      default: ""
    },

    clipVisualCategory: {
      type: String,
      default: ""
    },

    isSeeded: {
      type: Boolean,
      default: false
    },

    resolvedAt: {
      type: Date
    },

    status: {
      type: String,
      enum: ["Pending", "In Progress", "Resolved"],
      default: "Pending"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Complaint", complaintSchema);
