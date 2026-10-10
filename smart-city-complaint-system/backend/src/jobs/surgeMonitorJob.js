const cron = require("node-cron");
const Complaint = require("../models/Complaint");
const CellBaseline = require("../models/CellBaseline");
const { poissonTail } = require("../utils/poissonMath");
const { getHourOfWeekUTC } = require("../utils/poissonMath");
const { raiseAlert } = require("../utils/alertService");

/**
 * City-wide surge monitor (runs every 2 minutes).
 *
 * The per-complaint engine (surgeEngine.js) catches surges inside one neighbourhood.
 * This job catches the other kind: a category rising across the WHOLE city at once
 * (e.g. water-supply failure in many wards, a storm causing tree falls everywhere),
 * which can stay below the threshold in every single neighbourhood.
 *
 * Expected hourly count per category =
 *   max( sum of CellBaseline.meanCount for this hour-of-week,
 *        average hourly count of the previous 7 days ),
 * then a Poisson upper-tail test on the last 60 minutes (fake complaints excluded).
 *
 * Env (optional): CITYWIDE_MIN_COMPLAINTS (default 10), CITYWIDE_MIN_USERS (default 5),
 *                 CITYWIDE_P (default 0.001)
 */
const WINDOW_MIN = 60;

async function expectedHourly(category, now) {
  const hourOfWeek = getHourOfWeekUTC(now);
  const baselines = await CellBaseline.find({ hourOfWeek, category }).select("meanCount");
  const baselineSum = baselines.reduce((a, b) => a + (b.meanCount || 0), 0);

  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const hourAgo = new Date(now.getTime() - WINDOW_MIN * 60 * 1000);
  const pastWeek = await Complaint.countDocuments({
    category, isFake: { $ne: true }, createdAt: { $gte: weekAgo, $lt: hourAgo }
  });
  const rolling = pastWeek / (7 * 24 - 1);
  return Math.max(baselineSum, rolling, 0.5);
}

async function runCitywideSurgeCheck(now = new Date()) {
  const minCount = parseInt(process.env.CITYWIDE_MIN_COMPLAINTS || "10", 10);
  const minUsers = parseInt(process.env.CITYWIDE_MIN_USERS || "5", 10);
  const pThreshold = parseFloat(process.env.CITYWIDE_P || "0.001");
  const since = new Date(now.getTime() - WINDOW_MIN * 60 * 1000);

  const groups = await Complaint.aggregate([
    { $match: { createdAt: { $gte: since }, isFake: { $ne: true }, category: { $nin: ["unclassified", "Unclassified"] } } },
    {
      $group: {
        _id: "$category",
        observed: { $sum: 1 },
        users: { $addToSet: "$citizen" },
        cells: { $addToSet: "$cellId" },
        lat: { $avg: "$latitude" },
        lng: { $avg: "$longitude" }
      }
    },
    { $match: { observed: { $gte: minCount } } }
  ]);

  const raised = [];
  for (const g of groups) {
    const category = g._id;
    const users = g.users.length;
    if (users < minUsers) continue;
    const expected = await expectedHourly(category, now);
    const p = poissonTail(g.observed, expected);
    const z = (g.observed - expected) / Math.sqrt(expected + 1);
    if (p >= pThreshold) continue;

    const level = p < 1e-6 || g.observed >= 3 * expected + 20 ? "critical" : "warning";
    const alert = await raiseAlert({
      type: "CITYWIDE_SURGE",
      level,
      title: `City-wide ${category} spike: ${g.observed} complaints in the last hour`,
      message: `${g.observed} ${category} complaints from ${users} citizens across ${g.cells.length} areas in the last hour, ` +
        `about ${expected.toFixed(1)} expected (p=${p < 0.0001 ? p.toExponential(1) : p.toFixed(4)}, z=${z.toFixed(1)}). ` +
        `This may be a single upstream failure (e.g. main water line, power feeder, storm).`,
      category,
      centroid: { lat: g.lat, lng: g.lng },
      metrics: {
        observed: g.observed,
        expected: Math.round(expected * 100) / 100,
        pValue: p,
        zScore: Math.round(z * 100) / 100,
        distinctUsers: users,
        windowMinutes: WINDOW_MIN
      }
    }, { dedupKey: `citywide:${category}`, cooldownMinutes: 60 });
    if (alert) raised.push(alert);
  }
  return raised;
}

function initSurgeMonitorCron() {
  cron.schedule("*/2 * * * *", async () => {
    try {
      await runCitywideSurgeCheck();
    } catch (err) {
      console.error("[Surge Monitor Cron Error]:", err.message);
    }
  });
  console.log("[Surge Monitor] Scheduled 2-minute city-wide surge check.");
}

module.exports = { runCitywideSurgeCheck, initSurgeMonitorCron };
