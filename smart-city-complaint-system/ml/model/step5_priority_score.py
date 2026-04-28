"""
STSEP - Step 5: Priority Score with Two Separate Weight Searches

"""

import pandas as pd
import numpy as np
from itertools import product
from sklearn.metrics import ndcg_score, f1_score

# ─────────────────────────────────────────────
# Load
# ─────────────────────────────────────────────
df = pd.read_csv("../data/complaints_with_acceleration.csv")
df["timestamp"] = pd.to_datetime(df["timestamp"])
df = df.sort_values("timestamp").reset_index(drop=True)
print("Loaded:", len(df))

# ─────────────────────────────────────────────
# Normalise features
# ─────────────────────────────────────────────
def normalize(col):
    r = col.max() - col.min()
    return (col - col.min()) / r if r > 0 else col * 0.0

df["severity_norm"]     = normalize(df["severity_score"])
df["spatial_norm"]      = normalize(df["spatial_density"])
df["temporal_norm"]     = normalize(df["temporal_density"])
df["acceleration_norm"] = normalize(df["acceleration"])

# ═══════════════════════════════════════════════════════════════
# MULTI-SIGNAL CONSENSUS GROUND TRUTH
# Independent of acceleration → no circularity
# ═══════════════════════════════════════════════════════════════
print("\n" + "─"*60)
print("Building Multi-Signal Consensus Surge GT …")
print("─"*60)

LOOKBACK = 28

win_agg = (
    df.groupby("time_window")
    .agg(
        win_count       = ("text",            "count"),
        win_spatial_max = ("spatial_density", "max"),
        win_sev_mean    = ("severity_score",  "mean"),
    )
    .reset_index()
    .sort_values("time_window")
    .reset_index(drop=True)
)

win_agg["count_median"] = (
    win_agg["win_count"]
    .rolling(LOOKBACK, min_periods=5).median().shift(1)
    .fillna(win_agg["win_count"].median())
)
win_agg["count_mad"] = (
    (win_agg["win_count"] - win_agg["count_median"]).abs()
    .rolling(LOOKBACK, min_periods=5).median().shift(1)
    .fillna(1.0)
)
win_agg["cond_count"] = (
    win_agg["win_count"] > win_agg["count_median"] + 2 * win_agg["count_mad"]
).astype(int)

spa_p75 = win_agg["win_spatial_max"].quantile(0.75)
win_agg["cond_spatial"] = (win_agg["win_spatial_max"] > spa_p75).astype(int)

sev_p75 = win_agg["win_sev_mean"].quantile(0.75)
win_agg["cond_severity"] = (win_agg["win_sev_mean"] > sev_p75).astype(int)

win_agg["surge_gt_consensus"] = (
    (win_agg["cond_count"]    == 1) &
    (win_agg["cond_spatial"]  == 1) &
    (win_agg["cond_severity"] == 1)
).astype(int)

n_surge = win_agg["surge_gt_consensus"].sum()
n_total = len(win_agg)
print(f"Total windows     : {n_total:,}")
print(f"Consensus surges  : {n_surge:,}  ({n_surge/n_total*100:.1f}%)")
print(f"Conditions        : count_anomaly AND spatial>p75 AND severity>p75")
print(f"Thresholds        : spatial_max>{spa_p75:.1f}  sev_mean>{sev_p75:.4f}")

# Merge GT back to complaint level
df = df.merge(
    win_agg[["time_window", "surge_gt_consensus",
             "cond_count", "cond_spatial", "cond_severity",
             "win_count", "win_spatial_max", "win_sev_mean"]],
    on="time_window", how="left"
)
df["surge_gt_consensus"] = df["surge_gt_consensus"].fillna(0).astype(int)

# ═══════════════════════════════════════════════════════════════
# OPTION 3: EXTERNAL VALIDATION via resolution time
# ═══════════════════════════════════════════════════════════════
option3_available = False

