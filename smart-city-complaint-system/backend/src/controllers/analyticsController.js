const Complaint = require("../models/Complaint");
const fs = require("fs");
const path = require("path");

const parseCSV = (filePath) => {
  if (!fs.existsSync(filePath)) return [];
  const data = fs.readFileSync(filePath, "utf8");
  const lines = data.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(h => h.replace(/^"|"$/g, ''));
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(p => p.replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, index) => {
      obj[h] = parts[index] || "";
    });
    result.push(obj);
  }
  return result;
};

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

exports.getMLMetrics = async (req, res) => {
  try {
    const filePath = path.join(__dirname, "../../../ml/data/evaluation_results.csv");
    const metrics = parseCSV(filePath);
    res.status(200).json(metrics);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch ML metrics" });
  }
};

exports.getMLExplainability = async (req, res) => {
  try {
    const filePath = path.join(__dirname, "../../../ml/data/explainability_table.csv");
    const explainability = parseCSV(filePath);
    // Limit to top 50 to keep payload lightweight
    res.status(200).json(explainability.slice(0, 50));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch ML explainability data" });
  }
};