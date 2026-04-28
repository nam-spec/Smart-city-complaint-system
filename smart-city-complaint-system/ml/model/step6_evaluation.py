"""
STSEP - Step 6: Two-Stage Evaluation

Uses weights from best_weights.csv produced by step5.
Stage-1 weights optimised against multi-signal consensus GT.
Stage-2 weights optimised directly against within-surge NDCG GT.
Both are now non-circular.
"""

import pandas as pd
import numpy as np
from sklearn.metrics import ndcg_score, f1_score, precision_score
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import StandardScaler
from scipy.stats import wilcoxon

# ─────────────────────────────────────────────
# Load
# ─────────────────────────────────────────────
df = pd.read_csv("../data/final_priority_dataset.csv")
df["timestamp"] = pd.to_datetime(df["timestamp"])
df = df.sort_values("timestamp").reset_index(drop=True)
print("Loaded:", len(df))

def normalize(col):
    r = col.max() - col.min()
    return (col - col.min()) / r if r > 0 else col * 0.0

# ─────────────────────────────────────────────
# Load best weights
# ─────────────────────────────────────────────
bw   = pd.read_csv("../data/best_weights.csv").iloc[0]
a1   = bw["stage1_alpha"];  b1 = bw["stage1_beta"]
g1   = bw["stage1_gamma"];  d1 = bw["stage1_delta"]
a2   = bw["stage2_alpha"];  b2 = bw["stage2_beta"]
g2   = bw["stage2_gamma"]

print(f"\nLoaded Stage-1 weights: α1={a1:.2f} β1={b1:.2f} γ1={g1:.2f} δ1={d1:.2f}")
print(f"Loaded Stage-2 weights: α2={a2:.2f} β2={b2:.2f} γ2={g2:.2f}")

# Stage-2 score on full df
df["stsep_stage2"] = (
    a2 * df["severity_norm"] +
    b2 * df["spatial_norm"]  +
    g2 * df["temporal_norm"]
)

# ══════════════════════════════════════════════
# STAGE 1: SURGE WINDOW DETECTION
# ══════════════════════════════════════════════
print("\n" + "═"*60)
print("STAGE 1: Surge Window Detection")
print("GT  : Multi-signal consensus (count AND spatial AND severity)")
print("═"*60)

df["time_window"] = pd.to_datetime(df["time_window"])

win_df = (
    df.groupby("time_window")
    .agg(
        win_count        = ("text",              "count"),
        win_acceleration = ("acceleration",      "mean"),
        win_growth       = ("growth_rate",       "mean"),
        win_spatial_peak = ("spatial_density",   "max"),
        surge_gt         = ("surge_gt_consensus","max"),
        sev_norm_mean    = ("severity_norm",     "mean"),
        spa_norm_max     = ("spatial_norm",      "max"),
        tmp_norm_mean    = ("temporal_norm",     "mean"),
        acc_norm_mean    = ("acceleration_norm", "mean"),
    )
    .reset_index()
)

print(f"\nTotal windows     : {len(win_df):,}")
print(f"Surge windows (GT): {win_df['surge_gt'].sum():,} "
      f"({win_df['surge_gt'].mean()*100:.1f}%)")

# Stage-1 model scores
win_df["stsep_s1_score"] = (
    a1 * win_df["sev_norm_mean"] +
    b1 * win_df["spa_norm_max"]  +
    g1 * win_df["tmp_norm_mean"] +
    d1 * win_df["acc_norm_mean"]
)
win_df["growth_score"]       = normalize(win_df["win_growth"])
win_df["spatial_peak_score"] = normalize(win_df["win_spatial_peak"])
win_df["acc_score"]          = normalize(win_df["win_acceleration"])
np.random.seed(42)
win_df["random_score"]       = np.random.rand(len(win_df))

def stage1_metrics(scores, gt, threshold_pct=0.90):
    thresh = np.quantile(scores, threshold_pct)
    preds  = (scores >= thresh).astype(int)
    f1     = f1_score(gt, preds, zero_division=0)
    prec   = precision_score(gt, preds, zero_division=0)
    k      = max(int(gt.sum()), 1)
    top_k  = np.argsort(scores)[::-1][:k]
    pat_k  = gt[top_k].mean()
    return f1, prec, pat_k

