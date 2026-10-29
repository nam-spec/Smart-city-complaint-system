# Paper outline

**Working title:** *Credibility-Aware Multi-Scale Surge Detection for Smart-City Grievance Systems*

**Target:** Scopus-indexed IEEE or Springer conference first (8–10 pages). Then, after adding the
labelled text and image datasets, a journal (e.g. IEEE Access or MDPI *Smart Cities*).

All numbers below come from `results/RESULTS.md`, at an equal alarm budget of 25 alarm episodes
per day city-wide, with Wilson 95% confidence intervals.

---

## Abstract (draft)

City grievance platforms receive thousands of complaints a day. A sudden local burst of
complaints is often the first sign of an infrastructure failure: a burst main, a fallen tree, a
power-feeder fault. We present a real-time surge detector for such platforms with four parts:

- H3 hexagonal neighbourhoods.
- Gamma–Poisson empirical-Bayes baselines pooled across cell, ward and city, with hour-of-week
  seasonality.
- A multi-scale Poisson test over 10-, 30- and 60-minute windows.
- A credibility gate that keeps fake, mismatched and re-used-image complaints out of surge counts.

**Data.** 745,507 NYC 311 complaints.

**Evaluation protocol.** We plant surges into real data and set every method's threshold so that
it raises the same number of alarms per day.

**Results.**
- The detector finds 99.2% of 30-minute surges of 15 extra complaints and 75.4% of 2-hour surges
  of the same size.
- The best baseline, a prospective space-time scan statistic, finds 95.1% and 61.7% (paired
  McNemar p < 10⁻⁴⁸).
- The corrected baseline raises recall over the deployed heuristic from 1.5% to 41.7% on slow
  surges. The multi-scale test lifts it further, to 75.4%.

**Robustness.** Without the credibility gate, 5 fake complaints always trigger a surge alert.
With a gate that catches 80% of fakes, fewer than 1% of such attacks succeed.

**Real-data check.** Surges detected in real data are significantly more homogeneous in incident
type than matched controls (Wilcoxon p = 2×10⁻⁵¹).

## 1. Introduction

- **Problem.** First-come-first-served queues hide emergent incidents. A spike of complaints means
  many citizens are affected and there is likely one common root cause.
- **Gap.** Prior work ranks complaints one at a time (NLP and severity) or clusters them offline
  (ST-DBSCAN). Few works do *online* surge detection with a calibrated false-alarm rate. None, to
  our knowledge, make it robust to fabricated complaints.
- **Contributions:**
  1. A multi-scale EB-Poisson surge test on H3 neighbourhoods, with a full alarm lifecycle:
     possible, confirmed, escalating, resolved.
  2. Alarm-budget calibration and an injection-based evaluation protocol for complaint data.
  3. A credibility gate (text–image consistency, image forensics, perceptual-hash re-use) and the
     first quantification of fake-flood attacks on surge detection.
  4. An open-source deployed system: React, Node and Flask, with live admin alerts.

## 2. Related work

- Syndromic and disease surveillance: CUSUM, EWMA, Kulldorff's space-time scan statistic and
  SaTScan, the Farrington method.
- 311 and civic-complaint analytics: classification, prioritisation, hotspot detection, ST-DBSCAN.
- Hierarchical spatial indexing (H3) and small-area estimation by empirical-Bayes shrinkage.
- Misinformation and fake evidence in crowdsourced reporting; image forensics (EXIF, ELA, C2PA);
  CLIP-based image–text consistency.

## 3. System overview

Figure: architecture. Citizen app → ML service (multilingual root-cause classification, CLIP
image classification, forensics) → priority engine → surge engine → alert service (live push
over SSE, webhook) → admin dashboard.

## 4. Method

### 4.1 Neighbourhood and time
- H3 resolution-8 cell plus its 1-ring (7 cells, about 5 km²).
- Sliding windows of w ∈ {10, 30, 60} minutes.

### 4.2 Baseline
Hourly rate λ for cell c and hour-of-week h:

    λ_c,h = (C_c,h + k · λ_ward(c),h) / (T_h + k)

    λ_ward,h = (ΣC + k_w · λ_city,h) / (n_cells · T_h + k_w)

- C is a count and T is exposure in weeks.
- Zero-count cells are included.
- Explain why the deployed heuristic is biased: it averages only over non-zero records and
  weights shrinkage by counts instead of exposure.

