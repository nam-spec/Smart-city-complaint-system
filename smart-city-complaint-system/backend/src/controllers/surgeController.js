const Surge = require("../models/Surge");
const Complaint = require("../models/Complaint");
const User = require("../models/User");
const CellBaseline = require("../models/CellBaseline");
const h3 = require("h3-js");
const { getShrunkBaseline, calculatePriority } = require("../utils/priorityEngine");
const { evaluateAndUpdateSurgeLifecycle } = require("../utils/surgeEngine");

/**
 * GET /api/analytics/surges
 * Retrieves all active and historical surges with optional status/category filtering
 */
exports.getAllSurges = async (req, res) => {
  try {
    const { status, category } = req.query;
    const filter = {};

    if (status) {
      filter.status = status;
    }
    if (category) {
      filter.category = category.toLowerCase();
    }

    const surges = await Surge.find(filter).sort({ status: 1, peakAt: -1, startedAt: -1 });

    res.status(200).json({
      success: true,
      count: surges.length,
      surges
    });
  } catch (error) {
    console.error("Error fetching surges:", error);
    res.status(500).json({ success: false, message: "Failed to fetch surges" });
  }
};

/**
 * GET /api/analytics/surges/:id
 * Retrieves detailed surge analysis including member complaints and neighborhood metrics
 */
exports.getSurgeById = async (req, res) => {
  try {
    const surge = await Surge.findById(req.params.id);
    if (!surge) {
      return res.status(404).json({ success: false, message: "Surge event not found" });
    }

    // Get 7-cell neighborhood
    const neighborhoodCells = h3.gridDisk(surge.cellId, 1);

    // Fetch all member complaints submitted in this neighborhood since surge started
    const memberComplaints = await Complaint.find({
      cellId: { $in: neighborhoodCells },
      category: surge.category,
      createdAt: { $gte: surge.startedAt }
    })
      .populate("citizen", "name email")
      .sort({ createdAt: -1 });

    // Calculate baseline expectation for reference
    const expectedBaseline10min = await getShrunkBaseline(neighborhoodCells, surge.category, surge.startedAt);

    res.status(200).json({
      success: true,
      surge: {
        ...surge.toObject(),
        expectedBaseline10min,
        memberComplaintCount: memberComplaints.length,
        neighborhoodCellCount: neighborhoodCells.length
      },
      memberComplaints
    });
  } catch (error) {
    console.error(`Error fetching surge ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: "Failed to fetch surge details" });
  }
};

/**
 * GET /api/analytics/cell-baseline
 * Query: cellId OR (lat & lng), category (optional, default "unclassified")
 */
exports.getCellBaseline = async (req, res) => {
  try {
    let { cellId, lat, lng, category = "unclassified" } = req.query;

    if (!cellId && lat && lng) {
      cellId = h3.latLngToCell(parseFloat(lat), parseFloat(lng), 8);
    }

    if (!cellId) {
      return res.status(400).json({ success: false, message: "Provide cellId or lat and lng" });
    }

    const neighborhoodCells = h3.gridDisk(cellId, 1);
    const expected10min = await getShrunkBaseline(neighborhoodCells, category, new Date());
    const cellRecord = await CellBaseline.findOne({ cellId, category: category.toLowerCase() });

    res.status(200).json({
      success: true,
      cellId,
      category,
      neighborhoodCellCount: neighborhoodCells.length,
      expected10min: Math.round(expected10min * 1000) / 1000,
      cellBaselineRecord: cellRecord || null
    });
  } catch (error) {
    console.error("Error fetching cell baseline:", error);
    res.status(500).json({ success: false, message: "Failed to fetch cell baseline" });
  }
};

/**
 * POST /api/analytics/surges/simulate
 * Injects 6 complaints within 10 mins from 3 distinct users to trigger a surge
 */
exports.simulateSurge = async (req, res) => {
  try {
    const category = (req.body.category || "water").toLowerCase();
    const lat = req.body.lat ? parseFloat(req.body.lat) : 19.0760;
    const lng = req.body.lng ? parseFloat(req.body.lng) : 72.8777;

    const cellId = h3.latLngToCell(lat, lng, 8);

    const mockUsers = [];
    for (let i = 1; i <= 3; i++) {
      let u = await User.findOne({ email: `sim_user_${i}@smartcity.gov` });
      if (!u) {
        u = await User.create({
          name: `Simulated Citizen ${i}`,
          email: `sim_user_${i}@smartcity.gov`,
          password: "password123",
          role: "citizen"
        });
      }
      mockUsers.push(u);
    }

    const injectedComplaints = [];
    let surgeEvalResult = null;

    for (let i = 0; i < 6; i++) {
      const user = mockUsers[i % 3];
      const pri = await calculatePriority(0.40, lat, lng, category);
      surgeEvalResult = await evaluateAndUpdateSurgeLifecycle({ latitude: lat, longitude: lng, category });

      const surgeBoost = surgeEvalResult.surgeFlag ? 0.20 * surgeEvalResult.surgeStrength : 0;
      const finalPriority = pri.priorityScoreS2 + surgeBoost;

      const complaint = await Complaint.create({
        citizen: user._id,
        title: `[Simulated Surge] Burst ${category} pipe reported in cluster #${i + 1}`,
        description: `Simulated high volume complaint #${i + 1} for ${category} leak in cell ${cellId}`,
        category,
        cellId,
        latitude: lat + (Math.random() - 0.5) * 0.002,
        longitude: lng + (Math.random() - 0.5) * 0.002,
        severityScore: 0.40,
        priorityScoreS2: pri.priorityScoreS2,
        surgeFlag: surgeEvalResult.surgeFlag,
        surgeId: surgeEvalResult.surgeId,
        surgeStrength: surgeEvalResult.surgeStrength,
        observedCount: surgeEvalResult.observedCount,
        expectedCount: surgeEvalResult.expectedCount,
        pValue: surgeEvalResult.pValue,
        finalPriority,
        isTestRecord: true
      });
      injectedComplaints.push(complaint);
    }

    const activeSurge = surgeEvalResult.surgeId ? await Surge.findById(surgeEvalResult.surgeId) : null;

    res.status(201).json({
      success: true,
      message: `Successfully simulated ${category} surge in cell ${cellId}!`,
      surge: activeSurge,
      injectedCount: injectedComplaints.length,
      metrics: surgeEvalResult
    });
  } catch (error) {
    console.error("Error simulating surge:", error);
    res.status(500).json({ success: false, message: "Failed to simulate surge: " + error.message });
  }
};
