const Complaint = require("../models/Complaint");
const calculatePriority = require("../utils/priorityEngine").calculatePriority;
const { evaluateAndUpdateSurgeLifecycle } = require("../utils/surgeEngine");
const h3 = require("h3-js");
const axios = require("axios");

exports.createComplaint = async (req, res) => {
  try {
    const { description, latitude, longitude } = req.body;

    // Mandatory checks
    if (!description || !latitude || !longitude) {
      return res.status(400).json({
        message: "Description and geo-location are mandatory"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Image upload is mandatory"
      });
    }

    let category = "unclassified";
    let severityScore = 0.50; // fallback

    try {
      const baseUrl = process.env.ML_SERVICE_URL || "http://localhost:5001/predict";
      const targetUrl = baseUrl.endsWith("/predict") ? baseUrl : `${baseUrl}/predict`;
      
      console.log(`Sending ML prediction request to: ${targetUrl}`);
      const mlResponse = await axios.post(targetUrl, { text: description });

      category = mlResponse.data.category || "unclassified";
      severityScore = parseFloat(mlResponse.data.severity_score) || 0.50;
    } catch (error) {
      console.error("ML service error:", error.message);
      console.log("ML service unavailable, using default category and severity");
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const cellId = h3.latLngToCell(lat, lng, 8);

    const {
      priorityScore,
      priorityScoreS2,
      spatialDensity,
      temporalDensity,
      acceleration
    } = await calculatePriority(
      severityScore,
      lat,
      lng,
      category
    );

    // Evaluate surge & neighborhood lifecycle binding
    const surgeInfo = await evaluateAndUpdateSurgeLifecycle({ latitude: lat, longitude: lng, category });
    const surgeBoost = surgeInfo.surgeFlag ? 0.20 * surgeInfo.surgeStrength : 0;
    const finalPriority = priorityScoreS2 + surgeBoost;

    const complaint = await Complaint.create({
      citizen: req.user._id,
      description,
      category,
      cellId,
      latitude: lat,
      longitude: lng,
      imagePath: req.file.path,
      severityScore,
      spatialDensity,
      temporalDensity,
      acceleration,
      priorityScore,
      priorityScoreS2,
      surgeFlag: surgeInfo.surgeFlag,
      surgeId: surgeInfo.surgeId,
      observedCount: surgeInfo.observedCount,
      expectedCount: surgeInfo.expectedCount,
      pValue: surgeInfo.pValue,
      surgeStrength: surgeInfo.surgeStrength,
      finalPriority
    });

    res.status(201).json({
      message: "Complaint submitted successfully",
      complaint
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to submit complaint" });
  }
};

exports.getAllComplaints = async (req, res) => {
  try {
    const rawComplaints = await Complaint.find()
      .populate("citizen", "name email")
      .populate("surgeId", "status peakZ minP peakAt");

    // Dynamic fresh queue resolution: apply surge boost only if linked surge is currently ACTIVE
    const formattedComplaints = rawComplaints.map(c => {
      const doc = c.toObject();
      const isSurgeActive = doc.surgeId && doc.surgeId.status === "active";
      const currentBoost = isSurgeActive ? 0.20 * (doc.surgeStrength || 1.0) : 0;
      doc.freshFinalPriority = doc.priorityScoreS2 + currentBoost;
      return doc;
    });

    // Sort by freshFinalPriority descending, then createdAt descending
    formattedComplaints.sort((a, b) => {
      if (b.freshFinalPriority !== a.freshFinalPriority) {
        return b.freshFinalPriority - a.freshFinalPriority;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.status(200).json(formattedComplaints);
  } catch (error) {
    console.error("Error fetching complaints:", error);
    res.status(500).json({ message: "Failed to fetch complaints" });
  }
};

exports.updateComplaintStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ message: "Complaint not found" });
    }

    complaint.status = status;

    // If resolved, mark resolution time explicitly
    if (status === "Resolved") {
      complaint.resolvedAt = new Date();
    }

    await complaint.save();

    res.status(200).json({ message: "Status updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update status" });
  }
};