s1_results = {}
for name, col in [
    ("STSEP (learned weights)",  "stsep_s1_score"),
    ("Acceleration Only",        "acc_score"),
    ("Growth Rate Only",         "growth_score"),
    ("Spatial Peak Only",        "spatial_peak_score"),
    ("Random",                   "random_score"),
]:
    f1, prec, patk = stage1_metrics(
        win_df[col].values, win_df["surge_gt"].values
    )
    s1_results[name] = {"F1": f1, "Precision": prec, "P@K": patk}

    if f1 >= 0.99:
        print(f"⚠  {name} F1={f1:.4f} — check for remaining circularity.")

print("\n" + "─"*56)
print(f"{'Model':<28} {'F1':>6} {'Prec':>8} {'P@K':>8}")
print("─"*56)
for name, m in s1_results.items():
    tag = "  ◀ proposed" if "STSEP" in name else ""
    print(f"{name:<28} {m['F1']:>6.4f} {m['Precision']:>8.4f} {m['P@K']:>8.4f}{tag}")
print("─"*56)

surge_win_set = set(win_df.loc[win_df["surge_gt"] == 1, "time_window"])

# ══════════════════════════════════════════════
# STAGE 2: WITHIN-SURGE COMPLAINT RANKING
# ══════════════════════════════════════════════
print("\n" + "═"*60)
print("STAGE 2: Within-Surge Complaint Ranking")
print("GT  : High severity AND high spatial density (joint)")
print("NOTE: Acceleration excluded (constant within window)")
print("═"*60)

K         = 8
fold_size = len(df) // K

print(f"\nTemporal {K}-fold CV  ({fold_size:,} rows per fold)\n")

metrics = {m: [] for m in [
    "stsep", "semantic", "spatial", "temporal", "no_surge", "stdbscan"
]}
fold_stats = []

for fold in range(1, K):
    test_start = fold * fold_size
    test_end   = (fold + 1) * fold_size if fold < K - 1 else len(df)
    test_df    = df.iloc[test_start:test_end].copy().reset_index(drop=True)

    surge_df = test_df[test_df["time_window"].isin(surge_win_set)].copy()
    surge_df = surge_df.reset_index(drop=True)

    if len(surge_df) < 50:
        print(f"Fold {fold}: too few surge complaints ({len(surge_df)}), skipping")
        continue

    sev_med = surge_df["severity_score"].median()
    spa_med = surge_df["spatial_density"].median()

    surge_df["ground_truth"] = (
        (surge_df["severity_score"]  >= sev_med) &
        (surge_df["spatial_density"] >= spa_med)
    ).astype(int)

    pos_rate = surge_df["ground_truth"].mean()
    n_wins   = surge_df["time_window"].nunique()

    print(f"Fold {fold}: test={len(test_df):,}  surge={len(surge_df):,}  "
          f"windows={n_wins}  GT={pos_rate*100:.1f}%  "
          f"(sev≥{sev_med:.3f} AND spa≥{spa_med:.0f})")

    fold_stats.append({
        "fold": fold, "test_rows": len(test_df),
        "surge_complaints": len(surge_df),
        "surge_windows": n_wins,
        "gt_positive_rate": round(pos_rate, 4),
        "sev_threshold": round(sev_med, 4),
        "spa_threshold": round(spa_med, 1),
    })

    y_true = surge_df["ground_truth"].values.reshape(1, -1)

    # STSEP Stage-2: uses properly learned α2, β2, γ2
    stsep_score    = surge_df["stsep_stage2"].values.reshape(1, -1)
    sem_score      = surge_df["severity_norm"].values.reshape(1, -1)
    spa_score      = surge_df["spatial_norm"].values.reshape(1, -1)
    tmp_score      = surge_df["temporal_norm"].values.reshape(1, -1)

    no_surge_score = (
        0.30 * surge_df["severity_norm"] +
        0.25 * surge_df["spatial_norm"]  +
        0.20 * surge_df["temporal_norm"]
    ).values.reshape(1, -1)

    # ST-DBSCAN
    SAMPLE   = min(10_000, len(surge_df))
    samp_idx = surge_df.sample(n=SAMPLE, random_state=42).index
    samp     = surge_df.loc[samp_idx].copy()

    coords   = np.radians(samp[["lat", "lon"]].values)
    t_num    = samp["timestamp"].astype("int64").values // 10**9
    t_scaled = StandardScaler().fit_transform(t_num.reshape(-1, 1))
    X_db     = np.hstack([coords, t_scaled])

    db_labels = DBSCAN(eps=0.0005, min_samples=5, n_jobs=-1).fit_predict(X_db)
    cl_sizes  = pd.Series(db_labels).value_counts()
    samp      = samp.copy()
    samp["cluster_size"] = (
        pd.Series(db_labels, index=samp.index).map(cl_sizes).fillna(0).values
    )
    samp.loc[samp.index[db_labels == -1], "cluster_size"] = 0
    samp["cluster_norm"] = normalize(samp["cluster_size"])

    y_true_db  = surge_df.loc[samp_idx, "ground_truth"].values.reshape(1, -1)
    stdb_score = samp["cluster_norm"].values.reshape(1, -1)

    metrics["stsep"].append(    ndcg_score(y_true,    stsep_score))
    metrics["semantic"].append( ndcg_score(y_true,    sem_score))
    metrics["spatial"].append(  ndcg_score(y_true,    spa_score))
    metrics["temporal"].append( ndcg_score(y_true,    tmp_score))
    metrics["no_surge"].append( ndcg_score(y_true,    no_surge_score))
    metrics["stdbscan"].append( ndcg_score(y_true_db, stdb_score))

