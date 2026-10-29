# Surge-detection evaluation results

Data: NYC 311, 745,507 complaints, 1139 H3 res-8 cells, 11 categories. Split: train 2022-01-01..2022-02-28, calibration 2022-03-01..2022-03-10, test 2022-03-11..2022-03-31. Injected surges: 8 per category per run x 3 seeds; 'fast' = m extra complaints over 30 min, 'slow' = over 120 min. All detectors calibrated to the same alarm budget (25 alarm episodes/day city-wide) on the calibration period. Brackets: Wilson 95% CI.

## Table 1 - Detector comparison at equal alarm budget

| Method                                                               | Recall fast m=10 (%)   | Recall fast m=15 (%)   | Recall slow m=15 (%)   | Recall slow m=25 (%)   |   Median delay fast m=15 (min) |   Test alarms/day @25 cal. |
|:---------------------------------------------------------------------|:-----------------------|:-----------------------|:-----------------------|:-----------------------|-------------------------------:|---------------------------:|
| Proposed multi-scale: EB-Poisson, max over 10/30/60 min (Bonferroni) | 89.8 [86-93]           | 99.2 [97-100]          | 75.4 [70-80]           | 96.6 [94-98]           |                             15 |                       25.5 |
| Proposed: EB-Poisson, H3 ring-1, 10 min                              | 65.2 [59-71]           | 87.9 [83-91]           | 41.7 [36-48]           | 68.6 [63-74]           |                             10 |                       26   |
| Deployed heuristic shrinkage (v1 backend)                            | 11.7 [8-16]            | 56.1 [50-62]           | 1.5 [1-4]              | 8.0 [5-12]             |                             20 |                       23.2 |
| Poisson, raw cell baseline (no shrinkage)                            | 49.6 [44-56]           | 84.1 [79-88]           | 9.1 [6-13]             | 51.9 [46-58]           |                             10 |                       19.6 |
| Poisson, city-uniform baseline                                       | 50.0 [44-56]           | 83.3 [78-87]           | 16.7 [13-22]           | 47.7 [42-54]           |                             10 |                       26.1 |
| Fixed count threshold (ring-1, 10 min)                               | 1.1 [0-3]              | 35.2 [30-41]           | 0.0 [0-1]              | 1.5 [1-4]              |                             20 |                       17.1 |
| EWMA of standardised residuals                                       | 69.7 [64-75]           | 82.2 [77-86]           | 68.2 [62-74]           | 77.7 [72-82]           |                             10 |                       25.5 |
| Poisson CUSUM (rho=2)                                                | 20.5 [16-26]           | 31.8 [26-38]           | 33.3 [28-39]           | 98.1 [96-99]           |                              5 |                       23.1 |
| Prospective space-time scan (Kulldorff LLR)                          | 70.5 [65-76]           | 95.1 [92-97]           | 61.7 [56-67]           | 91.3 [87-94]           |                             15 |                       25.1 |

## Table 2 - Ablations of the proposed detector

| Method                                  | Recall fast m=10 (%)   | Recall fast m=15 (%)   | Recall slow m=15 (%)   | Recall slow m=25 (%)   |   Median delay fast m=15 (min) |   Test alarms/day @25 cal. |
|:----------------------------------------|:-----------------------|:-----------------------|:-----------------------|:-----------------------|-------------------------------:|---------------------------:|
| Proposed: EB-Poisson, H3 ring-1, 10 min | 65.2 [59-71]           | 87.9 [83-91]           | 41.7 [36-48]           | 68.6 [63-74]           |                             10 |                       26   |
| Ablation: single cell (radius 0)        | 29.2 [24-35]           | 62.5 [57-68]           | 5.7 [3-9]              | 28.4 [23-34]           |                             20 |                       26.4 |
| Ablation: radius 2 (19 cells)           | 51.5 [46-57]           | 76.5 [71-81]           | 17.4 [13-22]           | 53.4 [47-59]           |                             10 |                       27.1 |
| Ablation: 5-min window                  | 41.7 [36-48]           | 70.1 [64-75]           | 14.8 [11-20]           | 45.1 [39-51]           |                             10 |                       25.2 |
| Ablation: 30-min window                 | 93.6 [90-96]           | 99.2 [97-100]          | 67.4 [62-73]           | 93.9 [90-96]           |                             15 |                       23.7 |
| Ablation: 60-min window                 | 88.3 [84-92]           | 97.3 [95-99]           | 82.6 [78-87]           | 97.3 [95-99]           |                             15 |                       23.9 |
| Ablation: no hour-of-week seasonality   | 54.2 [48-60]           | 86.7 [82-90]           | 14.0 [10-19]           | 51.5 [46-57]           |                             10 |                       24.2 |
| Ablation: weak prior (k=1 week)         | 67.0 [61-72]           | 86.4 [82-90]           | 44.3 [38-50]           | 70.1 [64-75]           |                             10 |                       25.8 |
| Ablation: strong prior (k=16 weeks)     | 64.4 [58-70]           | 87.5 [83-91]           | 37.9 [32-44]           | 66.7 [61-72]           |                             10 |                       24.8 |

## Table 3 - Paired comparison (same 1056 surges, m in {10,15}, both profiles)

| Comparison                                     |   Only proposed detects |   Only baseline detects |   Exact McNemar p |
|:-----------------------------------------------|------------------------:|------------------------:|------------------:|
| Proposed (multi-scale) vs Proposed (10 min)    |                     295 |                       0 |          3.1e-89  |
| Proposed (multi-scale) vs Deployed v1          |                     686 |                       6 |          1.5e-194 |
| Proposed (multi-scale) vs Poisson raw          |                     484 |                       1 |          9.7e-144 |
| Proposed (multi-scale) vs Poisson city-uniform |                     465 |                       5 |          1.2e-130 |
| Proposed (multi-scale) vs Count threshold      |                     769 |                       2 |          4.8e-227 |
| Proposed (multi-scale) vs EWMA                 |                     130 |                       8 |          1.6e-29  |
| Proposed (multi-scale) vs Poisson CUSUM        |                     633 |                      66 |          3.6e-117 |
| Proposed (multi-scale) vs Space-time scan      |                     163 |                       0 |          1.7e-49  |

