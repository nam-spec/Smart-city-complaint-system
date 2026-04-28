"""
STSEP - Step 8: Paper Figures (Fully Corrected)

Fig 1 — Stage 1: Surge Detection — F1 and P@K
         GT: multi-signal consensus (not acceleration-based)
         Baselines now include Acceleration Only as a separate bar
         so the reader can see it is NOT the best detector

Fig 2 — Stage 2: NDCG + Wilcoxon significance stars
         Uses properly learned Stage-2 weights from best_weights.csv

Fig 3 — Priority score distribution (surge vs non-surge)
         Surge GT from consensus method

Fig 4 — Surge time series (unchanged)

Fig 5 — Stage-2 weight ablation heatmap (α2 vs β2)
         Shows the Stage-2 search space, not Stage-1

Fig 6 — Score contribution breakdown stacked bar (top 10 surge)

Fig 7 — Category surge lift chart
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

STYLE = {
    "figure.facecolor": "white",
    "axes.facecolor":   "white",
    "axes.grid":        True,
    "grid.alpha":       0.3,
    "font.family":      "DejaVu Sans",
    "font.size":        11,
}
plt.rcParams.update(STYLE)

BLUE  = "#2563EB"
GREY  = "#94A3B8"
RED   = "#DC2626"

def sig_stars(p):
    try:
        p = float(p)
    except Exception:
        return ""
    if p < 0.01:  return "**"
    if p < 0.05:  return "*"
    return "ns"

# ─────────────────────────────────────────────
# Fig 1 — Stage 1: Surge Detection
# ─────────────────────────────────────────────
try:
    s1 = pd.read_csv("../data/stage1_results.csv")

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 5))
    colors = [BLUE if "STSEP" in m else GREY for m in s1["Model"]]

    for ax, col, title in [
        (ax1, "F1",   "Stage 1: Surge Detection — F1 Score"),
        (ax2, "P@K",  "Stage 1: Surge Detection — Precision@K"),
    ]:
        ax.bar(s1["Model"], s1[col], color=colors, edgecolor="white")
        ax.set_title(title)
        ax.set_ylabel(col)
        ax.set_ylim(0, 1.05)
        ax.tick_params(axis="x", rotation=30)
        for bar, val in zip(ax.patches, s1[col]):
            ax.text(bar.get_x() + bar.get_width()/2,
                    bar.get_height() + 0.01,
                    f"{val:.3f}", ha="center", va="bottom", fontsize=9)

    plt.suptitle(
        "STSEP Stage 1: Surge Window Detection\n"
        "GT: multi-signal consensus (count anomaly AND spatial conc. AND severity elev.)",
        fontsize=12, fontweight="bold"
    )
    plt.tight_layout()
    plt.savefig("../data/fig1_stage1_surge_detection.png", dpi=150)
    plt.close()
    print("Saved fig1_stage1_surge_detection.png")
except Exception as e:
    print("Fig 1 skipped:", e)

# ─────────────────────────────────────────────
# Fig 2 — Stage 2: NDCG + significance stars
# ─────────────────────────────────────────────
try:
    eval_df = pd.read_csv("../data/evaluation_results.csv")

    fig, ax = plt.subplots(figsize=(12, 5))
    colors  = [BLUE if "STSEP" in m else GREY for m in eval_df["Model"]]

    bars = ax.bar(
        eval_df["Model"], eval_df["NDCG_mean"],
        yerr=eval_df["NDCG_std"], capsize=5,
        color=colors, edgecolor="white", linewidth=0.8
    )

    y_min = max(0.70, eval_df["NDCG_mean"].min() - 0.05)
    ax.set_ylim(y_min, eval_df["NDCG_mean"].max() + 0.09)
    ax.set_ylabel("NDCG Score")
    ax.set_title(
        "STSEP Stage 2 vs Baselines — Within-Surge Complaint Ranking\n"
        "(Temporal 8-fold CV · GT = High Severity AND High Spatial Density)\n"
        "* p<0.05  ** p<0.01  ns = not significant  (Wilcoxon signed-rank vs STSEP)"
    )
    plt.xticks(rotation=25, ha="right")

    for bar, val, p_raw in zip(bars, eval_df["NDCG_mean"], eval_df["p_value"]):
        ax.text(bar.get_x() + bar.get_width()/2,
                bar.get_height() + 0.003,
                f"{val:.4f}", ha="center", va="bottom", fontsize=9)
        stars = sig_stars(p_raw)
        if stars:
            color = RED if stars not in ("ns", "") else GREY
            ax.text(bar.get_x() + bar.get_width()/2,
                    bar.get_height() + 0.018,
                    stars, ha="center", va="bottom",
                    fontsize=11, color=color)

    plt.tight_layout()
    plt.savefig("../data/fig2_stage2_ndcg_comparison.png", dpi=150)
    plt.close()
    print("Saved fig2_stage2_ndcg_comparison.png")
except Exception as e:
    print("Fig 2 skipped:", e)

# ─────────────────────────────────────────────
# Fig 3 — Priority score: surge vs non-surge
# ─────────────────────────────────────────────
try:
    df = pd.read_csv("../data/final_priority_dataset.csv")

    fig, ax = plt.subplots(figsize=(9, 4))
    ax.hist(df.loc[df["surge_gt_consensus"] == 0, "priority_score"],
            bins=60, alpha=0.6, color=GREY, label="Non-surge complaints")
    ax.hist(df.loc[df["surge_gt_consensus"] == 1, "priority_score"],
            bins=60, alpha=0.7, color=BLUE, label="Surge complaints")
    ax.set_xlabel("Priority Score")
    ax.set_ylabel("Count")
    ax.set_title(
        "STSEP Priority Score Distribution: Surge vs Non-Surge\n"
        "(Surge GT: multi-signal consensus)"
    )
    ax.legend()
    plt.tight_layout()
    plt.savefig("../data/fig3_priority_distribution.png", dpi=150)
    plt.close()
    print("Saved fig3_priority_distribution.png")
except Exception as e:
    print("Fig 3 skipped:", e)

# ─────────────────────────────────────────────
# Fig 4 — Surge time series
# ─────────────────────────────────────────────
try:
    wdf = pd.read_csv("../data/window_level_stats.csv")
    wdf["time_window"] = pd.to_datetime(wdf["time_window"])
    surge_thresh = wdf["acceleration"].quantile(0.90)

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(13, 6), sharex=True)
    ax1.plot(wdf["time_window"], wdf["growth_rate"],
             color=BLUE, linewidth=0.7, label="Log Growth Rate")
    ax1.set_ylabel("Log Growth Rate")
    ax1.legend(loc="upper right")
    ax1.set_title("Complaint Growth Rate and Surge Acceleration Over Time")

    ax2.plot(wdf["time_window"], wdf["acceleration"],
             color="#64748B", linewidth=0.7, label="Acceleration (Δ Growth)")
    ax2.axhline(surge_thresh, color=RED, linestyle="--", linewidth=1.3,
                label=f"p90 threshold = {surge_thresh:.2f}")
    ax2.fill_between(wdf["time_window"], wdf["acceleration"], surge_thresh,
                     where=(wdf["acceleration"] > surge_thresh),
                     color=RED, alpha=0.30, label="High-acceleration windows")
    ax2.set_ylabel("Acceleration (Δ Growth)")
    ax2.set_xlabel("Time")
    ax2.legend(loc="upper right")

    plt.tight_layout()
    plt.savefig("../data/fig4_surge_timeseries.png", dpi=150)
    plt.close()
    print("Saved fig4_surge_timeseries.png")
except Exception as e:
    print("Fig 4 skipped:", e)

# ─────────────────────────────────────────────
# Fig 5 — Stage-2 weight ablation (α2 vs β2)
# ─────────────────────────────────────────────
try:
    ab2  = pd.read_csv("../data/weight_ablation_stage2.csv")
    best = ab2.sort_values("ndcg", ascending=False).iloc[0]

    pivot = ab2.pivot_table(
        index="alpha2", columns="beta2", values="ndcg", aggfunc="mean"
    )

    fig, ax = plt.subplots(figsize=(8, 6))
    im = ax.imshow(
        pivot.values, aspect="auto", cmap="YlOrRd", origin="lower",
        extent=[pivot.columns.min(), pivot.columns.max(),
                pivot.index.min(),   pivot.index.max()]
    )
    plt.colorbar(im, ax=ax, label="Val NDCG")
    ax.set_xlabel("β2 (Spatial weight)")
    ax.set_ylabel("α2 (Semantic weight)")

    # Check boundary
    tol = 0.051
    at_boundary = (
        abs(best["alpha2"] - pivot.index.min())   < tol or
        abs(best["alpha2"] - pivot.index.max())   < tol or
        abs(best["beta2"]  - pivot.columns.min()) < tol or
        abs(best["beta2"]  - pivot.columns.max()) < tol
    )
    note = " ⚠ at boundary — expand grid" if at_boundary else " ✓ interior"

    ax.set_title(
        f"Stage-2 Weight Ablation: Val NDCG vs α2 and β2\n"
        f"(γ2 = 1 − α2 − β2){note}"
    )
    ax.scatter([best["beta2"]], [best["alpha2"]],
               c="blue", s=120, marker="*", zorder=5, label="Best weights")
    ax.legend()
    plt.tight_layout()
    plt.savefig("../data/fig5_weight_ablation.png", dpi=150)
    plt.close()
    print("Saved fig5_weight_ablation.png")
except Exception as e:
    print("Fig 5 skipped:", e)

# ─────────────────────────────────────────────
# Fig 6 — Score breakdown stacked bar
# ─────────────────────────────────────────────
try:
    ex = pd.read_csv("../data/explainability_table.csv").head(10)
    bw = pd.read_csv("../data/best_weights.csv").iloc[0]
    a2, b2, g2 = bw["stage2_alpha"], bw["stage2_beta"], bw["stage2_gamma"]

    labels = [f"#{i+1} {cat}" for i, cat in enumerate(ex["category_clean"])]
    sem_c  = a2 * ex["severity_norm"].values
    spa_c  = b2 * ex["spatial_norm"].values
    tmp_c  = g2 * ex["temporal_norm"].values

    x = np.arange(len(labels))
    fig, ax = plt.subplots(figsize=(13, 5))
    ax.bar(x, sem_c,                       label="Semantic",  color="#3B82F6")
    ax.bar(x, spa_c, bottom=sem_c,         label="Spatial",   color="#10B981")
    ax.bar(x, tmp_c, bottom=sem_c+spa_c,   label="Temporal",  color="#F59E0B")
    ax.set_xticks(x)
    ax.set_xticklabels(labels, rotation=30, ha="right")
    ax.set_ylabel("Stage-2 Score Contribution")
    ax.set_title(
        "Stage-2 Score Decomposition — Top 10 Surge Complaints\n"
        f"(Learned weights: α2={a2:.2f}  β2={b2:.2f}  γ2={g2:.2f} · "
        "Acceleration excluded: used in Stage 1 only)"
    )
    ax.legend()
    plt.tight_layout()
    plt.savefig("../data/fig6_score_breakdown.png", dpi=150)
    plt.close()
    print("Saved fig6_score_breakdown.png")
except Exception as e:
    print("Fig 6 skipped:", e)

# ─────────────────────────────────────────────
# Fig 7 — Category surge lift
# ─────────────────────────────────────────────
try:
    cat_df = pd.read_csv("../data/category_surge_distribution.csv", index_col=0)
    cat_df = cat_df.sort_values("surge_lift", ascending=True)

    colors_bar = [RED if v > 0 else BLUE for v in cat_df["surge_lift"]]
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.barh(cat_df.index, cat_df["surge_lift"], color=colors_bar, edgecolor="white")
    ax.axvline(0, color="black", linewidth=0.8)
    ax.set_xlabel("Surge Lift (% over-representation in surge windows)")
    ax.set_title("Category Over/Under-Representation During Surges\n"
                 "(Surge GT: multi-signal consensus)")
    plt.tight_layout()
    plt.savefig("../data/fig7_category_surge_lift.png", dpi=150)
    plt.close()
    print("Saved fig7_category_surge_lift.png")
except Exception as e:
    print("Fig 7 skipped:", e)

print("\nAll figures generated.")