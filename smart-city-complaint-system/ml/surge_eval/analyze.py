"""Builds the tables and figures for the paper from results/ (run run_experiments.py first)."""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy.stats import binomtest, wilcoxon  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, "results")
FIG = os.path.join(HERE, "figures")
os.makedirs(FIG, exist_ok=True)
meta = json.load(open(os.path.join(RES, "meta.json")))
LABELS = meta["labels"]
BUDGET = 25

inj = pd.read_csv(os.path.join(RES, "injection_detections.csv"))
adv = pd.read_csv(os.path.join(RES, "adversarial_floods.csv"))
col = pd.read_csv(os.path.join(RES, "gate_collateral.csv"))
epi = pd.read_csv(os.path.join(RES, "real_episodes.csv"))

# reference palette (light), fixed order; text never in series colour
PAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
INK, INK2, GRID = "#0b0b0b", "#52514e", "#e4e3df"
plt.rcParams.update({"font.size": 10, "axes.edgecolor": INK2, "axes.labelcolor": INK, "xtick.color": INK2,
                     "ytick.color": INK2, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.6,
                     "axes.spines.top": False, "axes.spines.right": False, "figure.dpi": 150,
                     "savefig.bbox": "tight", "legend.frameon": False})

KEY = ["proposed_mw", "proposed", "scan", "cusum", "count"]
SHORT = {"proposed_mw": "Proposed (multi-scale)", "proposed": "Proposed (10 min)", "scan": "Space-time scan",
         "cusum": "Poisson CUSUM", "count": "Count threshold", "ewma": "EWMA", "poisson_raw": "Poisson raw",
         "poisson_city": "Poisson city-uniform", "deployed": "Deployed v1"}


def ci(x):
    """Wilson 95% CI for a proportion."""
    x = np.asarray(x, dtype=bool)
    n, k = len(x), x.sum()
    if n == 0:
        return np.nan, np.nan, np.nan
    r = binomtest(k, n).proportion_ci(method="wilson")
    return k / n, r.low, r.high


def fmt(p):
    v, lo, hi = p
    return f"{v * 100:.1f} [{lo * 100:.0f}-{hi * 100:.0f}]"


def recall(method, budget, profile, m):
    d = inj[(inj.method == method) & (inj.far == budget) & (inj.profile == profile) & (inj.m == m)]
    return d


def table(methods):
    rows = []
    for meth in methods:
        r = {"Method": LABELS.get(meth, meth)}
        for prof, m in [("fast", 10), ("fast", 15), ("slow", 15), ("slow", 25)]:
            d = recall(meth, BUDGET, prof, m)
            r[f"Recall {prof} m={m} (%)"] = fmt(ci(d.detected))
        d = recall(meth, BUDGET, "fast", 15)
        r["Median delay fast m=15 (min)"] = f"{d[d.detected].delay.median():.0f}" if d.detected.any() else "-"
        r["Test alarms/day @25 cal."] = f"{meta['far_test'][meth][str(BUDGET)]:.1f}"
        rows.append(r)
    return pd.DataFrame(rows)


md = []
md.append(f"# Surge-detection evaluation results\n\nData: NYC 311, {meta['n_complaints']:,} complaints, "
          f"{meta['n_cells']} H3 res-8 cells, {len(meta['categories'])} categories. Split: train "
          f"{meta['split']['train']}, calibration {meta['split']['calibration']}, test {meta['split']['test']}. "
          f"Injected surges: {meta['surges_per_category_per_run']} per category per run x {len(meta['seeds'])} seeds; "
          f"'fast' = m extra complaints over 30 min, 'slow' = over 120 min. All detectors calibrated to the same "
          f"alarm budget ({BUDGET} alarm episodes/day city-wide) on the calibration period. Brackets: Wilson 95% CI.\n")

main_methods = ["proposed_mw", "proposed", "deployed", "poisson_raw", "poisson_city", "count", "ewma", "cusum", "scan"]
t1 = table(main_methods)
t1.to_csv(os.path.join(RES, "table1_main.csv"), index=False)
md.append("## Table 1 - Detector comparison at equal alarm budget\n\n" + t1.to_markdown(index=False) + "\n")

