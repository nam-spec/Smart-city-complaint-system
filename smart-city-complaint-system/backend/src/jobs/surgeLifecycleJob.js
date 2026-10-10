const cron = require("node-cron");
const h3 = require("h3-js");
const Surge = require("../models/Surge");
const Complaint = require("../models/Complaint");
const { poissonTail } = require("../utils/poissonMath");
const { getShrunkBaseline } = require("../utils/priorityEngine");
const { raiseAlert } = require("../utils/alertService");

/**
 * Periodically checks all active surges (runs every 10 minutes)
 * Closes surges when the complaint count returns to normal for 2 consecutive windows (quietWindows >= 2).
 */
async function processSurgeLifecycles() {
  console.log("[Surge Lifecycle Job] Evaluating active surges for resolution...");

  const activeSurges = await Surge.find({ status: "active" });
  if (activeSurges.length === 0) {
    console.log("[Surge Lifecycle Job] No active surges to process.");
    return;
  }

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  for (const surge of activeSurges) {
    try {
      const cells = h3.gridDisk(surge.cellId, 1);
      const recent = await Complaint.find(
        { cellId: { $in: cells }, category: surge.category, createdAt: { $gte: tenMinutesAgo }, isFake: { $ne: true } },
        "citizen user"
      );

      const observed = recent.length;
      const users = new Set(recent.map(r => String(r.citizen || r.user || r._id))).size;

      const expected = await getShrunkBaseline(cells, surge.category, new Date());
      const p = poissonTail(observed, expected);
      const z = (observed - expected) / Math.sqrt(expected + 1);

      const isSurge = p < 0.01 && observed >= 5 && users >= 3;
      console.log(`[Surge Lifecycle Job] ID: ${surge._id}, Category: ${surge.category}, Observed: ${observed}, Expected: ${expected.toFixed(2)}, p: ${p}, isSurge: ${isSurge}`);

      if (!isSurge) {
        surge.quietWindows += 1;
        console.log(`[Surge Lifecycle Job] Surge ${surge._id} (Cell ${surge.cellId}, Cat ${surge.category}) quiet window ${surge.quietWindows}/2.`);
        if (surge.quietWindows >= 2) {
          surge.status = "resolved";
          surge.resolvedAt = new Date();
          console.log(`[Surge Lifecycle Job] RESOLVED surge ${surge._id} after 2 quiet windows.`);
          const mins = Math.round((Date.now() - new Date(surge.startedAt).getTime()) / 60000);
          await raiseAlert({
            type: "SURGE_RESOLVED",
            level: "info",
            title: `Surge resolved: ${surge.category}`,
            message: `The ${surge.category} surge (${surge.complaintCount} complaints, ${surge.distinctUsers} citizens) ` +
              `returned to normal after ${mins} minutes.`,
            category: surge.category,
            cellId: surge.cellId,
            centroid: surge.centroid,
            surgeId: surge._id,
            metrics: { observed, expected, pValue: p, zScore: z }
          }, { dedupKey: `resolved:${surge._id}`, cooldownMinutes: 1440 });
        }
      } else {
        surge.quietWindows = 0;
        surge.complaintCount = Math.max(surge.complaintCount, observed);
        surge.distinctUsers = Math.max(surge.distinctUsers, users);
        if (z > surge.peakZ) {
          surge.peakZ = z;
          surge.peakAt = new Date();
        }
        if (p < surge.minP) {
          surge.minP = p;
        }
      }

      await surge.save();
    } catch (err) {
      console.error(`[Surge Lifecycle Job Error] Failed processing surge ${surge._id}:`, err);
    }
  }
}

/**
 * Initializes 10-minute cron schedule for active surge lifecycle maintenance
 */
function initSurgeLifecycleCron() {
  cron.schedule("*/10 * * * *", async () => {
    try {
      await processSurgeLifecycles();
    } catch (err) {
      console.error("[Surge Lifecycle Cron Error]:", err.message);
    }
  });
  console.log("[Surge Lifecycle Job] Scheduled 10-minute active surge lifecycle cron.");
}

module.exports = {
  processSurgeLifecycles,
  initSurgeLifecycleCron
};