### 4.3 Test
- S = max_w [ −log₁₀ P(X ≥ N_w | E_w) ] − log₁₀ 3.
- Alarm when S ≥ θ.
- Alarms are merged into episodes (2-ring neighbourhood, gap ≤ 60 min).

### 4.4 Calibration
- θ is chosen on a held-out period to match an alarm budget B, in episodes per day. This is an
  operational workload constraint.
- Report: fixed thresholds (p < 0.01, ≥ 5 complaints) produce 80 alarms/day at NYC scale
  (Table 4).

### 4.5 Credibility gate
- Signals: CLIP category agreement and similarity; non-civic detection; EXIF, GPS and timestamp
  checks; ELA; AI-generator metadata (C2PA); pHash re-use.
- The signals are combined by noisy-OR.
- Gated complaints don't count toward surges and have their priority down-weighted.

### 4.6 Lifecycle and alerts
- Possible, confirmed, escalating and resolved states, plus a city-wide check.
- De-duplication of repeated alerts.

## 5. Experimental setup

- Data, split and categories (`README.md`).
- Injection protocol: fast and slow surges, m ∈ {5, 10, 15, 25}, 3 seeds, 264 surges per
  setting.
- Metrics: recall, detection delay, alarms per day on the test period, and paired exact McNemar
  tests.

## 6. Results

- **Table 1 + Fig. 1 + Fig. 2: main comparison.** Multi-scale is best or tied in most settings.
  Report honestly where it isn't:
  - EWMA is better for the smallest fast surges (m = 5: 57% vs 42%).
  - CUSUM is better for large slow surges (98% vs 97%).
- **Table 3: paired McNemar tests.** All p < 10⁻²⁹.
- **Table 2: ablations.**
  - The neighbourhood matters: 1 cell gives 29%, 7 cells 65%, 19 cells 52% (fast, m = 10).
  - Seasonality matters for slow surges: 42% with it, 14% without.
  - The prior strength k barely matters, so the results are robust to it.
  - The window length matters most, which motivates the multi-scale test.
- **Table 4: fixed thresholds don't scale.**
- **Table 5 + Fig. 3: adversarial floods.**
  - 5 fakes: 100% success without the gate; 0.5% with 80% gate recall.
  - 25 fakes need about 95% gate recall to fall below 3%.
- **Table 6: cost of wrongly removing genuine complaints.**
  - Recall drops from 89.8% to 87.5% when the gate wrongly removes 5% of genuine complaints, and
    to 78.4% at 20%.

## 7. Real-data analysis

- 547 surge episodes in the 21-day test period.
- **Incident homogeneity:** Simpson index 0.333 vs 0.230 in matched random groups; Wilcoxon
  p = 2×10⁻⁵¹.
- **Resolution time:** median 88 h vs 265 h. Interpretation: surge complaints are often duplicate
  reports of one incident and are closed together. Present this as consistent with "same
  incident", not as "surges are more urgent".
- **Case studies (Table 7):**
  - A fallen-tree cluster on 17 Mar 2022: 51 complaints in 110 min, 73% "Tree Leaning/Uprooted".
  - A pothole cluster.
  - Single-source noise floods: 235 and 508 complaints at one location from what is probably a
    single caller. These motivate the distinct-citizen rule.
- **Data artefact:** night-time housing bursts with mixed descriptors are likely administrative
  batch entries. Discuss them as a limitation of using 311 data as ground truth.

## 8. Discussion and limitations

- No user IDs in 311, so the distinct-citizen rule wasn't evaluated.
- The injected-surge shapes are a simplification.
- The gate recall is assumed, not yet measured.
- 3 months of one city's data; generalisation to Indian cities is untested.
- The multilingual (Hinglish, Marathi) component is described but not yet benchmarked on a
  labelled corpus. That is future work, or the subject of a second paper.

## 9. Conclusion

---

## Still needed before submission

1. Labelled image set (about 500 genuine + 500 fake/mismatched) → measure the real gate recall
   and false-positive rate, then read the matching rows of Tables 5 and 6.
2. Optional: a 6-month or 12-month window and a second city, to show generalisation.
3. An architecture figure and a screenshot of the alert panel.
4. Ship the multi-scale test in the backend (`surgeEngine.js`), so the paper and the deployed
   system match.