abl = ["proposed"] + [m for m in LABELS if m.startswith("abl_")]
t2 = table(abl)
t2.to_csv(os.path.join(RES, "table2_ablation.csv"), index=False)
md.append("## Table 2 - Ablations of the proposed detector\n\n" + t2.to_markdown(index=False) + "\n")

# paired McNemar (exact) - proposed_mw vs each, pooled over m in {10,15}, both profiles, budget 25
rows = []
base = inj[(inj.far == BUDGET) & (inj.m.isin([10, 15]))]
piv = base.pivot_table(index="surge_id", columns="method", values="detected", aggfunc="first")
for meth in main_methods[1:]:
    a, b = piv["proposed_mw"].astype(bool), piv[meth].astype(bool)
    n01, n10 = int((~a & b).sum()), int((a & ~b).sum())
    p = binomtest(n10, n10 + n01, 0.5).pvalue if n10 + n01 else 1.0
    rows.append({"Comparison": f"Proposed (multi-scale) vs {SHORT.get(meth, meth)}", "Only proposed detects": n10,
                 "Only baseline detects": n01, "Exact McNemar p": f"{p:.2g}"})
t3 = pd.DataFrame(rows)
t3.to_csv(os.path.join(RES, "table3_mcnemar.csv"), index=False)
md.append(f"## Table 3 - Paired comparison (same {len(piv)} surges, m in {{10,15}}, both profiles)\n\n"
          + t3.to_markdown(index=False) + "\n")

# production operating point
rows = []
for name in ["proposed", "deployed"]:
    r = {"Rule": f"{SHORT[name]}: p < 0.01 and >= 5 complaints in 10 min",
         "Test alarms/day (all categories)": f"{meta['production_point'][name]['far_test_per_day']:.1f}"}
    for prof, m in [("fast", 5), ("fast", 10), ("slow", 15)]:
        d = inj[(inj.method == f"prod_{name}") & (inj.profile == prof) & (inj.m == m)]
        r[f"Recall {prof} m={m} (%)"] = fmt(ci(d.detected))
    rows.append(r)
t4 = pd.DataFrame(rows)
md.append("## Table 4 - Fixed production thresholds (no calibration)\n\n" + t4.to_markdown(index=False) + "\n")

# adversarial
t5 = adv.groupby(["m_fake", "gate_recall"])["success_prod"].mean().unstack().mul(100).round(1)
t5.columns = [f"gate recall {c:.0%}" for c in t5.columns]
t5.index = [f"{i} fake complaints" for i in t5.index]
t5b = adv.groupby(["m_fake", "gate_recall"])["success_far25"].mean().unstack().mul(100).round(1)
t5b.columns = t5.columns
t5b.index = t5.index
md.append("## Table 5 - Fake-flood attack success (%) vs credibility-gate recall\n\nProduction rule:\n\n"
          + t5.to_markdown() + "\n\nBudget-calibrated threshold (25/day):\n\n" + t5b.to_markdown() + "\n")
t6 = col.groupby("gate_fp_rate")["detected"].apply(lambda x: fmt(ci(x))).rename("Recall of genuine surges (m=15, fast)")
md.append("## Table 6 - Cost of gate false positives on genuine surges\n\n" + t6.to_frame().to_markdown() + "\n")

# real-data validation
e = epi.dropna(subset=["random_simpson"])
w1 = wilcoxon(e["simpson"], e["random_simpson"], alternative="greater")
w2 = wilcoxon(e["median_res_hours"], e["random_median_res_hours"])
md.append("## Real-data validation (test period, no injection, proposed @ 25/day)\n\n"
          f"- Episodes: {len(epi)} (median size {epi.n_complaints.median():.0f} complaints).\n"
          f"- Same-incident text homogeneity (Simpson index of the 311 descriptor, not used by the detector): "
          f"median {e.simpson.median():.3f} in detected surges vs {e.random_simpson.median():.3f} in matched random "
          f"groups (same category, day and size); Wilcoxon one-sided p = {w1.pvalue:.2g}.\n"
          f"- Resolution time: median {e.median_res_hours.median():.0f} h in surges vs "
          f"{e.random_median_res_hours.median():.0f} h in matched groups; Wilcoxon p = {w2.pvalue:.2g}.\n")