# ─────────────────────────────────────────────
# Wilcoxon signed-rank test
# ─────────────────────────────────────────────
def wilcoxon_p(a_scores, b_scores):
    if len(a_scores) < 2:
        return float("nan")
    try:
        _, p = wilcoxon(a_scores, b_scores, alternative="greater")
        return p
    except Exception:
        return float("nan")

stsep_mean = np.mean(metrics["stsep"])

MODEL_LABELS = {
    "stsep":    "STSEP Stage-2 (Proposed)",
    "semantic": "Semantic Only",
    "spatial":  "Spatial Only",
    "temporal": "Temporal Only",
    "no_surge": "No-Surge Model",
    "stdbscan": "ST-DBSCAN",
}

print("\n" + "="*80)
print(f"{'Model':<28} {'NDCG Mean':>10} {'± Std':>8}  {'vs STSEP':>9}  {'p-value':>10}")
print("="*80)

rows = []
for key, label in MODEL_LABELS.items():
    vals  = metrics[key]
    m, s  = np.mean(vals), np.std(vals)
    diff  = m - stsep_mean if key != "stsep" else 0.0
    sign  = "+" if diff >= 0 else ""
    tag   = "  ◀ proposed" if key == "stsep" else ""
    p_str = "—" if key == "stsep" else f"{wilcoxon_p(metrics['stsep'], vals):.4f}"
    rows.append({"Model":label,"NDCG_mean":round(m,4),"NDCG_std":round(s,4),"p_value":p_str})
    print(f"{label:<28}  {m:.4f}     ±{s:.4f}   {sign}{diff:.4f}   {p_str:>10}{tag}")

print("="*80)

nosurge_mean  = np.mean(metrics["no_surge"])
best_single   = max(np.mean(metrics[k]) for k in ["semantic","spatial","temporal","stdbscan"])
print(f"\nSTSEP vs No-Surge : {(stsep_mean-nosurge_mean)/nosurge_mean*100:+.2f}% NDCG lift")
print(f"STSEP vs best single : {(stsep_mean-best_single)/best_single*100:+.2f}%")

# ─────────────────────────────────────────────
# Per-fold detail + paper summary
# ─────────────────────────────────────────────
stats_df = pd.DataFrame(fold_stats)
print("\nPer-fold breakdown:")
print(stats_df.to_string(index=False))

print("\n" + "═"*60)
print("COMBINED PAPER SUMMARY")
print("═"*60)
print("\nStage 1 — Surge Detection (multi-signal consensus GT):")
for name, m in s1_results.items():
    tag = "  ◀ proposed" if "STSEP" in name else ""
    print(f"  {name:<28} F1={m['F1']:.4f}  P@K={m['P@K']:.4f}{tag}")

print(f"\nStage 2 — Within-Surge Ranking (NDCG, {K-1}-fold CV):")
for row in rows:
    tag = "  ◀ proposed" if "Proposed" in row["Model"] else ""
    print(f"  {row['Model']:<28} NDCG={row['NDCG_mean']:.4f} ±{row['NDCG_std']:.4f}  "
          f"p={row['p_value']:>10}{tag}")

# ─────────────────────────────────────────────
# Save
# ─────────────────────────────────────────────
pd.DataFrame(rows).to_csv("../data/evaluation_results.csv", index=False)
stats_df.to_csv("../data/fold_stats.csv", index=False)
pd.DataFrame(s1_results).T.reset_index().rename(
    columns={"index":"Model"}
).to_csv("../data/stage1_results.csv", index=False)

print("\nSaved → evaluation_results.csv")
print("Saved → fold_stats.csv")
print("Saved → stage1_results.csv")