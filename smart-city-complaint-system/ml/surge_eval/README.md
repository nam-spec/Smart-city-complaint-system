# Surge-detection evaluation (for the research paper)

This folder replaces the earlier evaluation in `ml/model/step5_priority_score.py` and
`step6_evaluation.py`. In those scripts the ground truth was built from the same features the
model scores. Stage 2 used "high severity AND high spatial density" as the label, and the
priority score is 0.76 × severity + 0.18 × spatial. So the 0.955 NDCG mostly measured the model
agreeing with itself. **Don't report those numbers in the paper.**

This evaluation avoids that problem in three ways:

1. **Known surges.** Surges with a known start time, place, size and duration are injected into
   *real* NYC 311 data, so the ground truth is exact and independent of every detector.
2. **Equal alarm budget.** Every detector's threshold is set on a separate calibration period so
   that each one raises the same number of alarm episodes per day. Recall and delay are then
   compared on a later test period. A detector can't look better just by raising more alarms.
3. **Real-data checks.** For surges detected in real data, the checks use only signals the
   detector never sees: the 311 complaint descriptor, and the resolution time.

## Data and split

- NYC 311, 1 Jan – 31 Mar 2022: 745,507 complaints, 1,139 H3 res-8 cells (about 0.74 km² each).
- 11 categories, mapped from the 311 complaint types (`CATEGORY_MAP` in `surge_core.py`).
- Train (baselines): 1 Jan – 28 Feb. Calibration (thresholds): 1–10 Mar. Test: 11–31 Mar.
- Time is cut into 5-minute bins. The neighbourhood is the H3 cell plus its ring of neighbours
  (7 cells, as in the backend).

## Detectors compared

| Key | Detector |
|---|---|
| `proposed_mw` | **Proposed (multi-scale).** Poisson upper-tail test against a Gamma–Poisson empirical-Bayes baseline (cell → ward (H3 res 6) → city, hour-of-week seasonality). Takes the minimum p-value over 10/30/60-minute windows, Bonferroni-corrected. |
| `proposed` | Same test with a single 10-minute window. This is the test the backend runs, but with the corrected baseline. |
| `deployed` | The backend's current `getShrunkBaseline()` heuristic, reproduced exactly. |
| `poisson_raw` / `poisson_city` | Poisson test with a raw per-cell mean (no shrinkage) / a city-wide uniform rate. |
| `count` | Fixed count threshold (7 cells, 10 minutes). |
| `ewma`, `cusum` | EWMA of standardised residuals; Poisson CUSUM tuned to detect a doubling of the rate. |
| `scan` | Prospective space-time scan statistic (Kulldorff Poisson LLR); radius 0–2 rings, duration 5–60 min. |
| `abl_*` | Ablations: radius, window length, no seasonality, prior strength. |

## How to run

```bash
cd ml/surge_eval
pip install pandas numpy scipy matplotlib tabulate
python run_experiments.py     # about 90 min on 2 CPU cores; QUICK=1 for a 10-minute pilot
python analyze.py             # tables -> results/RESULTS.md, figures -> figures/
```

`cache/` holds the H3 cell of every complaint and the neighbour table. They were produced with
`h3-js`, the same library the backend uses.

## Caveats to state in the paper

- **Real data contains real bursts.** Many are not "false" alarms; they are genuine duplicate
  reports of one incident. The alarm budget is therefore a workload budget, not a false-positive rate.
- **No user IDs.** NYC 311 has no user identifiers, so the "≥ 3 distinct citizens" rule could
  not be evaluated.
- **The multi-scale variant came after a pilot.** It was added after a 10-minute pilot run (seed
  11, 4 categories) showed that longer windows help. Its windows (10/30/60 min) are the standard
  operational choices; they were not tuned. Seed 11 is also among the final seeds.
- **Synthetic attack model.** Injected surges are spread evenly over 30 or 120 minutes inside the
  7-cell neighbourhood. Real surges have other shapes, which is why the real-data checks matter.
- **Assumed gate accuracy.** The adversarial experiment *assumes* a recall for the fake-image gate.
  Measure the real recall on a labelled image set and read the matching row from Table 5.