if "closed_date" in df.columns:
    print("\n" + "─"*60)
    print("Option 3: External validation via resolution time …")
    print("─"*60)

    df["closed_date"] = pd.to_datetime(df["closed_date"], errors="coerce")
    df["resolution_hours"] = (
        (df["closed_date"] - df["timestamp"]).dt.total_seconds() / 3600
    )
    df["resolution_hours"] = df["resolution_hours"].where(
        df["resolution_hours"].between(1/60, 720), other=np.nan
    )

    res_win = (
        df.groupby("time_window")["resolution_hours"]
        .agg(["mean", "count"])
        .rename(columns={"mean": "mean_res_hours", "count": "res_count"})
        .reset_index()
        .sort_values("time_window")
        .reset_index(drop=True)
    )
    res_win = res_win[res_win["res_count"] >= 5]

    res_win["res_baseline"] = (
        res_win["mean_res_hours"]
        .rolling(LOOKBACK, min_periods=5).median().shift(1)
        .fillna(res_win["mean_res_hours"].median())
    )
    res_win["res_mad"] = (
        (res_win["mean_res_hours"] - res_win["res_baseline"]).abs()
        .rolling(LOOKBACK, min_periods=5).median().shift(1)
        .fillna(1.0)
    )
    res_win = res_win.merge(
        win_agg[["time_window", "cond_count"]], on="time_window", how="left"
    )
    res_win["surge_gt_external"] = (
        (res_win["cond_count"] == 1) &
        (res_win["mean_res_hours"] > res_win["res_baseline"] + res_win["res_mad"])
    ).astype(int)

    n_ext = res_win["surge_gt_external"].sum()
    print(f"External GT surges : {n_ext:,}  "
          f"({n_ext/len(res_win)*100:.1f}% of windows with res data)")

    df = df.merge(
        res_win[["time_window", "surge_gt_external", "mean_res_hours"]],
        on="time_window", how="left"
    )
    df["surge_gt_external"] = df["surge_gt_external"].fillna(0).astype(int)

    merged_gt = win_agg[["time_window", "surge_gt_consensus"]].merge(
        res_win[["time_window", "surge_gt_external"]], on="time_window", how="inner"
    )
    agree = (merged_gt["surge_gt_consensus"] == merged_gt["surge_gt_external"]).mean()
    cohen_k_num = agree - (
        merged_gt["surge_gt_consensus"].mean() * merged_gt["surge_gt_external"].mean() +
        (1 - merged_gt["surge_gt_consensus"].mean()) * (1 - merged_gt["surge_gt_external"].mean())
    )
    cohen_k_den = 1 - (
        merged_gt["surge_gt_consensus"].mean() * merged_gt["surge_gt_external"].mean() +
        (1 - merged_gt["surge_gt_consensus"].mean()) * (1 - merged_gt["surge_gt_external"].mean())
    )
    cohen_k = cohen_k_num / cohen_k_den if cohen_k_den > 0 else 0.0
    print(f"GT agreement : {agree*100:.1f}%  |  Cohen's κ : {cohen_k:.3f}")

    option3_available = True
    res_win.to_csv("../data/external_gt_resolution.csv", index=False)
    print("External GT saved → external_gt_resolution.csv")
else:
    print("\nOption 3 skipped: 'closed_date' column not found.")

# ═══════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════

def is_boundary(val, ticks, tol=None):
    tol = tol or (ticks[1] - ticks[0]) + 1e-6
    return abs(val - ticks[0]) < tol or abs(val - ticks[-1]) < tol


def window_agg_for_fold(fold_df):
    """Aggregate fold complaints to window level for Stage-1 search."""
    return (
        fold_df.groupby("time_window")
        .agg(
            sev_norm_mean  = ("severity_norm",      "mean"),
            spa_norm_max   = ("spatial_norm",       "max"),
            tmp_norm_mean  = ("temporal_norm",      "mean"),
            acc_norm_mean  = ("acceleration_norm",  "mean"),
            surge_gt       = ("surge_gt_consensus", "max"),
        )
        .reset_index()
    )


def score_and_f1(win_df, a, b, g, d, threshold_pct=0.90):
    score  = (
        a * win_df["sev_norm_mean"] +
        b * win_df["spa_norm_max"]  +
        g * win_df["tmp_norm_mean"] +
        d * win_df["acc_norm_mean"]
    ).values
    thresh = np.quantile(score, threshold_pct)
    preds  = (score >= thresh).astype(int)
    return f1_score(win_df["surge_gt"].values, preds, zero_division=0)


