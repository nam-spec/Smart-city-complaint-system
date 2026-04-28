"""
STSEP - Step 7: Explainability + Failure Case Analysis

Uses best_weights.csv from step5 and surge_gt_consensus from step5.
Stage-2 score uses properly learned α2, β2, γ2 (no acceleration).
"""

import pandas as pd
import numpy as np

# ─────────────────────────────────────────────
# Load
# ─────────────────────────────────────────────
df = pd.read_csv("../data/final_priority_dataset.csv")
df["timestamp"] = pd.to_datetime(df["timestamp"])
df = df.sort_values("timestamp").reset_index(drop=True)
print("Loaded:", len(df))

# ─────────────────────────────────────────────
# Load weights
# ─────────────────────────────────────────────
bw = pd.read_csv("../data/best_weights.csv").iloc[0]
a2, b2, g2 = bw["stage2_alpha"], bw["stage2_beta"], bw["stage2_gamma"]
print(f"Stage-2 weights: α2={a2:.2f}  β2={b2:.2f}  γ2={g2:.2f}")

# ─────────────────────────────────────────────
# Identify surge windows using consensus GT
# (already stored in final_priority_dataset.csv by step5)
# ─────────────────────────────────────────────
df["time_window"] = pd.to_datetime(df["time_window"])
surge_df = df[df["surge_gt_consensus"] == 1].copy().reset_index(drop=True)

print(f"\nSurge complaints : {len(surge_df):,}  ({len(surge_df)/len(df)*100:.1f}% of total)")
print(f"Surge windows    : {surge_df['time_window'].nunique():,}")
print("GT method        : Multi-signal consensus (count AND spatial AND severity)")

# ─────────────────────────────────────────────
# Stage-2 ground truth: joint condition
# ─────────────────────────────────────────────
sev_med = surge_df["severity_score"].median()
spa_med = surge_df["spatial_density"].median()

surge_df["ground_truth"] = (
    (surge_df["severity_score"]  >= sev_med) &
    (surge_df["spatial_density"] >= spa_med)
).astype(int)

print(f"GT positives     : {surge_df['ground_truth'].sum():,}  "
      f"({surge_df['ground_truth'].mean()*100:.1f}%)")
print(f"GT thresholds    : sev≥{sev_med:.3f}  spa≥{spa_med:.0f}")

# ─────────────────────────────────────────────
# Rank by Stage-2 score
# ─────────────────────────────────────────────
surge_df["stage2_score"] = (
    a2 * surge_df["severity_norm"] +
    b2 * surge_df["spatial_norm"]  +
    g2 * surge_df["temporal_norm"]
)

surge_df = surge_df.sort_values("stage2_score", ascending=False).reset_index(drop=True)
surge_df["rank"] = surge_df.index + 1

# ─────────────────────────────────────────────
# TP / FP / FN analysis (top 10%)
# ─────────────────────────────────────────────
TOP_N  = int(len(surge_df) * 0.10)
top_df = surge_df.head(TOP_N).copy()

tp = top_df[top_df["ground_truth"] == 1]
fp = top_df[top_df["ground_truth"] == 0]
fn = surge_df[(surge_df["ground_truth"] == 1) & (surge_df["rank"] > TOP_N)]

print(f"\nTop {TOP_N:,} by Stage-2 score:")
print(f"  True  positives : {len(tp):,}  ({len(tp)/TOP_N*100:.1f}%)")
print(f"  False positives : {len(fp):,}  ({len(fp)/TOP_N*100:.1f}%)")
print(f"  False negatives : {len(fn):,}  (missed high-priority complaints)")

COLS = [
    "text", "category_clean",
    "severity_norm", "spatial_norm", "temporal_norm", "acceleration_norm",
    "stage2_score"
]

print("\n── FALSE POSITIVES (high Stage-2 rank, fails joint GT) ──")
print("Why? High on one feature (e.g. temporal) but below-median on the other.")
print(fp[COLS].head(10).to_string())

print("\n── FALSE NEGATIVES (low Stage-2 rank, meets joint GT) ──")
print("Why? High severity and density but in off-peak temporal window.")
print(fn[COLS].head(10).to_string())

# ─────────────────────────────────────────────
# Score breakdown for top 5
# ─────────────────────────────────────────────
print("\n── Score Breakdown: Top 5 Surge Complaints (Stage 2) ──")
print(f"   Weights: α2={a2:.3f}  β2={b2:.3f}  γ2={g2:.3f}")
print(f"   Acceleration excluded — used only in Stage 1.")

for i, (_, row) in enumerate(surge_df.head(5).iterrows()):
    sem_c  = a2 * row["severity_norm"]
    spa_c  = b2 * row["spatial_norm"]
    tmp_c  = g2 * row["temporal_norm"]
    total  = sem_c + spa_c + tmp_c
    gt_tag = "✓ JOINT-HIGH" if row["ground_truth"] == 1 else "✗ fails GT"

    print(f"\n#{i+1} [{gt_tag}] {str(row['text'])[:55]} ({row['category_clean']})")
    print(f"   Semantic  {sem_c:.3f} ({sem_c/total*100:.0f}%)  "
          f"Spatial  {spa_c:.3f} ({spa_c/total*100:.0f}%)  "
          f"Temporal {tmp_c:.3f} ({tmp_c/total*100:.0f}%)  "
          f"→ Stage-2: {total:.3f}")
    print(f"   [Full priority_score = {row['priority_score']:.3f} (Stage-1 weights incl. δ·acc)]")

# ─────────────────────────────────────────────
# Category distribution
# ─────────────────────────────────────────────
print("\n── Category Distribution: Surge vs Full Dataset ──")
full_cat  = df["category_clean"].value_counts(normalize=True).rename("full_%")
surge_cat = surge_df["category_clean"].value_counts(normalize=True).rename("surge_%")
cat_comp  = pd.concat([full_cat, surge_cat], axis=1).fillna(0)
cat_comp["surge_lift"] = (
    (cat_comp["surge_%"] - cat_comp["full_%"]) / cat_comp["full_%"] * 100
).round(1)
print(cat_comp.to_string())
cat_comp.to_csv("../data/category_surge_distribution.csv")
print("\nCategory distribution saved → category_surge_distribution.csv")

# ─────────────────────────────────────────────
# Explainability table
# ─────────────────────────────────────────────
explain_cols = COLS + ["ground_truth", "rank", "time_window", "priority_score"]
surge_df[explain_cols].head(50).to_csv(
    "../data/explainability_table.csv", index=False
)
print("Explainability table saved → explainability_table.csv")