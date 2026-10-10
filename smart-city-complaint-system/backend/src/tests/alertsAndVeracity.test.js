/**
 * Offline tests (no MongoDB, no ML service needed) for:
 *   - surge early-warning / confirmed / escalation alerts (surgeEngine + alertService)
 *   - alert de-duplication and live SSE push
 *   - city-wide surge monitor
 *   - complaint creation with fake / duplicate evidence (complaintController)
 *
 * Database models and the ML HTTP call are replaced by in-memory stubs.
 * Run from the backend folder:   node src/tests/alertsAndVeracity.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.SURGE_ALERTS = "on";
const assert = require("assert");
const h3 = require("h3-js");
const axios = require("axios");
const jwt = require("jsonwebtoken");

const Complaint = require("../models/Complaint");
const Surge = require("../models/Surge");
const Alert = require("../models/Alert");
const CellBaseline = require("../models/CellBaseline");
const User = require("../models/User");

// ---------------------------------------------------------------- in-memory stubs
const db = { complaints: [], surges: [], alerts: [], baselines: [] };
let idSeq = 1;
const newId = () => {
  const s = (idSeq++).toString(16).padStart(24, "0");
  return s;
};

function chain(resultFn) {
  const q = {
    select: () => q, sort: () => q, limit: () => q, lean: () => q, populate: () => q,
    then: (res, rej) => Promise.resolve().then(resultFn).then(res, rej)
  };
  return q;
}
function match(doc, filter) {
  return Object.entries(filter).every(([k, cond]) => {
    const v = doc[k];
    if (cond && typeof cond === "object" && !(cond instanceof Date) && !Array.isArray(cond)) {
      if ("$in" in cond && !cond.$in.map(String).includes(String(v))) return false;
      if ("$nin" in cond && cond.$nin.includes(v)) return false;
      if ("$ne" in cond && v === cond.$ne) return false;
      if ("$gte" in cond && !(v >= cond.$gte)) return false;
      if ("$lt" in cond && !(v < cond.$lt)) return false;
      return true;
    }
    return String(v) === String(cond);
  });
}
function withSave(obj, arr) {
  obj.save = async () => obj;
  obj.toObject = () => ({ ...obj });
  arr.push(obj);
  return obj;
}

Complaint.find = (f = {}) => chain(() => db.complaints.filter(c => match(c, f)));
Complaint.findOne = (f = {}) => chain(() => db.complaints.find(c => match(c, f)) || null);
Complaint.countDocuments = async (f = {}) => db.complaints.filter(c => match(c, f)).length;
Complaint.create = async (d) => withSave({ _id: newId(), createdAt: new Date(), ...d }, db.complaints);
Complaint.aggregate = async () => {
  const since = Date.now() - 60 * 60 * 1000;
  const g = {};
  for (const c of db.complaints.filter(c => c.createdAt >= since && !c.isFake)) {
    g[c.category] = g[c.category] || { _id: c.category, observed: 0, users: new Set(), cells: new Set(), lat: 0, lng: 0 };
    g[c.category].observed++;
    g[c.category].users.add(String(c.citizen));
    g[c.category].cells.add(c.cellId);
    g[c.category].lat = c.latitude;
    g[c.category].lng = c.longitude;
  }
  return Object.values(g).filter(x => x.observed >= 10).map(x => ({ ...x, users: [...x.users], cells: [...x.cells] }));
};
Surge.find = (f = {}) => chain(() => db.surges.filter(s => match(s, f)));
Surge.create = async (d) => withSave({ _id: newId(), ...d }, db.surges);
Alert.findOne = (f = {}) => chain(() => db.alerts.find(a => match(a, f)) || null);
Alert.create = async (d) => withSave({ _id: newId(), createdAt: new Date(), acknowledged: false, ...d }, db.alerts);
CellBaseline.find = (f = {}) => chain(() => db.baselines.filter(b => match(b, f)));
CellBaseline.findOne = (f = {}) => chain(() => db.baselines.find(b => match(b, f)) || null);
User.findById = () => chain(() => ({ _id: "admin1", role: "admin" }));

const { evaluateAndUpdateSurgeLifecycle } = require("../utils/surgeEngine");
const { addClient } = require("../utils/alertService");
const { runCitywideSurgeCheck } = require("../jobs/surgeMonitorJob");
const { createComplaint } = require("../controllers/complaintController");
const { streamAlerts } = require("../controllers/alertController");

const LAT = 19.076, LNG = 72.8777;
const CELL = h3.latLngToCell(LAT, LNG, 8);
function seed(n, users, category = "water", minutesAgo = 3, extra = {}) {
  for (let i = 0; i < n; i++) {
    db.complaints.push({
      _id: newId(), citizen: `u${i % users}`, category, cellId: CELL, latitude: LAT, longitude: LNG,
      createdAt: new Date(Date.now() - minutesAgo * 60000), isFake: false, ...extra
    });
  }
}
function reset() {
  db.complaints = []; db.surges = []; db.alerts = []; db.baselines = [];
}
function fakeRes() {
  const r = { chunks: [], headers: {}, statusCode: 200, listeners: {} };
  r.set = (h) => Object.assign(r.headers, h);
  r.flushHeaders = () => {};
  r.write = (c) => r.chunks.push(c);
  r.on = (ev, fn) => { r.listeners[ev] = fn; };
  r.status = (s) => { r.statusCode = s; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`[PASS] ${name}`);
  } catch (e) {
    console.log(`[FAIL] ${name}\n       ${e.stack.split("\n").slice(0, 3).join("\n       ")}`);
    process.exitCode = 1;
  }
}

(async () => {
  // live SSE client connected before anything happens
  const sse = fakeRes();
  await test("SSE stream accepts an admin JWT", async () => {
    const token = jwt.sign({ id: "admin1" }, process.env.JWT_SECRET);
    await streamAlerts({ query: { token } }, sse);
    assert.strictEqual(sse.headers["Content-Type"], "text/event-stream");
    assert.ok(sse.chunks[0].includes("hello"));
  });
  await test("SSE stream rejects a missing / bad token", async () => {
    const r1 = fakeRes(); await streamAlerts({ query: {} }, r1); assert.strictEqual(r1.statusCode, 401);
    const r2 = fakeRes(); await streamAlerts({ query: { token: "garbage" } }, r2); assert.strictEqual(r2.statusCode, 401);
  });

  await test("2 earlier complaints + current from 2 citizens -> POSSIBLE_SURGE early warning", async () => {
    reset();
    seed(2, 2);
    const r = await evaluateAndUpdateSurgeLifecycle({ latitude: LAT, longitude: LNG, category: "water", citizen: "u9" });
    assert.strictEqual(r.surgeFlag, false);
    assert.strictEqual(r.isPossibleSurge, true);
    assert.strictEqual(db.alerts.length, 1);
    assert.strictEqual(db.alerts[0].type, "POSSIBLE_SURGE");
    assert.ok(sse.chunks.some(c => c.includes("POSSIBLE_SURGE")), "alert pushed to SSE client");
  });

  await test("repeat early warning in same area is de-duplicated (cooldown)", async () => {
    seed(1, 1);
    await evaluateAndUpdateSurgeLifecycle({ latitude: LAT, longitude: LNG, category: "water", citizen: "u8" });
    assert.strictEqual(db.alerts.filter(a => a.type === "POSSIBLE_SURGE").length, 1);
  });

  await test("5 complaints from 3 citizens in 10 min -> Surge created + SURGE_CONFIRMED alert", async () => {
    reset();
    seed(4, 3);
    const r = await evaluateAndUpdateSurgeLifecycle({ latitude: LAT, longitude: LNG, category: "water", citizen: "u2" });
    assert.strictEqual(r.surgeFlag, true);
    assert.strictEqual(db.surges.length, 1);
    const a = db.alerts.find(x => x.type === "SURGE_CONFIRMED");
    assert.ok(a, "confirmed alert raised");
    assert.ok(["warning", "critical"].includes(a.level));
    assert.strictEqual(String(a.surgeId), String(db.surges[0]._id));
  });

  await test("surge keeps growing -> SURGE_ESCALATED (critical)", async () => {
    seed(8, 5);
    await evaluateAndUpdateSurgeLifecycle({ latitude: LAT, longitude: LNG, category: "water", citizen: "u7" });
    const a = db.alerts.find(x => x.type === "SURGE_ESCALATED");
    assert.ok(a, "escalation alert raised");
    assert.strictEqual(a.level, "critical");
  });

  await test("fake complaints are not counted towards a surge", async () => {
    reset();
    seed(10, 5, "water", 3, { isFake: true });
    const r = await evaluateAndUpdateSurgeLifecycle({ latitude: LAT, longitude: LNG, category: "water", citizen: "u1" });
    assert.strictEqual(r.surgeFlag, false);
    assert.strictEqual(r.observedCount, 1);
    assert.strictEqual(db.alerts.length, 0);
  });

  await test("city-wide monitor raises CITYWIDE_SURGE for a city-wide spike", async () => {
    reset();
    seed(25, 12, "electric", 20);
    const raised = await runCitywideSurgeCheck();
    assert.strictEqual(raised.length, 1);
    assert.strictEqual(raised[0].type, "CITYWIDE_SURGE");
    const again = await runCitywideSurgeCheck();
    assert.strictEqual(again.length, 0, "de-duplicated within cooldown");
  });

  await test("city-wide monitor stays quiet at normal volume", async () => {
    reset();
    // last week: ~5 per hour normally
    for (let h = 2; h < 168; h++) seed(5, 5, "road", h * 60);
    seed(6, 6, "road", 10);
    const raised = await runCitywideSurgeCheck();
    assert.strictEqual(raised.length, 0);
  });

  // ---------------------------------------------------------- complaint creation
  const realPost = axios.post;
  function mlReturns(veracity, extra = {}) {
    axios.post = async () => ({
      data: {
        category: "road", root_cause_category: "road", symptom_category: "traffic", language: "hinglish",
        english_gloss: "pothole road damage", confidence: 0.81, severity_score: 0.7, needs_manual_review: false,
        veracity, ...extra
      }
    });
  }
  const req = (citizen = "c1") => ({
    body: { description: "gaddhon ki wajah se traffic jam", latitude: String(LAT), longitude: String(LNG) },
    file: { path: "uploads/x.jpg" },
    user: { _id: citizen }
  });

  await test("verified photo -> stored with root cause, symptom, language, full priority", async () => {
    reset();
    mlReturns({ is_fake: false, veracity_status: "VERIFIED", veracity_score: 0.9, image_category: "road",
      image_confidence: 0.8, text_image_match: 0.9, fake_risk_score: 0.0, fake_signals: [], phash: "7cf82df85286d284" });
    const res = fakeRes();
    await createComplaint(req(), res);
    assert.strictEqual(res.statusCode, 201, JSON.stringify(res.body));
    const c = res.body.complaint;
    assert.strictEqual(c.rootCauseCategory, "road");
    assert.strictEqual(c.symptomCategory, "traffic");
    assert.strictEqual(c.language, "hinglish");
    assert.strictEqual(c.priorityFactor, 1.0);
    assert.strictEqual(c.isFake, false);
    assert.strictEqual(c.imageHash, "7cf82df85286d284");
  });

  await test("same photo submitted again by another citizen -> DUPLICATE, flagged, lower priority, no surge", async () => {
    mlReturns({ is_fake: false, veracity_status: "VERIFIED", veracity_score: 0.9, image_category: "road",
      text_image_match: 0.9, fake_risk_score: 0.0, fake_signals: [], phash: "7cf82df85286d285" }); // 1 bit different
    const res = fakeRes();
    await createComplaint(req("c2"), res);
    const c = res.body.complaint;
    assert.strictEqual(c.veracityStatus, "DUPLICATE");
    assert.strictEqual(c.isFake, true);
    assert.strictEqual(c.priorityFactor, 0.6);
    assert.strictEqual(c.needsManualReview, true);
    assert.ok(c.fakeSignals[0].code === "DUPLICATE_IMAGE");
    assert.strictEqual(c.surgeFlag, false);
  });

  await test("AI-generated photo -> LIKELY_FAKE with reasons, priority x0.4", async () => {
    mlReturns({ is_fake: true, veracity_status: "LIKELY_FAKE", veracity_score: 0.05, image_category: "road",
      text_image_match: 0.9, fake_risk_score: 0.91, phash: "0123456789abcdef",
      fake_signals: [{ code: "AI_METADATA", weight: 0.9, message: "Image metadata contains AI-generator fingerprints (c2pa, openai)." }],
      explanation: "Flagged: forensic checks ..." });
    const res = fakeRes();
    await createComplaint(req("c3"), res);
    const c = res.body.complaint;
    assert.strictEqual(c.veracityStatus, "LIKELY_FAKE");
    assert.strictEqual(c.priorityFactor, 0.4);
    assert.ok(Math.abs(c.finalPriority - c.priorityScoreS2 * 0.4) < 1e-9);
    assert.strictEqual(res.body.analysis.fakeSignals[0].code, "AI_METADATA");
  });

  await test("ML service down -> complaint still saved as UNVERIFIED (used to crash with 500)", async () => {
    axios.post = async () => { throw new Error("connect ECONNREFUSED"); };
    const res = fakeRes();
    await createComplaint(req("c4"), res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.complaint.veracityStatus, "UNVERIFIED");
    // the real mongoose schema must accept the value too
    const err = new Complaint({ citizen: "64b000000000000000000001", description: "x", latitude: 1, longitude: 1,
      veracityStatus: "UNVERIFIED" }).validateSync();
    assert.ok(!err || !err.errors.veracityStatus, "schema accepts UNVERIFIED");
  });
  axios.post = realPost;

  console.log(`\n${passed} tests passed${process.exitCode ? " (some FAILED)" : ""}`);
  process.exit(process.exitCode || 0);
})();
