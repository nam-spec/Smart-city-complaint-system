/**
 * Poisson and Statistical Math Utilities for Spatial-Temporal Anomaly Engine
 */

/**
 * Returns UTC Hour of Week from a Date object (0 to 167)
 * 0 = Sunday 00:00 UTC, 167 = Saturday 23:00 UTC
 */
function getHourOfWeekUTC(date = new Date()) {
  const d = new Date(date);
  return d.getUTCDay() * 24 + d.getUTCHours();
}

/**
 * Computes Z-Score deviation between observed counts and expected baseline
 * Formula: z = (observed - expected) / sqrt(expected + 1)
 */
function computeZScore(observed, expected) {
  const exp = Math.max(expected, 0.05);
  return (observed - exp) / Math.sqrt(exp + 1);
}

/**
 * Normalizes Z-score to [0, 1] using clip(z, 0, 6) / 6
 */
function normalizeAnomalyZScore(z) {
  const clippedZ = Math.min(Math.max(z, 0), 6);
  return Math.round((clippedZ / 6) * 100) / 100;
}

/**
 * Calculates Poisson upper-tail probability P(X >= k | lambda)
 * P(X >= k) = 1 - sum_{i=0}^{k-1} (lambda^i * e^(-lambda) / i!)
 */
function poissonTail(k, lambda) {
  const l = Math.max(lambda, 0.05);
  if (k <= 0) return 1.0;

  let sum = 0.0;
  let term = Math.exp(-l); // i = 0 term
  sum += term;

  for (let i = 1; i < k; i++) {
    term = (term * l) / i;
    sum += term;
  }

  const pTail = 1.0 - sum;
  return Math.max(0.0, Math.min(1.0, pTail));
}

module.exports = {
  getHourOfWeekUTC,
  computeZScore,
  normalizeAnomalyZScore,
  poissonTail
};
