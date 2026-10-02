const mongoose = require("mongoose");

const cellBaselineSchema = new mongoose.Schema(
  {
    cellId: {
      type: String,
      required: true,
      index: true
    },
    parentWardId: {
      type: String,
      required: true,
      index: true
    },
    hourOfWeek: {
      type: Number,
      required: true,
      min: 0,
      max: 167,
      index: true
    },
    category: {
      type: String,
      required: true,
      index: true
    },
    meanCount: {
      type: Number,
      default: 0
    },
    totalCount: {
      type: Number,
      default: 0
    },
    madCount: {
      type: Number,
      default: 0
    },
    nWeeks: {
      type: Number,
      default: 6
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// Compound index to guarantee fast baseline lookups and enforce uniqueness
cellBaselineSchema.index({ cellId: 1, hourOfWeek: 1, category: 1 }, { unique: true });

module.exports = mongoose.model("CellBaseline", cellBaselineSchema);
