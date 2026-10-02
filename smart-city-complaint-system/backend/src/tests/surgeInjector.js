require("dotenv").config({ path: __dirname + "/../../.env" });
const mongoose = require("mongoose");
const assert = require("assert");
const h3 = require("h3-js");
const User = require("../models/User");
const Complaint = require("../models/Complaint");
const Surge = require("../models/Surge");
const { calculatePriority } = require("../utils/priorityEngine");
const { evaluateAndUpdateSurgeLifecycle } = require("../utils/surgeEngine");
const { processSurgeLifecycles } = require("../jobs/surgeLifecycleJob");

async function runQueueSimulation() {
  console.log("=================================================");
  console.log("SURGE INJECTOR & QUEUE RE-RANKING SIMULATION TEST");
  console.log("=================================================");

  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/smart-city-complaint-system";
  console.log(`Connecting to MongoDB (${mongoUri})...`);

  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB.");

    // Clean test environment
    await Complaint.deleteMany({ isTestRecord: true });
    await Surge.deleteMany({});

    // 1. Create 3 test citizens
    const u1 = await User.findOneAndUpdate(
      { email: "sim_citizen1@test.com" },
      { name: "Sim Citizen 1", email: "sim_citizen1@test.com", role: "citizen" },
      { upsert: true, new: true }
    );
    const u2 = await User.findOneAndUpdate(
      { email: "sim_citizen2@test.com" },
      { name: "Sim Citizen 2", email: "sim_citizen2@test.com", role: "citizen" },
      { upsert: true, new: true }
    );
    const u3 = await User.findOneAndUpdate(
      { email: "sim_citizen3@test.com" },
      { name: "Sim Citizen 3", email: "sim_citizen3@test.com", role: "citizen" },
      { upsert: true, new: true }
    );

    const lat = 19.0760; // Mumbai Central
    const lng = 72.8777;
    const cellId = h3.latLngToCell(lat, lng, 8);

    // 2. Submit high-severity Gas Leak complaint (S2 ~ 0.85)
    console.log("\n[STEP 1] Submitting single Gas Leak emergency complaint...");
    const gasPri = await calculatePriority(0.95, lat, lng, "gas");
    const gasSurge = await evaluateAndUpdateSurgeLifecycle({ latitude: lat, longitude: lng, category: "gas" });
    const gasComplaint = await Complaint.create({
      citizen: u1._id,
      description: "Severe toxic gas leak from commercial cylinder in market",
      category: "gas",
      cellId,
      latitude: lat,
      longitude: lng,
      severityScore: 0.95,
      priorityScoreS2: gasPri.priorityScoreS2,
      surgeFlag: gasSurge.surgeFlag,
      surgeId: gasSurge.surgeId,
      finalPriority: gasPri.priorityScoreS2 + (gasSurge.surgeFlag ? 0.2 * gasSurge.surgeStrength : 0),
      isTestRecord: true
    });
    console.log(`  Gas Leak S2: ${gasComplaint.priorityScoreS2.toFixed(3)}, Final Priority: ${gasComplaint.finalPriority.toFixed(3)}`);

    // 3. Inject Noise surge: 6 complaints from 3 distinct users in 10 minutes
    console.log("\n[STEP 2] Injecting noise surge (6 complaints from 3 distinct users)...");
    const noiseUsers = [u1, u2, u3, u1, u2, u3];
    const noiseComplaints = [];

    for (let i = 0; i < noiseUsers.length; i++) {
      const noisePri = await calculatePriority(0.35, lat, lng, "noise");
      const noiseSurge = await evaluateAndUpdateSurgeLifecycle({ latitude: lat, longitude: lng, category: "noise" });
      const surgeBoost = noiseSurge.surgeFlag ? 0.20 * noiseSurge.surgeStrength : 0;
      const finalPriority = noisePri.priorityScoreS2 + surgeBoost;

      const c = await Complaint.create({
        citizen: noiseUsers[i]._id,
        description: `Loud party music noise disturbance ${i + 1}`,
        category: "noise",
        cellId,
        latitude: lat,
        longitude: lng,
        severityScore: 0.35,
        priorityScoreS2: noisePri.priorityScoreS2,
        surgeFlag: noiseSurge.surgeFlag,
        surgeId: noiseSurge.surgeId,
        surgeStrength: noiseSurge.surgeStrength,
        finalPriority,
        isTestRecord: true
      });
      noiseComplaints.push(c);
    }

    const activeNoiseSurge = await Surge.findOne({ status: "active", category: "noise", cellId });
    console.log("  activeNoiseSurge found:", activeNoiseSurge);
    assert(activeNoiseSurge !== null, "Noise surge MUST be active after 6 complaints from 3 users");
    console.log(`  SUCCESS: Active Noise Surge created! Peak Z: ${activeNoiseSurge.peakZ.toFixed(2)}, minP: ${activeNoiseSurge.minP}`);

    // 4. Verify Queue Ordering: Gas Leak must outrank Noise Surge!
    console.log("\n[STEP 3] Verifying Queue Priority Assertion...");
    const highestNoisePriority = Math.max(...noiseComplaints.map(c => c.finalPriority));
    console.log(`  Top Noise Surge Final Priority: ${highestNoisePriority.toFixed(3)}`);
    console.log(`  Gas Leak Emergency Final Priority: ${gasComplaint.finalPriority.toFixed(3)}`);

    assert(
      gasComplaint.finalPriority > highestNoisePriority,
      `CRITICAL FAILURE: Gas leak (${gasComplaint.finalPriority}) was outranked by noise surge (${highestNoisePriority})!`
    );
    console.log("  PASS: Gas Leak emergency cleanly outranks Noise Surge in the queue!");

    // 5. Test Surge Resolution after 2 quiet windows
    console.log("\n[STEP 4] Testing Surge Lifecycle Resolution (2 Quiet Windows)...");
    // Backdate all complaints in neighborhood beyond 10-minute window to simulate quiet window
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    await mongoose.connection.db.collection("complaints").updateMany({}, { $set: { createdAt: fifteenMinsAgo } });

    activeNoiseSurge.quietWindows = 1;
    await activeNoiseSurge.save();

    console.log("  Running 10-minute surge lifecycle cron processor...");
    await processSurgeLifecycles();

    const resolvedSurge = await Surge.findById(activeNoiseSurge._id);
    assert.strictEqual(resolvedSurge.status, "resolved", "Surge status should be resolved after 2 quiet windows");
    console.log("  PASS: Noise surge resolved cleanly after 2 quiet windows.");

    // Cleanup test records
    await Complaint.deleteMany({ isTestRecord: true });
    await Surge.deleteMany({ _id: activeNoiseSurge._id });

    console.log("\n=================================================");
    console.log("ALL QUEUE RE-RANKING SIMULATION TESTS PASSED!");
    console.log("=================================================");
  } catch (err) {
    console.error("Simulation error:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

runQueueSimulation();
