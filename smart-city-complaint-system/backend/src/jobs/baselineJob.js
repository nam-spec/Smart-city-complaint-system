const cron = require("node-cron");
const h3 = require("h3-js");
const Complaint = require("../models/Complaint");
const CellBaseline = require("../models/CellBaseline");
const { getHourOfWeekUTC } = require("../utils/poissonMath");

/**
 * Updates CellBaseline collection over historical complaints
 * @param {number} lookbackWeeks - Number of historical weeks to sample (default 6)
 */
async function updateCellBaselines(lookbackWeeks = 6) {
  console.log(`[Baseline Job] Starting cell baseline update over last ${lookbackWeeks} weeks...`);

  const now = Date.now();
  const startDate = new Date(now - lookbackWeeks * 7 * 24 * 60 * 60 * 1000);

  // Fetch ALL complaints (both active and resolved) within the lookback period
  const complaints = await Complaint.find({
    createdAt: { $gte: startDate }
  }).select("latitude longitude category createdAt cellId");

  console.log(`[Baseline Job] Fetched ${complaints.length} historical complaints for baseline calculation.`);

  // Data structure: map[(cellId, hourOfWeek, category)] -> Array of length lookbackWeeks
  const weeklyCounts = new Map();

  for (const c of complaints) {
    let cellId = c.cellId;
    if (!cellId && c.latitude && c.longitude) {
      cellId = h3.latLngToCell(c.latitude, c.longitude, 8);
    }
    if (!cellId) continue;

    const createdAt = new Date(c.createdAt);
    const hourOfWeek = getHourOfWeekUTC(createdAt);
    const cat = (c.category || "unclassified").toLowerCase();

    // Determine week index (0 to lookbackWeeks - 1)
    const weekIndex = Math.min(
      lookbackWeeks - 1,
      Math.max(0, Math.floor((createdAt.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)))
    );

    const key = `${cellId}_${hourOfWeek}_${cat}`;
    if (!weeklyCounts.has(key)) {
      weeklyCounts.set(key, {
        cellId,
        hourOfWeek,
        category: cat,
        weeks: new Array(lookbackWeeks).fill(0)
      });
    }

    weeklyCounts.get(key).weeks[weekIndex] += 1;
  }

  console.log(`[Baseline Job] Processing ${weeklyCounts.size} distinct cell-hour-category tuples...`);

  const bulkOps = [];

  for (const entry of weeklyCounts.values()) {
    const totalCount = entry.weeks.reduce((a, b) => a + b, 0);
    const meanCount = totalCount / lookbackWeeks;

    // Compute Mean Absolute Deviation (MAD) over all lookback weeks including zero weeks
    const madCount = entry.weeks.reduce((acc, count) => acc + Math.abs(count - meanCount), 0) / lookbackWeeks;

    const parentWardId = h3.cellToParent(entry.cellId, 6);

    bulkOps.push({
      updateOne: {
        filter: {
          cellId: entry.cellId,
          hourOfWeek: entry.hourOfWeek,
          category: entry.category
        },
        update: {
          $set: {
            parentWardId,
            meanCount: Math.round(meanCount * 10000) / 10000,
            totalCount,
            madCount: Math.round(madCount * 10000) / 10000,
            nWeeks: lookbackWeeks,
            updatedAt: new Date()
          }
        },
        upsert: true
      }
    });
  }

  if (bulkOps.length > 0) {
    await CellBaseline.bulkWrite(bulkOps);
    console.log(`[Baseline Job] Successfully upserted ${bulkOps.length} cell baseline records.`);
  } else {
    console.log("[Baseline Job] No baseline records to update.");
  }
}

/**
 * Initializes nightly cron job (runs at 02:00 AM every night)
 */
function initBaselineCron() {
  cron.schedule("0 2 * * *", async () => {
    try {
      await updateCellBaselines(6);
    } catch (err) {
      console.error("[Baseline Job Error]:", err.message);
    }
  });
  console.log("[Baseline Job] Scheduled nightly cron job (02:00 AM).");
}

module.exports = {
  updateCellBaselines,
  initBaselineCron
};
