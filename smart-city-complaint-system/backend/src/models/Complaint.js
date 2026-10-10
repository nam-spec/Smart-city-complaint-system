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
      // UNVERIFIED was returned by the ML service when CLIP was offline but was missing here,
      // which made Complaint.create() throw and the submission fail with a 500.
      enum: ["VERIFIED", "SUSPICIOUS", "FAKE_MISMATCH", "LIKELY_FAKE", "DUPLICATE", "UNVERIFIED"],
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

    // ---- Multilingual text understanding -------------------------------
    language: { type: String, default: "" },            // en | hinglish | mr | hi | mr-latn | mixed
    rootCauseCategory: { type: String, default: "" },   // department that must fix it
    symptomCategory: { type: String, default: null },   // what the citizen sees, if different
    causeText: { type: String, default: null },
    englishGloss: { type: String, default: "" },
    textConfidence: { type: Number, default: 0 },

    // ---- Image understanding & authenticity ---------------------------
    imageCategory: { type: String, default: null },
    imageConfidence: { type: Number, default: null },
    textImageMatch: { type: Number, default: null },     // 0..1 description <-> photo agreement
    fakeRiskScore: { type: Number, default: 0 },         // 0..1 forensic risk
    fakeSignals: [
      {
        _id: false,
        code: String,
        weight: Number,
        message: String
      }
    ],
    imageHash: { type: String, default: null, index: true },   // perceptual hash for re-use detection
    duplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: "Complaint", default: null },
    needsManualReview: { type: Boolean, default: false, index: true },
    priorityFactor: { type: Number, default: 1.0 },      // credibility multiplier applied to priority

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