# ═══════════════════════════════════════════════════════════════
# STAGE 1 WEIGHT SEARCH — Temporal K-Fold CV
# ═══════════════════════════════════════════════════════════════
print("\n" + "═"*60)
print("STAGE 1 WEIGHT SEARCH  (Temporal 4-Fold CV)")
print("GT  : Multi-signal consensus (count AND spatial AND severity)")
print("Opt : Maximise mean CV-F1 across folds")
print("WHY : Single val split had only 12 surge windows → F1 unstable")
print("      8-fold CV pools more surge windows → mean ± std reportable")
print("═"*60)

K         = 8
fold_size = len(df) // K

# Build window-level dataframe for each fold's test split
fold_win_dfs = []
for fold in range(1, K):
    test_start = fold * fold_size
    test_end   = (fold + 1) * fold_size if fold < K - 1 else len(df)
    fold_df    = df.iloc[test_start:test_end].copy()
    wdf        = window_agg_for_fold(fold_df)
    n_surge_f  = wdf["surge_gt"].sum()
    print(f"  Fold {fold}: {len(wdf):,} windows  |  surge windows: {n_surge_f}")
    fold_win_dfs.append(wdf)

total_surge_wins = sum(w["surge_gt"].sum() for w in fold_win_dfs)
print(f"\n  Total surge windows across CV folds : {total_surge_wins}")
print(f"  (vs 12 in old single val split — {total_surge_wins/12:.1f}x more signal)\n")

# ── Coarse pass ─────────────────────────────────────────────────
# α lower bound = 0.00: previous runs showed α1 genuinely near-zero
COARSE_S1 = np.round(np.arange(0.00, 0.81, 0.05), 10)
print(f"Coarse pass  [{COARSE_S1[0]:.2f} … {COARSE_S1[-1]:.2f}]  step=0.05 …")

best_mean_f1   = -1
best_s1_coarse = (0.25, 0.25, 0.25, 0.25)
s1_coarse_rows = []

for a, b, g in product(COARSE_S1, repeat=3):
    d = round(1.0 - a - b - g, 10)
    if not (COARSE_S1[0] - 1e-9 <= d <= COARSE_S1[-1] + 1e-9):
        continue
    fold_f1s = [score_and_f1(wdf, a, b, g, d) for wdf in fold_win_dfs]
    mean_f1  = float(np.mean(fold_f1s))
    s1_coarse_rows.append({
        "alpha": a, "beta": b, "gamma": g, "delta": d,
        "mean_f1": mean_f1, "std_f1": float(np.std(fold_f1s))
    })
    if mean_f1 > best_mean_f1:
        best_mean_f1   = mean_f1
        best_s1_coarse = (a, b, g, d)

a1c, b1c, g1c, d1c = best_s1_coarse
print(f"  Coarse best: α1={a1c:.2f} β1={b1c:.2f} γ1={g1c:.2f} δ1={d1c:.2f}  "
      f"mean F1={best_mean_f1:.4f}")

# ── Fine pass ±0.10 around coarse optimum, step 0.01 ────────────
lo = lambda v: max(0.00, round(v - 0.10, 2))
hi = lambda v: min(0.80, round(v + 0.10, 2))
fine_lo = min(lo(a1c), lo(b1c), lo(g1c), lo(d1c))
fine_hi = max(hi(a1c), hi(b1c), hi(g1c), hi(d1c))
FINE_S1 = np.round(np.arange(fine_lo, fine_hi + 0.011, 0.01), 10)
print(f"Fine  pass  [{FINE_S1[0]:.2f} … {FINE_S1[-1]:.2f}]  step=0.01 …")

best_fine_f1  = -1
best_s1_fine  = best_s1_coarse
best_s1_f1s   = []
s1_fine_rows  = []

for a, b, g in product(FINE_S1, repeat=3):
    d = round(1.0 - a - b - g, 10)
    if not (FINE_S1[0] - 1e-9 <= d <= FINE_S1[-1] + 1e-9):
        continue
    fold_f1s = [score_and_f1(wdf, a, b, g, d) for wdf in fold_win_dfs]
    mean_f1  = float(np.mean(fold_f1s))
    s1_fine_rows.append({
        "alpha": a, "beta": b, "gamma": g, "delta": d,
        "mean_f1": mean_f1, "std_f1": float(np.std(fold_f1s))
    })
    if mean_f1 > best_fine_f1:
        best_fine_f1 = mean_f1
        best_s1_fine = (a, b, g, d)
        best_s1_f1s  = fold_f1s