## Table 4 - Fixed production thresholds (no calibration)

| Rule                                                      |   Test alarms/day (all categories) | Recall fast m=5 (%)   | Recall fast m=10 (%)   | Recall slow m=15 (%)   |
|:----------------------------------------------------------|-----------------------------------:|:----------------------|:-----------------------|:-----------------------|
| Proposed (10 min): p < 0.01 and >= 5 complaints in 10 min |                               80.4 | 3.8 [2-7]             | 76.1 [71-81]           | 17.0 [13-22]           |
| Deployed v1: p < 0.01 and >= 5 complaints in 10 min       |                               80.1 | 3.4 [2-6]             | 76.1 [71-81]           | 17.0 [13-22]           |

## Table 5 - Fake-flood attack success (%) vs credibility-gate recall

Production rule:

|                    |   gate recall 0% |   gate recall 50% |   gate recall 80% |   gate recall 90% |   gate recall 95% |
|:-------------------|-----------------:|------------------:|------------------:|------------------:|------------------:|
| 5 fake complaints  |              100 |               4.5 |               0.5 |               0.5 |               0   |
| 10 fake complaints |              100 |              61.4 |               3.9 |               1.4 |               0   |
| 15 fake complaints |              100 |              96.4 |              22   |               1.6 |               0.2 |
| 25 fake complaints |              100 |             100   |              60   |              14.8 |               2.3 |

Budget-calibrated threshold (25/day):

|                    |   gate recall 0% |   gate recall 50% |   gate recall 80% |   gate recall 90% |   gate recall 95% |
|:-------------------|-----------------:|------------------:|------------------:|------------------:|------------------:|
| 5 fake complaints  |               72 |              18.9 |               1.6 |               0.5 |               0   |
| 10 fake complaints |              100 |              61.1 |              13.4 |               1.1 |               0   |
| 15 fake complaints |              100 |              91.6 |              31.4 |               5   |               1.6 |
| 25 fake complaints |              100 |              99.8 |              63.9 |              24.1 |               5.9 |

## Table 6 - Cost of gate false positives on genuine surges

|   gate_fp_rate | Recall of genuine surges (m=15, fast)   |
|---------------:|:----------------------------------------|
|           0    | 89.8 [82-95]                            |
|           0.05 | 87.5 [79-93]                            |
|           0.1  | 85.2 [76-91]                            |
|           0.2  | 78.4 [69-86]                            |

## Real-data validation (test period, no injection, proposed @ 25/day)

- Episodes: 547 (median size 7 complaints).
- Same-incident text homogeneity (Simpson index of the 311 descriptor, not used by the detector): median 0.333 in detected surges vs 0.230 in matched random groups (same category, day and size); Wilcoxon one-sided p = 2.3e-51.
- Resolution time: median 88 h in surges vs 265 h in matched groups; Wilcoxon p = 3.6e-08.

## Table 7 - Strongest real surges detected in the test period

| cat         | start            |   minutes |   n_complaints |   peak_score |     lat |      lon | top_descriptor        |   top_share |
|:------------|:-----------------|----------:|---------------:|-------------:|--------:|---------:|:----------------------|------------:|
| environment | 2022-03-17 14:00 |       110 |             51 |        86.28 | 40.779  | -73.9168 | Tree Leaning/Uprooted |       0.725 |
| noise       | 2022-03-16 09:45 |       125 |            235 |        73.69 | 40.8919 | -73.8602 | Loud Music/Party      |       1     |
| environment | 2022-03-25 16:00 |        80 |             91 |        63.63 | 40.6049 | -73.9637 | For One Address       |       1     |
| environment | 2022-03-17 09:25 |        25 |             17 |        61.51 | 40.779  | -73.9168 | Tree Leaning/Uprooted |       1     |
| housing     | 2022-03-17 02:10 |        25 |             14 |        52.84 | 40.7076 | -74.0057 | CABINET               |       0.143 |
| housing     | 2022-03-12 00:10 |        70 |             25 |        45.64 | 40.6544 | -73.9358 | FLOOR                 |       0.2   |
| housing     | 2022-03-12 00:05 |        75 |             11 |        45.64 | 40.6534 | -73.9508 | FLOOR                 |       0.182 |
| environment | 2022-03-31 07:05 |        20 |             10 |        45.46 | 40.6336 | -74.0239 | For One Address       |       1     |
| road        | 2022-03-13 17:25 |        20 |             10 |        42.29 | 40.5677 | -74.1398 | Pothole               |       1     |
| noise       | 2022-03-28 13:10 |       240 |            508 |        41.27 | 40.8917 | -73.8601 | Loud Music/Party      |       0.992 |

## Detected real surges by category

| cat           |   episodes |   median_size |   median_top_share |
|:--------------|-----------:|--------------:|-------------------:|
| housing       |        285 |           7   |              0.25  |
| electric      |         74 |           8   |              0.667 |
| road          |         53 |           5   |              1     |
| noise         |         36 |          15   |              0.935 |
| environment   |         36 |           6   |              1     |
| public_safety |         22 |           6   |              0.833 |
| traffic       |         21 |          11   |              0.769 |
| water         |         11 |           7   |              0.545 |
| sanitation    |          4 |           7.5 |              0.9   |
| drainage      |          3 |           4   |              1     |
| pollution     |          2 |           4   |              0.75  |
