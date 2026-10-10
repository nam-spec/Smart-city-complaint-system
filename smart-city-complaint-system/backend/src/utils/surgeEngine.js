const h3 = require("h3-js");
const Complaint = require("../models/Complaint");
const Surge = require("../models/Surge");
const { getShrunkBaseline } = require("./priorityEngine");
const { raiseAlert } = require("./alertService");

// Confirmed surge: p < 0.01, observed >= 5, distinct users >= 3 (anti-spam rule)
const SURGE_P = 0.01;
const SURGE_MIN_OBS = 5;
const SURGE_MIN_USERS = 3;
// Early warning ("possible surge"): weaker evidence (p < 0.10, >= 3 complaints, >= 2 citizens),
// raised before the surge is confirmed so the admin can act early
const WATCH_P = 0.10;
const WATCH_MIN_OBS = 3;
const WATCH_MIN_USERS = 2;
const WINDOW_MIN = 10;

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
 *
 * - Complaints flagged as fake / duplicate are NOT counted (they must not create surges).
 * - If `c.citizen` is given, the complaint being submitted right now is counted too
 *   (it is evaluated before it is saved). Callers that don't pass it keep the old behaviour.
 */
async function evaluateSurge(c) {
  const lat = c.lat !== undefined ? c.lat : c.latitude;
  const lon = c.lon !== undefined ? c.lon : c.longitude;
  const category = (c.category || "unclassified").toLowerCase();

  const centerCell = h3.latLngToCell(lat, lon, 8);
  const cells = h3.gridDisk(centerCell, 1);                       // 7 H3 Resolution 8 cells
  const since = new Date(Date.now() - WINDOW_MIN * 60 * 1000);

  const recent = await Complaint.find(
    { cellId: { $in: cells }, category, createdAt: { $gte: since }, isFake: { $ne: true } },
    "citizen user"
  );
  let observed = recent.length;
  const userSet = new Set(recent.map(r => String(r.citizen || r.user || r._id)));
  if (c.citizen) {
    observed += 1;
    userSet.add(String(c.citizen));
  }
  const users = userSet.size;

  const expected = await getShrunkBaseline(cells, category, new Date());
  const p = poissonTail(observed, expected);
  const z = (observed - expected) / Math.sqrt(expected + 1);

  const isSurge = p < SURGE_P && observed >= SURGE_MIN_OBS && users >= SURGE_MIN_USERS;
  const isPossibleSurge = !isSurge && p < WATCH_P && observed >= WATCH_MIN_OBS && users >= WATCH_MIN_USERS;
  const strength = isSurge ? Math.min(1, -Math.log10(p) / 6) : 0;

  return {
    centerCell,
    cells,
    observed,
    expected,
    p,
    z,
    isSurge,
    isPossibleSurge,
    strength,
    users,
    lat,
    lon,
    category
  };
}

function fmtP(p) {
  return p < 0.0001 ? p.toExponential(1) : p.toFixed(4);
}

function levelForStrength(strength) {
  return strength >= 0.66 ? "critical" : "warning";
}

/**
 * Evaluates surge for a new complaint and handles neighborhood-aware surge deduplication.
 * Raises admin alerts: POSSIBLE_SURGE (early warning), SURGE_CONFIRMED, SURGE_ESCALATED.
 */
