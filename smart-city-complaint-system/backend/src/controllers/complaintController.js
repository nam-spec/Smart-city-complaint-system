const Complaint = require("../models/Complaint");
const calculatePriority = require("../utils/priorityEngine");
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

    let category = "Unclassified";

try {
  const mlResponse = await axios.post("http://localhost:5001/predict", {
    text: description
  });

  category = mlResponse.data.category;
} catch (error) {
  console.log("ML service unavailable, using default category");
}

    const priorityScore = await calculatePriority(
  description,
  parseFloat(latitude),
  parseFloat(longitude)
);
    const complaint = await Complaint.create({
  citizen: req.user._id,
  description,
  latitude,
  longitude,
  imagePath: req.file.path,
  priorityScore,
  category
});

    res.status(201).json({
  message: "Complaint submitted successfully",
  complaint
});
  } catch (error) {
    res.status(500).json({ message: "Failed to submit complaint" });
  }
};

exports.getAllComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find()
      .populate("citizen", "name email")
      .sort({ priorityScore: -1, createdAt: -1 });

    res.status(200).json(complaints);
  } catch (error) {
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
    await complaint.save();

    res.status(200).json({ message: "Status updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update status" });
  }
};