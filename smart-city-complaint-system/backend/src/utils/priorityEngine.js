const Complaint = require("../models/Complaint");

const categoryWeights = {
  Emergency: 50,
  Traffic: 30,
  Water: 25,
  Electricity: 25,
  Sanitation: 20,
  Unclassified: 10
};

const calculatePriority = async (
  description,
  latitude,
  longitude,
  category
) => {
  let score = 0;

  // 1️⃣ ML Category Weight
  score += categoryWeights[category] || 10;

  // 2️⃣ Severity Keywords
  const severeKeywords = ["fire", "accident", "injury", "collapse", "flood"];
  const lowerDesc = description.toLowerCase();

  severeKeywords.forEach(word => {
    if (lowerDesc.includes(word)) score += 20;
  });

  // 3️⃣ Repetition in same geo radius
  const nearbyComplaints = await Complaint.countDocuments({
    latitude: { $gte: latitude - 0.01, $lte: latitude + 0.01 },
    longitude: { $gte: longitude - 0.01, $lte: longitude + 0.01 }
  });

  score += nearbyComplaints * 5;

  return score;
};

module.exports = calculatePriority;