a1, b1, g1, d1 = best_s1_fine
best_s1_f1     = best_fine_f1
best_s1_std    = float(np.std(best_s1_f1s))

s1_boundary = (
    is_boundary(a1, FINE_S1) or is_boundary(b1, FINE_S1) or
    is_boundary(g1, FINE_S1) or is_boundary(d1, FINE_S1)
)

print(f"\nBest Stage-1 weights (CV-optimised):")
print(f"  α1 (severity)     = {a1:.3f}")
print(f"  β1 (spatial)      = {b1:.3f}")
print(f"  γ1 (temporal)     = {g1:.3f}")
print(f"  δ1 (acceleration) = {d1:.3f}")
print(f"  CV mean F1        = {best_s1_f1:.4f}  ±  {best_s1_std:.4f}")
print(f"  Per-fold F1       : {[round(f, 4) for f in best_s1_f1s]}")
print(f"  {'⚠ STILL AT BOUNDARY — inspect FINE_S1 range' if s1_boundary else '✓ interior (boundary resolved)'}")

if a1 < 0.02:
    print(f"\n  NOTE: α1≈0 is a genuine finding — severity adds little to")
    print(f"  window-level surge detection because GT already conditions on")
    print(f"  severity elevation. This is interpretable, not a grid artefact.")

# ═══════════════════════════════════════════════════════════════
# STAGE 2 WEIGHT SEARCH
# ═══════════════════════════════════════════════════════════════
print("\n" + "═"*60)
print("STAGE 2 WEIGHT SEARCH")
print("GT  : High severity AND high spatial density (joint)")
print("Opt : Maximise NDCG  |  Features: severity, spatial, temporal only")
print("═"*60)

split_idx  = int(len(df) * 0.70)
val_df     = df.iloc[split_idx:].copy()

val_win_s2     = window_agg_for_fold(val_df)
surge_wins_val = set(val_win_s2.loc[val_win_s2["surge_gt"] == 1, "time_window"])
val_surge      = val_df[val_df["time_window"].isin(surge_wins_val)].copy().reset_index(drop=True)

print(f"\nVal surge complaints : {len(val_surge):,}")
if len(val_surge) < 100:
    print("⚠  Too few surge complaints — using full val for Stage-2 search.")
    val_surge = val_df.copy().reset_index(drop=True)

sev_med_s2 = val_surge["severity_score"].median()
spa_med_s2 = val_surge["spatial_density"].median()
val_surge["gt_s2"] = (
    (val_surge["severity_score"]  >= sev_med_s2) &
    (val_surge["spatial_density"] >= spa_med_s2)
).astype(int)

print(f"GT positives : {val_surge['gt_s2'].sum():,}  ({val_surge['gt_s2'].mean()*100:.1f}%)")
print(f"Thresholds   : sev≥{sev_med_s2:.4f}  spa≥{spa_med_s2:.0f}")

y_true_s2 = val_surge["gt_s2"].values.reshape(1, -1)

def run_stage2(val_surge, ticks, y_true):
    best_ndcg, best_w, rows = -1, (1/3, 1/3, 1/3), []
    for a2, b2 in product(ticks, repeat=2):
        g2 = round(1.0 - a2 - b2, 10)
        if not (ticks[0] - 1e-9 <= g2 <= ticks[-1] + 1e-9):
            continue
        score = (
            a2 * val_surge["severity_norm"] +
            b2 * val_surge["spatial_norm"]  +
            g2 * val_surge["temporal_norm"]
        ).values.reshape(1, -1)
        ndcg = ndcg_score(y_true, score)
        rows.append({"alpha2": a2, "beta2": b2, "gamma2": g2, "ndcg": ndcg})
        if ndcg > best_ndcg:
            best_ndcg, best_w = ndcg, (a2, b2, g2)
    return best_w, best_ndcg, pd.DataFrame(rows)

COARSE_S2 = np.round(np.arange(0.01, 0.99, 0.05), 10)
print(f"\nCoarse pass  [{COARSE_S2[0]:.2f} … {COARSE_S2[-1]:.2f}]  step=0.05 …")
(a2c, b2c, g2c), ndcgc, s2_coarse = run_stage2(val_surge, COARSE_S2, y_true_s2)
print(f"  Coarse best: α2={a2c:.2f} β2={b2c:.2f} γ2={g2c:.2f}  NDCG={ndcgc:.4f}")