async function evaluateAndUpdateSurgeLifecycle(c) {
  const evalResult = await evaluateSurge(c);
  const { centerCell, cells, observed, expected, p, z, isSurge, isPossibleSurge, strength, users, lat, lon, category } = evalResult;
  const metrics = {
    observed,
    expected: Math.round(expected * 1000) / 1000,
    pValue: p,
    zScore: Math.round(z * 100) / 100,
    distinctUsers: users,
    strength: Math.round(strength * 100) / 100,
    windowMinutes: WINDOW_MIN
  };

  // 1. Search for existing active surge in the 7-cell neighborhood (`gridDisk`)
  const activeSurges = await Surge.find({
    status: "active",
    category,
    cellId: { $in: cells }
  });

  let activeSurge = activeSurges.length > 0 ? activeSurges[0] : null;

  if (activeSurge) {
    // Neighborhood surge already active -> update metrics & reset quiet windows
    const previousPeakZ = activeSurge.peakZ || 0;
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

    // Escalation: the surge keeps growing (peak z up by >= 50%)
    if (previousPeakZ > 0 && z >= previousPeakZ * 1.5) {
      await raiseAlert({
        type: "SURGE_ESCALATED",
        level: "critical",
        title: `Surge escalating: ${category} (${activeSurge.complaintCount} complaints)`,
        message: `The active ${category} surge near (${activeSurge.centroid.lat.toFixed(4)}, ${activeSurge.centroid.lng.toFixed(4)}) is growing: ` +
          `${observed} complaints in ${WINDOW_MIN} min vs ${expected.toFixed(2)} expected (z=${z.toFixed(1)}, previous peak ${previousPeakZ.toFixed(1)}).`,
        category,
        cellId: activeSurge.cellId,
        centroid: activeSurge.centroid,
        surgeId: activeSurge._id,
        metrics
      }, { dedupKey: `escalated:${activeSurge._id}`, cooldownMinutes: 15 });
    }

    return {
      surgeFlag: true,
      surgeId: activeSurge._id,
      observedCount: observed,
      expectedCount: Math.round(expected * 1000) / 1000,
      pValue: p,
      surgeStrength: strength,
      isSurge: true,
      isPossibleSurge: false
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

    await raiseAlert({
      type: "SURGE_CONFIRMED",
      level: levelForStrength(strength),
      title: `Surge detected: ${category} - ${observed} complaints in ${WINDOW_MIN} min`,
      message: `${observed} ${category} complaints from ${users} different citizens within ${WINDOW_MIN} minutes near ` +
        `(${lat.toFixed(4)}, ${lon.toFixed(4)}). Normally ${expected.toFixed(2)} are expected (p=${fmtP(p)}, z=${z.toFixed(1)}). ` +
        `Dispatch a team and check for a common root cause.`,
      category,
      cellId: centerCell,
      centroid: { lat, lng: lon },
      surgeId: newSurge._id,
      metrics
    }, { dedupKey: `confirmed:${newSurge._id}`, cooldownMinutes: 60 });

    return {
      surgeFlag: true,
      surgeId: newSurge._id,
      observedCount: observed,
      expectedCount: Math.round(expected * 1000) / 1000,
      pValue: p,
      surgeStrength: strength,
      isSurge: true,
      isPossibleSurge: false
    };
  }

  // No active surge and surge threshold not met -> maybe an early warning
  if (isPossibleSurge) {
    // one early warning per neighbourhood (res-7 parent ~ 5 km²) and category per 30 minutes
    const area = h3.cellToParent(centerCell, 7);
    await raiseAlert({
      type: "POSSIBLE_SURGE",
      level: "watch",
      title: `Possible surge building: ${category} (${observed} complaints in ${WINDOW_MIN} min)`,
      message: `${observed} ${category} complaints from ${users} citizens near (${lat.toFixed(4)}, ${lon.toFixed(4)}) in the last ` +
        `${WINDOW_MIN} minutes, ${expected.toFixed(2)} expected (p=${fmtP(p)}). Not yet a confirmed surge - keep watching.`,
      category,
      cellId: centerCell,
      centroid: { lat, lng: lon },
      metrics
    }, { dedupKey: `possible:${area}:${category}`, cooldownMinutes: 30 });
  }

  return {
    surgeFlag: false,
    surgeId: null,
    observedCount: observed,
    expectedCount: Math.round(expected * 1000) / 1000,
    pValue: p,
    surgeStrength: 0,
    isSurge: false,
    isPossibleSurge
  };
}

module.exports = {
  poissonTail,
  evaluateSurge,
  evaluateAndUpdateSurgeLifecycle,
  SURGE_P,
  SURGE_MIN_OBS,
  SURGE_MIN_USERS
};
