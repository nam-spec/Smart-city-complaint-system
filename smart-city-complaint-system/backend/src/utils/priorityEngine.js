const Complaint = require("../models/Complaint");

const calculatePriority = async (description, latitude, longitude) => {
  let score = 0;

  // 1️⃣ Severity keywords
  const severeKeywords = ["fire", "accident", "injury", "collapse", "flood"];
  const mediumKeywords = ["water leak", "pothole", "electricity", "garbage"];

  const lowerDesc = description.toLowerCase();

  severeKeywords.forEach(word => {
    if (lowerDesc.includes(word)) score += 40;
  });

  mediumKeywords.forEach(word => {
    if (lowerDesc.includes(word)) score += 20;
  });

  // 2️⃣ Repetition in same area (simple radius match)
  const nearbyComplaints = await Complaint.countDocuments({
    latitude: { $gte: latitude - 0.01, $lte: latitude + 0.01 },
    longitude: { $gte: longitude - 0.01, $lte: longitude + 0.01 }
  });

  score += nearbyComplaints * 5;

  return score;
};

module.exports = calculatePriority;