lo2 = lambda v: max(0.01, round(v - 0.10, 2))
hi2 = lambda v: min(0.98, round(v + 0.10, 2))
FINE_S2 = np.round(np.arange(
    min(lo2(a2c), lo2(b2c), lo2(g2c)),
    max(hi2(a2c), hi2(b2c), hi2(g2c)) + 0.011,
    0.01
), 10)
print(f"Fine  pass  [{FINE_S2[0]:.2f} … {FINE_S2[-1]:.2f}]  step=0.01 …")
(a2, b2, g2), best_s2_ndcg, s2_fine = run_stage2(val_surge, FINE_S2, y_true_s2)

s2_results = pd.concat([s2_coarse, s2_fine], ignore_index=True)

s2_boundary = (
    is_boundary(a2, FINE_S2) or is_boundary(b2, FINE_S2) or
    is_boundary(g2, FINE_S2)
)
print(f"\nBest Stage-2 weights:")
print(f"  α2 (severity) = {a2:.3f}")
print(f"  β2 (spatial)  = {b2:.3f}")
print(f"  γ2 (temporal) = {g2:.3f}")
print(f"  Val NDCG      = {best_s2_ndcg:.4f}")
print(f"  {'⚠ STILL AT BOUNDARY' if s2_boundary else '✓ interior (boundary resolved)'}")

# ═══════════════════════════════════════════════════════════════
# Apply Stage-1 weights to full dataset for priority_score
# ═══════════════════════════════════════════════════════════════
df["priority_score"] = (
    a1 * df["severity_norm"]     +
    b1 * df["spatial_norm"]      +
    g1 * df["temporal_norm"]     +
    d1 * df["acceleration_norm"]
)

print("\nPriority score stats (Stage-1 CV weights):")
print(df["priority_score"].describe())

print("\nTop 10 priority complaints:")
print(df.sort_values("priority_score", ascending=False)[
    ["text", "category_clean", "priority_score"]
].head(10))

# ─────────────────────────────────────────────
# Save
# ─────────────────────────────────────────────
s1_all = pd.concat([
    pd.DataFrame(s1_coarse_rows),
    pd.DataFrame(s1_fine_rows)
], ignore_index=True).sort_values("mean_f1", ascending=False)

s1_all.to_csv("../data/weight_ablation_stage1.csv", index=False)
s2_results.sort_values("ndcg", ascending=False).to_csv(
    "../data/weight_ablation_stage2.csv", index=False
)
pd.DataFrame([{
    "stage1_alpha":     a1,  "stage1_beta":    b1,
    "stage1_gamma":     g1,  "stage1_delta":   d1,
    "stage1_cv_f1":     best_s1_f1,
    "stage1_cv_f1_std": best_s1_std,
    "stage2_alpha":     a2,  "stage2_beta":    b2,
    "stage2_gamma":     g2,
    "stage2_val_ndcg":  best_s2_ndcg,
}]).to_csv("../data/best_weights.csv", index=False)

df.to_csv("../data/final_priority_dataset.csv", index=False)

print("\nSaved → weight_ablation_stage1.csv")
print("Saved → weight_ablation_stage2.csv")
print("Saved → best_weights.csv")
print("Saved → final_priority_dataset.csv")

# ─────────────────────────────────────────────
# Final summary
# ─────────────────────────────────────────────
print("\n" + "═"*60)
print("WEIGHT SEARCH SUMMARY")
print("═"*60)
print(f"\nStage-1 (4-fold CV, GT=multi-signal consensus):")
print(f"  α1={a1:.3f}  β1={b1:.3f}  γ1={g1:.3f}  δ1={d1:.3f}")
print(f"  CV F1 = {best_s1_f1:.4f} ± {best_s1_std:.4f}")
print(f"  {'⚠ boundary' if s1_boundary else '✓ interior'}")
print(f"\nStage-2 (val split, GT=joint high sev+spa):")
print(f"  α2={a2:.3f}  β2={b2:.3f}  γ2={g2:.3f}  NDCG={best_s2_ndcg:.4f}")
print(f"  {'⚠ boundary' if s2_boundary else '✓ interior'}")
print(f"\nOption 3 external GT: {'available' if option3_available else 'not available (no closed_date)'}")