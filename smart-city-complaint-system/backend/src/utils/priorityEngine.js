const h3 = require("h3-js");
const Complaint = require("../models/Complaint");
const CellBaseline = require("../models/CellBaseline");
const {
  getHourOfWeekUTC,
  computeZScore,
  normalizeAnomalyZScore,
  poissonTail
} = require("./poissonMath");

/**
 * Hierarchical Empirical Bayes Shrinkage Cascade for H3 Cell Baseline Lookup
 * Formula: λ_shrunk = (n * λ_local + k * λ_parent) / (n + k)  where k ≈ 20
 * Fallback Chain: Cell -> Ward (H3 Res 6) -> City Average -> Default (~1 per 10 min)
 *
 * @param {Array<string>} cells - Array of H3 Res 8 cell IDs (7-cell neighborhood)
 * @param {string} category - Complaint category
 * @param {Date} date - Evaluation timestamp (defaults to now)
 * @param {number} k - Shrinkage prior pseudo-observation weight (default 20)
 * @returns {Promise<number>} Expected 10-minute baseline count across the neighborhood
 */
async function getShrunkBaseline(cells, category, date = new Date(), k = 20) {
  const hourOfWeek = getHourOfWeekUTC(date);
  const cat = (category || "unclassified").toLowerCase();

  // Level 0: Global Default Baseline (approx 1.0 per 10 min across 7-cell neighborhood => 6.0 / 7 per cell hourly)
  const defaultHourly = 6.0 / (cells.length || 7);

  // Level 1: City Average Baseline (shrunk towards default)
  let cityShrunkHourly = defaultHourly;
  const cityBaselines = await CellBaseline.find({
    hourOfWeek,
    category: cat
  }).select("meanCount totalCount nWeeks");

  if (cityBaselines.length > 0) {
    const nCity = cityBaselines.reduce((acc, b) => acc + (b.totalCount || (b.meanCount * (b.nWeeks || 6))), 0);
    const cityRawMean = cityBaselines.reduce((acc, b) => acc + b.meanCount, 0) / cityBaselines.length;
    cityShrunkHourly = (nCity * cityRawMean + k * defaultHourly) / (nCity + k);
  }

  // Level 2: Cache Ward Level Baseline (shrunk towards city baseline)
  const wardCache = new Map();
  const getWardShrunkHourly = async (parentWardId) => {
    if (wardCache.has(parentWardId)) {
      return wardCache.get(parentWardId);
    }

    const wardBaselines = await CellBaseline.find({
      parentWardId,
      hourOfWeek,
      category: cat
    }).select("meanCount totalCount nWeeks");

    let wardShrunkHourly = cityShrunkHourly;
    if (wardBaselines.length > 0) {
      const nWard = wardBaselines.reduce((acc, b) => acc + (b.totalCount || (b.meanCount * (b.nWeeks || 6))), 0);
      const wardRawMean = wardBaselines.reduce((acc, b) => acc + b.meanCount, 0) / wardBaselines.length;
      wardShrunkHourly = (nWard * wardRawMean + k * cityShrunkHourly) / (nWard + k);
    }

    wardCache.set(parentWardId, wardShrunkHourly);
    return wardShrunkHourly;
  };

  // Level 3: Cell Level Baseline (shrunk towards ward baseline)
  let totalExpectedHourly = 0;

  for (const cell of cells) {
    const parentWardId = h3.cellToParent(cell, 6);
    const wardShrunkHourly = await getWardShrunkHourly(parentWardId);

    const cellBaseline = await CellBaseline.findOne({
      cellId: cell,
      hourOfWeek,
      category: cat
    }).select("meanCount totalCount nWeeks");

    let cellShrunkHourly = wardShrunkHourly;
    if (cellBaseline) {
      const nCell = cellBaseline.totalCount || (cellBaseline.meanCount * (cellBaseline.nWeeks || 6));
      const cellRawMean = cellBaseline.meanCount;
      cellShrunkHourly = (nCell * cellRawMean + k * wardShrunkHourly) / (nCell + k);
    }

    totalExpectedHourly += cellShrunkHourly;
  }

  // Convert hourly expected sum to 10-minute window expected baseline
  const expected10min = totalExpectedHourly / 6;
  return Math.max(expected10min, 0.1);
}

