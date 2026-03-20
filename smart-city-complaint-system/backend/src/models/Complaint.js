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

    imagePath: {
      type: String,
      required: true
    },

    priorityScore: {
      type: Number,
      default: 0
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
