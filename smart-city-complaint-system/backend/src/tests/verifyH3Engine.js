require("dotenv").config({ path: __dirname + "/../../.env" });
const mongoose = require("mongoose");
const assert = require("assert");
const h3 = require("h3-js");
const {
  getHourOfWeekUTC,
  computeZScore,
  normalizeAnomalyZScore,
  poissonTail
} = require("../utils/poissonMath");
const { getShrunkBaseline, calculatePriority } = require("../utils/priorityEngine");
const CellBaseline = require("../models/CellBaseline");
const Complaint = require("../models/Complaint");

async function runTests() {
  console.log("==========================================");
  console.log("RUNNING H3 SPATIAL-TEMPORAL ENGINE VERIFICATION");
  console.log("==========================================");

  // 1. Math & UTC Timezone Unit Tests
  console.log("\n[TEST 1] Testing UTC Hour-of-Week...");
  const sundayMidnight = new Date(Date.UTC(2026, 0, 4, 0, 0, 0)); // 2026-01-04 is a Sunday
  const hourSun = getHourOfWeekUTC(sundayMidnight);
  assert.strictEqual(hourSun, 0, `Sunday 00:00 UTC should be 0, got ${hourSun}`);

  const satLate = new Date(Date.UTC(2026, 0, 10, 23, 45, 0)); // Saturday 23:45 UTC
  const hourSat = getHourOfWeekUTC(satLate);
  assert.strictEqual(hourSat, 167, `Saturday 23:45 UTC should be 167, got ${hourSat}`);
  console.log("  PASS: getHourOfWeekUTC range [0, 167] verified.");

  // 2. Anomaly Z-Score & Normalization Tests
  console.log("\n[TEST 2] Testing Poisson Z-Score & Clipping Normalization...");
  const zNormal = computeZScore(1, 1);
  assert.strictEqual(zNormal, 0, `z for (1, 1) should be 0, got ${zNormal}`);
  const normZero = normalizeAnomalyZScore(zNormal);
  assert.strictEqual(normZero, 0, `spatial_norm for z=0 should be 0, got ${normZero}`);

  const zSurge = computeZScore(7, 1);
  const normSurge = normalizeAnomalyZScore(zSurge);
  assert(normSurge > 0.6 && normSurge < 0.8, `Expected normSurge ~0.707, got ${normSurge}`);

  const zExtreme = computeZScore(20, 1);
  const normExtreme = normalizeAnomalyZScore(zExtreme);
  assert.strictEqual(normExtreme, 1.0, `Extreme Z-score should clip to 1.0, got ${normExtreme}`);
  console.log("  PASS: Poisson Z-Score and Clipping Normalization verified.");

  // 3. H3 Cell Resolution 8 & Grid Disk
  console.log("\n[TEST 3] Testing H3 Res 8 & 7-Cell Neighborhood...");
  const lat = 40.7128;
  const lng = -74.0060;
  const centerCell = h3.latLngToCell(lat, lng, 8);
  const disk = h3.gridDisk(centerCell, 1);
  assert.strictEqual(disk.length, 7, `gridDisk(cell, 1) must return 7 cells, got ${disk.length}`);
  const parentWard = h3.cellToParent(centerCell, 6);
  assert(parentWard && parentWard.length > 0, "parentWard must be a valid H3 Res 6 string");
  console.log(`  PASS: Center Cell = ${centerCell}, Neighborhood Count = 7, Parent Ward Res 6 = ${parentWard}`);

  // 4. Database Integration Tests
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/smart-city-complaint-system";
  console.log(`\nConnecting to MongoDB (${mongoUri})...`);
  
  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB.");

    // Level 0 Default Fallback Test on Unseeded Cell (1.0 per 10 min across 7-cell neighborhood)
    console.log("\n[TEST 4] Testing Shrinkage Fallback Cascade (Unseeded Cell)...");
    const dummyCell = "882a100801fffff"; // non-existent cell
    const dummyDisk = h3.gridDisk(dummyCell, 1);
    const fallbackExpected = await getShrunkBaseline(dummyDisk, "fire", new Date());
    assert(fallbackExpected >= 0.99 && fallbackExpected <= 1.01, `Expected fallback ~1.0, got ${fallbackExpected}`);
    console.log(`  PASS: Empirical Bayes Shrinkage Fallback returned ${fallbackExpected} expected complaints/10-min.`);

    // 5. End-to-End calculatePriority Engine Test
    console.log("\n[TEST 5] Testing End-to-End calculatePriority Engine...");
    const priorityResult = await calculatePriority(0.85, lat, lng, "fire");
    assert(priorityResult.priorityScore >= 0 && priorityResult.priorityScore <= 1, "Priority score must be in [0, 1]");
    assert(priorityResult.priorityScoreS2 >= 0 && priorityResult.priorityScoreS2 <= 1, "Stage 2 score must be in [0, 1]");
    console.log("  Engine Output:", priorityResult);
    console.log("  PASS: End-to-End calculatePriority Engine executed cleanly.");

    // 6. Statistical Surge Evaluation Test
    console.log("\n[TEST 6] Testing evaluateSurge Statistical Hypothesis Test...");
    const { evaluateSurge } = require("../utils/surgeEngine");
    const surgeReport = await evaluateSurge({ latitude: lat, longitude: lng, category: "fire" });
    assert(typeof surgeReport.isSurge === "boolean", "isSurge must be boolean");
    assert(typeof surgeReport.p === "number", "p-value must be number");
    assert(typeof surgeReport.users === "number", "users count must be number");
    console.log("  Surge Engine Output:", surgeReport);
    console.log("  PASS: evaluateSurge Statistical Test executed cleanly with 7-cell baseline parity.");

    console.log("\n==========================================");
    console.log("ALL H3 SPATIAL-TEMPORAL ENGINE TESTS PASSED!");
    console.log("==========================================");
  } catch (err) {
    console.error("Test error:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

runTests();
