const Complaint = require("../models/Complaint");

// Helper for Haversine distance in km
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const calculatePriority = async (
  severityScore,
  latitude,
  longitude
) => {
  const now = new Date();

  // 1️⃣ Spatial Density (within 500m / 0.5km)
  // To keep database query fast, use a bounding box filter first (+/- 0.005 degrees ~ 550m)
  const latMin = latitude - 0.005;
  const latMax = latitude + 0.005;
  const lonMin = longitude - 0.005;
  const lonMax = longitude + 0.005;

  const candidateComplaints = await Complaint.find({
    latitude: { $gte: latMin, $lte: latMax },
    longitude: { $gte: lonMin, $lte: lonMax }
  });

  let spatialDensity = 0;
  candidateComplaints.forEach(c => {
    const dist = haversineDistance(latitude, longitude, c.latitude, c.longitude);
    if (dist <= 0.5) {
      spatialDensity++;
    }
  });

  // 2️⃣ Temporal Density (number of complaints in the last 10 minutes sliding window)
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
  const temporalDensity = await Complaint.countDocuments({
    createdAt: { $gte: tenMinutesAgo }
  });

  // 3️⃣ Growth Rate & Acceleration
  // Define 10-minute intervals from start of current hour block
  const currentWindowStart = new Date(Math.floor(now.getTime() / (10 * 60 * 1000)) * (10 * 60 * 1000));
  const prevWindowStart = new Date(currentWindowStart.getTime() - 10 * 60 * 1000);
  const prevPrevWindowStart = new Date(prevWindowStart.getTime() - 10 * 60 * 1000);

  // λ_t (current window)
  const lambda_t = await Complaint.countDocuments({
    createdAt: { $gte: currentWindowStart }
  });

  // λ_prev (previous window)
  const lambda_prev1 = await Complaint.countDocuments({
    createdAt: { $gte: prevWindowStart, $lt: currentWindowStart }
  });

  // λ_prev2 (window before previous)
  const lambda_prev2 = await Complaint.countDocuments({
    createdAt: { $gte: prevPrevWindowStart, $lt: prevWindowStart }
  });

  // Log growth rates
  const growth_rate = Math.log((lambda_t + 1) / (lambda_prev1 + 1));
  const growth_prev = Math.log((lambda_prev1 + 1) / (lambda_prev2 + 1));

  // Acceleration
  const acceleration = growth_rate - growth_prev;

  // 4️⃣ Normalization to [0, 1]
  // severityScore is between 0.35 and 1.0
  const severity_norm = Math.min(Math.max((severityScore - 0.35) / (1.0 - 0.35), 0), 1);
  // Assume a max practical spatial density of 50 in 500m
  const spatial_norm = Math.min(spatialDensity / 50, 1);
  // Assume a max practical temporal density of 20 complaints in 10 minutes
  const temporal_norm = Math.min(temporalDensity / 20, 1);
  // Map acceleration range [-3.0, 3.0] to [0, 1]
  const acceleration_norm = Math.min(Math.max((acceleration + 3) / 6, 0), 1);

  // 5️⃣ Stage-1 optimized weights: α1=0.0, β1=0.29, γ1=0.40, δ1=0.31
  const priorityScore = (
    0.0 * severity_norm +
    0.29 * spatial_norm +
    0.40 * temporal_norm +
    0.31 * acceleration_norm
  );

  // 6️⃣ Stage-2 optimized weights: α2=0.76, β2=0.18, γ2=0.06
  const priorityScoreS2 = (
    0.76 * severity_norm +
    0.18 * spatial_norm +
    0.06 * temporal_norm
  );

  return {
    priorityScore: Math.round(priorityScore * 100) / 100, // 2 decimal precision
    priorityScoreS2: Math.round(priorityScoreS2 * 100) / 100,
    spatialDensity,
    temporalDensity,
    acceleration
  };
};

module.exports = calculatePriority;