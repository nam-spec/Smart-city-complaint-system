const h3 = require("h3-js");
const Complaint = require("../models/Complaint");
const Surge = require("../models/Surge");
const { getShrunkBaseline } = require("./priorityEngine");

/**
 * Calculates upper-tail Poisson probability P(X >= n | lambda)
 * P(X >= n) = 1 - sum_{k=0}^{n-1} (lambda^k * e^(-lambda) / k!)
 */
function poissonTail(n, lambda) {
  let term = Math.exp(-lambda), cdf = 0;
  for (let k = 0; k < n; k++) {
    cdf += term;
    term *= lambda / (k + 1);
  }
  return Math.max(1 - cdf, 1e-12);
}

/**
 * Evaluates spatial-temporal complaint surge as a statistical hypothesis test.
 * Expected baseline rate is computed on the exact SAME 7-cell neighborhood area.
 */
async function evaluateSurge(c) {
  const lat = c.lat !== undefined ? c.lat : c.latitude;
  const lon = c.lon !== undefined ? c.lon : c.longitude;
  const category = (c.category || "unclassified").toLowerCase();

  const centerCell = h3.latLngToCell(lat, lon, 8);
  const cells = h3.gridDisk(centerCell, 1);                       // 7 H3 Resolution 8 cells
  const since = new Date(Date.now() - 10 * 60 * 1000);

  const recent = await Complaint.find(
    { cellId: { $in: cells }, category, createdAt: { $gte: since } },
    "citizen user"
  );
  const observed = recent.length;
  const users = new Set(recent.map(r => String(r.citizen || r.user || r._id))).size;

  const expected = await getShrunkBaseline(cells, category, new Date());
  const p = poissonTail(observed, expected);
  const z = (observed - expected) / Math.sqrt(expected + 1);

  // Anti-spam rule: p < 0.01, observed >= 5, distinct users >= 3
  const isSurge = p < 0.01 && observed >= 5 && users >= 3;
  const strength = isSurge ? Math.min(1, -Math.log10(p) / 6) : 0;

  return {
    centerCell,
    cells,
    observed,
    expected,
    p,
    z,
    isSurge,
    strength,
    users,
    lat,
    lon,
    category
  };
}

/**
 * Evaluates surge for a new complaint and handles neighborhood-aware surge deduplication.
 */
async function evaluateAndUpdateSurgeLifecycle(c) {
  const evalResult = await evaluateSurge(c);
  const { centerCell, cells, observed, expected, p, z, isSurge, strength, users, lat, lon, category } = evalResult;

  // 1. Search for existing active surge in the 7-cell neighborhood (`gridDisk`)
  const activeSurges = await Surge.find({
    status: "active",
    category,
    cellId: { $in: cells }
  });

  let activeSurge = activeSurges.length > 0 ? activeSurges[0] : null;

  if (activeSurge) {
    // Neighborhood surge already active -> update metrics & reset quiet windows
    activeSurge.complaintCount = Math.max(activeSurge.complaintCount + 1, observed);
    activeSurge.distinctUsers = Math.max(activeSurge.distinctUsers, users);
    if (z > activeSurge.peakZ) {
      activeSurge.peakZ = z;
      activeSurge.peakAt = new Date();
    }
    if (p < activeSurge.minP) {
      activeSurge.minP = p;
    }
    activeSurge.quietWindows = 0; // reset quiet windows on new activity
    await activeSurge.save();

    return {
      surgeFlag: true,
      surgeId: activeSurge._id,
      observedCount: observed,
      expectedCount: Math.round(expected * 1000) / 1000,
      pValue: p,
      surgeStrength: strength,
      isSurge: true
    };
  } else if (isSurge) {
    // No active surge in neighborhood, but surge criteria met -> create new active surge
    const newSurge = await Surge.create({
      cellId: centerCell,
      centroid: { lat, lng: lon },
      category,
      startedAt: new Date(),
      peakAt: new Date(),
      status: "active",
      complaintCount: observed,
      distinctUsers: users,
      peakZ: z,
      minP: p,
      quietWindows: 0
    });

    return {
      surgeFlag: true,
      surgeId: newSurge._id,
      observedCount: observed,
      expectedCount: Math.round(expected * 1000) / 1000,
      pValue: p,
      surgeStrength: strength,
      isSurge: true
    };
  }

  // No active surge and surge threshold not met
  return {
    surgeFlag: false,
    surgeId: null,
    observedCount: observed,
    expectedCount: Math.round(expected * 1000) / 1000,
    pValue: p,
    surgeStrength: 0,
    isSurge: false
  };
}

module.exports = {
  poissonTail,
  evaluateSurge,
  evaluateAndUpdateSurgeLifecycle
};
