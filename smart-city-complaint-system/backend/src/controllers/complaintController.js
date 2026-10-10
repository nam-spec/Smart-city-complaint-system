const Complaint = require("../models/Complaint");
const calculatePriority = require("../utils/priorityEngine").calculatePriority;
const { evaluateAndUpdateSurgeLifecycle } = require("../utils/surgeEngine");
const h3 = require("h3-js");
const axios = require("axios");
const path = require("path");

// Hamming distance between two 64-bit hex perceptual hashes
function hammingHex(a, b) {
  let x = BigInt("0x" + a) ^ BigInt("0x" + b);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

const DUPLICATE_MAX_DISTANCE = 6;     // pHash bits; <= 6 means "same photo" (resized / recompressed)
const DUPLICATE_LOOKBACK_DAYS = 180;
const PRIORITY_FACTOR = {
  VERIFIED: 1.0, UNVERIFIED: 0.95, SUSPICIOUS: 0.85, DUPLICATE: 0.6, FAKE_MISMATCH: 0.5, LIKELY_FAKE: 0.4
};

async function findDuplicateImage(phash) {
  if (!phash || !/^[0-9a-f]{16}$/i.test(phash)) return null;
  const since = new Date(Date.now() - DUPLICATE_LOOKBACK_DAYS * 24 * 3600 * 1000);
  const exact = await Complaint.findOne({ imageHash: phash, createdAt: { $gte: since } }).select("_id citizen createdAt");
  if (exact) return { complaint: exact, distance: 0 };
  const candidates = await Complaint.find({ imageHash: { $ne: null }, createdAt: { $gte: since } })
    .select("_id citizen imageHash createdAt")
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();
  for (const c of candidates) {
    const d = hammingHex(phash, c.imageHash);
    if (d <= DUPLICATE_MAX_DISTANCE) return { complaint: c, distance: d };
  }
  return null;
}

exports.createComplaint = async (req, res) => {
  try {
    const { description, latitude, longitude } = req.body;

    // Mandatory checks
    if (!description || !latitude || !longitude) {
      return res.status(400).json({
        message: "Description and geo-location are mandatory"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Image upload is mandatory"
      });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    let category = "unclassified";
    let severityScore = 0.50; // fallback
    let ml = {};
    let veracityData = {
      is_fake: false,
      veracity_score: 0.0,
      veracity_status: "UNVERIFIED",
      clip_visual_category: "unprocessed",
      explanation: "ML service unavailable for cross-modal verification"
    };

    try {
      const baseUrl = process.env.ML_SERVICE_URL || "http://localhost:5001/predict";
      const targetUrl = baseUrl.endsWith("/predict") ? baseUrl : `${baseUrl}/predict`;

      const fullImagePath = req.file ? path.resolve(req.file.path) : null;

      console.log(`Sending ML prediction & CLIP veracity request to: ${targetUrl}`);
      const mlResponse = await axios.post(targetUrl, {
        text: description,
        image_path: fullImagePath,
        latitude: lat,
        longitude: lng
      }, { timeout: parseInt(process.env.ML_TIMEOUT_MS || "60000", 10) });

      ml = mlResponse.data || {};
      category = ml.category || "unclassified";
      severityScore = parseFloat(ml.severity_score) || 0.50;
      if (ml.veracity) {
        veracityData = ml.veracity;
      }
    } catch (error) {
      console.error("ML service error:", error.message);
      console.log("ML service unavailable, using default category and severity");
    }

    // Re-used image? (same photo already submitted with another complaint)
    let duplicate = null;
    try {
      duplicate = await findDuplicateImage(veracityData.phash);
    } catch (e) {
      console.error("Duplicate image check failed:", e.message);
    }
    const fakeSignals = Array.isArray(veracityData.fake_signals) ? [...veracityData.fake_signals] : [];
    let veracityStatus = veracityData.veracity_status || "UNVERIFIED";
    let isFake = Boolean(veracityData.is_fake);
    let veracityExplanation = veracityData.explanation || "";
    if (duplicate) {
      const sameCitizen = String(duplicate.complaint.citizen) === String(req.user._id);
      fakeSignals.unshift({
        code: "DUPLICATE_IMAGE",
        weight: 0.7,
        message: `The same photo was already used in complaint ${duplicate.complaint._id}` +
          `${sameCitizen ? " by the same citizen" : " by a different citizen"} (hash distance ${duplicate.distance}).`
      });
      if (!["LIKELY_FAKE", "FAKE_MISMATCH"].includes(veracityStatus)) veracityStatus = "DUPLICATE";
      isFake = true;
      veracityExplanation = `Re-used image: identical photo already submitted with complaint ${duplicate.complaint._id}. ` + veracityExplanation;
    }
    const priorityFactor = PRIORITY_FACTOR[veracityStatus] ?? 1.0;
    const needsManualReview = Boolean(ml.needs_manual_review) || isFake || veracityStatus === "SUSPICIOUS";

    const cellId = h3.latLngToCell(lat, lng, 8);

    const {
      priorityScore,
      priorityScoreS2,
      spatialDensity,
      temporalDensity,
      acceleration
    } = await calculatePriority(
      severityScore,
      lat,
      lng,
      category
    );

    // Evaluate surge & neighborhood lifecycle binding.
    // Fake / duplicate complaints are excluded so they cannot manufacture (or inflate) a surge.
    let surgeInfo = {
      surgeFlag: false, surgeId: null, observedCount: 0, expectedCount: 0, pValue: 1.0, surgeStrength: 0
    };
    if (!isFake) {
      surgeInfo = await evaluateAndUpdateSurgeLifecycle({
        latitude: lat, longitude: lng, category, citizen: req.user._id
      });
    }
    const surgeBoost = surgeInfo.surgeFlag ? 0.20 * surgeInfo.surgeStrength : 0;
    // Credibility factor: fake / mismatched / duplicate evidence lowers the queue position
    const finalPriority = (priorityScoreS2 + surgeBoost) * priorityFactor;

    const complaint = await Complaint.create({
      citizen: req.user._id,
      description,
      category,
      cellId,
      latitude: lat,
      longitude: lng,
      imagePath: req.file.path,
      severityScore,
      spatialDensity,
      temporalDensity,
      acceleration,
      priorityScore,
      priorityScoreS2,
      surgeFlag: surgeInfo.surgeFlag,
      surgeId: surgeInfo.surgeId,
      observedCount: surgeInfo.observedCount,
      expectedCount: surgeInfo.expectedCount,
      pValue: surgeInfo.pValue,
      surgeStrength: surgeInfo.surgeStrength,
      finalPriority,
      isFake,
      veracityScore: veracityData.veracity_score !== undefined ? veracityData.veracity_score : 1.0,
      veracityStatus,
      veracityExplanation,
      clipVisualCategory: veracityData.clip_visual_category || category,
      language: ml.language || "",
      rootCauseCategory: ml.root_cause_category || category,
      symptomCategory: ml.symptom_category || null,
      causeText: ml.cause_text || null,
      englishGloss: ml.english_gloss || "",
      textConfidence: ml.confidence || 0,
      imageCategory: veracityData.image_category || null,
      imageConfidence: veracityData.image_confidence ?? null,
      textImageMatch: veracityData.text_image_match ?? null,
      fakeRiskScore: duplicate ? Math.max(veracityData.fake_risk_score || 0, 0.7) : (veracityData.fake_risk_score || 0),
      fakeSignals,
      imageHash: veracityData.phash || null,
      duplicateOf: duplicate ? duplicate.complaint._id : null,
      needsManualReview,
      priorityFactor
    });

    res.status(201).json({
      message: "Complaint submitted successfully",
      complaint,
      analysis: {
        language: ml.language || null,
        rootCause: ml.root_cause_category || category,
        symptom: ml.symptom_category || null,
        imageCategory: veracityData.image_category || null,
        textImageMatch: veracityData.text_image_match ?? null,
        veracityStatus,
        fakeRiskScore: complaint.fakeRiskScore,
        fakeSignals,
        needsManualReview
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to submit complaint" });
  }
};

exports.getAllComplaints = async (req, res) => {
  try {
    const rawComplaints = await Complaint.find()
      .populate("citizen", "name email")
      .populate("surgeId", "status peakZ minP peakAt");

    // Dynamic fresh queue resolution: apply surge boost only if linked surge is currently ACTIVE
    const formattedComplaints = rawComplaints.map(c => {
      const doc = c.toObject();
      const isSurgeActive = doc.surgeId && doc.surgeId.status === "active";
      const currentBoost = isSurgeActive ? 0.20 * (doc.surgeStrength || 1.0) : 0;
      const factor = doc.priorityFactor !== undefined && doc.priorityFactor !== null ? doc.priorityFactor : 1.0;
      doc.freshFinalPriority = (doc.priorityScoreS2 + currentBoost) * factor;
      return doc;
    });

    // Sort by freshFinalPriority descending, then createdAt descending
    formattedComplaints.sort((a, b) => {
      if (b.freshFinalPriority !== a.freshFinalPriority) {
        return b.freshFinalPriority - a.freshFinalPriority;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.status(200).json(formattedComplaints);
  } catch (error) {
    console.error("Error fetching complaints:", error);
    res.status(500).json({ message: "Failed to fetch complaints" });
  }
};

exports.updateComplaintStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ message: "Complaint not found" });
    }

    complaint.status = status;

    if (status === "Resolved") {
      complaint.resolvedAt = new Date();
    }

    await complaint.save();

    res.status(200).json({ message: "Status updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update status" });
  }
};