/**
 * Core Priority Engine (STSEP Engine) with H3 Grid Cells & Poisson Anomaly Z-Scores
 */
const calculatePriority = async (
  severityScore,
  latitude,
  longitude,
  category = "unclassified"
) => {
  const now = new Date();

  // 1️⃣ H3 Spatial Indexing & 7-Cell Neighborhood (`gridDisk`)
  const centerCell = h3.latLngToCell(latitude, longitude, 8);
  const cells = h3.gridDisk(centerCell, 1); // 7 H3 Resolution 8 cells (~500m radius cluster)

  // Observed complaints in the last 10 minutes across the 7 cells
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
  const observed = await Complaint.countDocuments({
    cellId: { $in: cells },
    createdAt: { $gte: tenMinutesAgo }
  });

  // Expected 10-minute baseline via Shrinkage Fallback Cascade
  const expected = await getShrunkBaseline(cells, category, now);

  // Poisson Z-Score & Normalized Anomaly Score
  const z = computeZScore(observed, expected);
  const spatial_norm = normalizeAnomalyZScore(z);
  const pTail = poissonTail(observed, expected);

  // 2️⃣ Temporal Density (System-wide 10-minute sliding window)
  const temporalDensity = await Complaint.countDocuments({
    createdAt: { $gte: tenMinutesAgo }
  });

  // 3️⃣ Growth Rate & Acceleration
  const currentWindowStart = new Date(Math.floor(now.getTime() / (10 * 60 * 1000)) * (10 * 60 * 1000));
  const prevWindowStart = new Date(currentWindowStart.getTime() - 10 * 60 * 1000);
  const prevPrevWindowStart = new Date(prevWindowStart.getTime() - 10 * 60 * 1000);

  const lambda_t = await Complaint.countDocuments({
    createdAt: { $gte: currentWindowStart }
  });

  const lambda_prev1 = await Complaint.countDocuments({
    createdAt: { $gte: prevWindowStart, $lt: currentWindowStart }
  });

  const lambda_prev2 = await Complaint.countDocuments({
    createdAt: { $gte: prevPrevWindowStart, $lt: prevWindowStart }
  });

  const growth_rate = Math.log((lambda_t + 1) / (lambda_prev1 + 1));
  const growth_prev = Math.log((lambda_prev1 + 1) / (lambda_prev2 + 1));
  const acceleration = growth_rate - growth_prev;

  // 4️⃣ Normalization
  const severity_norm = Math.min(Math.max((severityScore - 0.35) / (1.0 - 0.35), 0), 1);
  const temporal_norm = Math.min(temporalDensity / 20, 1);
  const acceleration_norm = Math.min(Math.max((acceleration + 3) / 6, 0), 1);

  // 5️⃣ Stage-1 optimized weights: α1=0.0, β1=0.29, γ1=0.40, δ1=0.31
  const priorityScore = (
    0.0 * severity_norm +
    0.29 * spatial_norm +
    0.40 * temporal_norm +
    0.31 * acceleration_norm
  );

  // 6️⃣ Stage-2 optimized weights: α2=0.76, β2=0.18, γ2=0.06
  const priorityScoreS2 = (
    0.76 * severity_norm +
    0.18 * spatial_norm +
    0.06 * temporal_norm
  );

  return {
    cellId: centerCell,
    observedCount: observed,
    expectedCount: Math.round(expected * 1000) / 1000,
    zScore: Math.round(z * 100) / 100,
    poissonPTail: Math.round(pTail * 10000) / 10000,
    priorityScore: Math.round(priorityScore * 100) / 100,
    priorityScoreS2: Math.round(priorityScoreS2 * 100) / 100,
    spatialDensity: observed,
    spatialAnomalyNorm: spatial_norm,
    temporalDensity,
    acceleration
  };
};

module.exports = {
  calculatePriority,
  getShrunkBaseline
};