top = epi.sort_values("peak_score", ascending=False).head(10)[
    ["cat", "start", "minutes", "n_complaints", "peak_score", "lat", "lon", "top_descriptor", "top_share"]]
top.to_csv(os.path.join(RES, "table7_case_studies.csv"), index=False)
md.append("## Table 7 - Strongest real surges detected in the test period\n\n" + top.to_markdown(index=False) + "\n")
by_cat = epi.groupby("cat").agg(episodes=("cat", "size"), median_size=("n_complaints", "median"),
                                median_top_share=("top_share", "median")).sort_values("episodes", ascending=False)
md.append("## Detected real surges by category\n\n" + by_cat.to_markdown() + "\n")

open(os.path.join(RES, "RESULTS.md"), "w").write("\n".join(md))

# ---------------------------------------------------------------- figures
# F1 recall vs alarm budget
fig, axes = plt.subplots(1, 2, figsize=(9, 3.4), sharey=True)
for ax, (prof, m) in zip(axes, [("fast", 15), ("slow", 15)]):
    for i, meth in enumerate(KEY):
        d = inj[(inj.method == meth) & (inj.profile == prof) & (inj.m == m)]
        g = d.groupby("far").detected.mean().sort_index()
        ax.plot(g.index, g.values * 100, color=PAL[i], lw=2, marker="o", ms=4,
                label=SHORT[meth])
    ax.set_xscale("log")
    ax.set_xticks([5, 10, 25, 50, 100])
    ax.set_xticklabels(["5", "10", "25", "50", "100"])
    ax.set_xlabel("Alarm budget (alarm episodes / day, city-wide)")
    ax.set_title(f"{'Fast' if prof == 'fast' else 'Slow'} surges: {m} extra complaints over "
                 f"{'30' if prof == 'fast' else '120'} min", fontsize=10, color=INK)
axes[0].set_ylabel("Surges detected (%)")
axes[0].set_ylim(0, 102)
axes[1].legend(loc="lower right", fontsize=8)
fig.savefig(os.path.join(FIG, "fig1_recall_vs_budget.png"))
plt.close(fig)

# F2 recall vs intensity at budget 25
fig, axes = plt.subplots(1, 2, figsize=(9, 3.4), sharey=True)
for ax, prof in zip(axes, ["fast", "slow"]):
    for i, meth in enumerate(KEY):
        d = inj[(inj.method == meth) & (inj.profile == prof) & (inj.far == BUDGET)]
        g = d.groupby("m").detected.mean().sort_index()
        ax.plot(g.index, g.values * 100, color=PAL[i], lw=2, marker="o", ms=4, label=SHORT[meth])
    ax.set_xlabel("Extra complaints injected (m)")
    ax.set_title(f"{'Fast (30 min)' if prof == 'fast' else 'Slow (120 min)'} surges, budget {BUDGET}/day",
                 fontsize=10, color=INK)
axes[0].set_ylabel("Surges detected (%)")
axes[0].set_ylim(0, 102)
axes[1].legend(loc="lower right", fontsize=8)
fig.savefig(os.path.join(FIG, "fig2_recall_vs_intensity.png"))
plt.close(fig)

# F3 adversarial
blues = ["#9ec5f4", "#5f9ee8", "#2a78d6", "#14498c"]   # one hue, light -> dark = more fakes
fig, ax = plt.subplots(figsize=(4.8, 3.4))
g = adv.groupby(["m_fake", "gate_recall"])["success_prod"].mean().unstack(0)
for i, mf in enumerate(g.columns):
    ax.plot(g.index * 100, g[mf] * 100, color=blues[i], lw=2, marker="o", ms=4, label=f"{mf} fake complaints")
ax.set_xlabel("Credibility-gate recall on fake complaints (%)")
ax.set_ylabel("Attacks that trigger a surge (%)")
ax.set_ylim(0, 102)
ax.legend(fontsize=8)
ax.set_title("Fake-flood attacks vs the credibility gate", fontsize=10, color=INK)
fig.savefig(os.path.join(FIG, "fig3_adversarial.png"))
plt.close(fig)
print(open(os.path.join(RES, "RESULTS.md")).read())
