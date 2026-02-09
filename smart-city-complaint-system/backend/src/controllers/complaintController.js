const Complaint = require("../models/Complaint");

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

    const complaint = await Complaint.create({
      citizen: req.user._id,
      description,
      latitude,
      longitude,
      imagePath: req.file.path
    });

    res.status(201).json({
      message: "Complaint submitted successfully",
      complaintId: complaint._id
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to submit complaint" });
  }
};
