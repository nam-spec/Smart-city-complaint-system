const Complaint = require("../models/Complaint");

exports.getBasicStats = async (req, res) => {
  try {
    const total = await Complaint.countDocuments();

    const resolved = await Complaint.countDocuments({ status: "Resolved" });
    const pending = await Complaint.countDocuments({ status: "Pending" });
    const inProgress = await Complaint.countDocuments({ status: "In Progress" });

    res.status(200).json({
      total,
      resolved,
      pending,
      inProgress
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch statistics" });
  }
};

exports.getCategoryDistribution = async (req, res) => {
  try {
    const distribution = await Complaint.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          category: "$_id",
          count: 1
        }
      }
    ]);

    res.status(200).json(distribution);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch category distribution" });
  }
};

exports.getAverageResolutionTime = async (req, res) => {
  try {
    const resolvedComplaints = await Complaint.find({
      status: "Resolved",
      resolvedAt: { $ne: null }
    });

    if (resolvedComplaints.length === 0) {
      return res.json({ averageResolutionHours: 0 });
    }

    let totalHours = 0;

    resolvedComplaints.forEach(c => {
      const diff = (c.resolvedAt - c.createdAt) / (1000 * 60 * 60);
      totalHours += diff;
    });

    const average = totalHours / resolvedComplaints.length;

    res.json({
      averageResolutionHours: average.toFixed(2)
    });

  } catch (error) {
    res.status(500).json({ message: "Failed to calculate average time" });
  }
};

exports.getHotspots = async (req, res) => {
  try {
    const hotspots = await Complaint.aggregate([
      {
        $project: {
          roundedLat: { $round: ["$latitude", 2] },
          roundedLng: { $round: ["$longitude", 2] }
        }
      },
      {
        $group: {
          _id: {
            lat: "$roundedLat",
            lng: "$roundedLng"
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 5
      }
    ]);

    res.status(200).json(hotspots);

  } catch (error) {
    res.status(500).json({ message: "Failed to fetch hotspots" });
  }
};