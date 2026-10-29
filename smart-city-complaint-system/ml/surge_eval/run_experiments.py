"""Surge-detection evaluation on NYC 311 data (Jan-Mar 2022, 745k complaints).

Experiments
  E1  Semi-synthetic injection: known surges are added to REAL test-period data; every detector
      is calibrated to the SAME false-alarm rate on a separate calibration period, then recall
      and detection delay are compared (no circular ground truth).
  E2  Ablations of the proposed detector (baseline type, neighbourhood radius, window, prior strength).
  E3  Adversarial fake-complaint floods with and without the credibility (fake-image) gate.
  E4  Real-data validation of detected surges (no injection): same-incident text homogeneity,
      resolution time, case studies. None of these signals is used by the detector.

Split: train (baselines) 1 Jan - 28 Feb | calibration (thresholds) 1-10 Mar | test 11-31 Mar.
Run:  python run_experiments.py   (writes results/ and figures/)
"""
import json
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from surge_core import (BINS_PER_DAY, BIN_MIN, Grid, baseline_city_uniform, baseline_deployed, baseline_eb,  # noqa
                        baseline_flat, baseline_raw, calibrate, count_grid, cusum_score, disc, episodes,
                        ewma_score, expected_per_bin, hour_of_week, load_events, poisson_score, scan_score,
                        training_counts, window_sum, alarms_from_scores)

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get("COMPLAINTS_CSV", os.path.join(HERE, "..", "data", "complaints_clean.csv"))
CACHE = os.path.join(HERE, "cache")
OUT = os.path.join(HERE, "results")
os.makedirs(OUT, exist_ok=True)
QUICK = os.environ.get("QUICK") == "1"

T0 = pd.Timestamp("2022-01-01")
N_BINS = 90 * BINS_PER_DAY
TRAIN_END = 59 * BINS_PER_DAY            # 1 Jan - 28 Feb
CAL_END = 69 * BINS_PER_DAY              # 1 - 10 Mar
LOOK = BINS_PER_DAY                      # look-back bins for windows / EWMA / CUSUM warm-up
SEG0 = TRAIN_END - LOOK                  # scored segment starts here
CAL = (LOOK, LOOK + (CAL_END - TRAIN_END))          # indexes inside the segment
TEST = (CAL[1], N_BINS - SEG0)
FAR_TARGETS = [5, 10, 25, 50, 100]      # alarm episodes per day, city-wide, all categories
SEEDS = [11, 22, 33] if not QUICK else [11]
INTENSITIES = [5, 10, 15, 25] if not QUICK else [10, 25]
PROFILES = {"fast": 6, "slow": 24} if not QUICK else {"fast": 6}   # duration in bins (30 / 120 min)
SURGES_PER_CAT = 8

METHODS = ["proposed", "proposed_mw", "deployed", "poisson_raw", "poisson_city", "count", "ewma", "cusum", "scan"]
ABLATIONS = ["abl_radius0", "abl_radius2", "abl_window5", "abl_window30", "abl_window60",
             "abl_no_seasonality", "abl_k1", "abl_k16"]
LABELS = {
    "proposed": "Proposed: EB-Poisson, H3 ring-1, 10 min",
    "proposed_mw": "Proposed multi-scale: EB-Poisson, max over 10/30/60 min (Bonferroni)",
    "deployed": "Deployed heuristic shrinkage (v1 backend)",
    "poisson_raw": "Poisson, raw cell baseline (no shrinkage)",
    "poisson_city": "Poisson, city-uniform baseline",
    "count": "Fixed count threshold (ring-1, 10 min)",
    "ewma": "EWMA of standardised residuals",
    "cusum": "Poisson CUSUM (rho=2)",
    "scan": "Prospective space-time scan (Kulldorff LLR)",
    "abl_radius0": "Ablation: single cell (radius 0)",
    "abl_radius2": "Ablation: radius 2 (19 cells)",
    "abl_window5": "Ablation: 5-min window",
    "abl_window30": "Ablation: 30-min window",
    "abl_window60": "Ablation: 60-min window",
    "abl_no_seasonality": "Ablation: no hour-of-week seasonality",
    "abl_k1": "Ablation: weak prior (k=1 week)",
    "abl_k16": "Ablation: strong prior (k=16 weeks)",
}


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


# ---------------------------------------------------------------------------
class _LazyE1:
    """Expected count per (cell, bin) computed on demand from the hourly rates (saves memory)."""

    def __init__(self, model):
        self.m = model

    def __getitem__(self, key):
        return expected_per_bin(self.m.lam[key], self.m.how_seg)


class CategoryModel:
    """Baselines and scoring for one category."""

    def __init__(self, cat, X, grid, how, active):
        self.cat, self.grid = cat, grid
        self.X = X
        C, T = training_counts(X, TRAIN_END, how)
        wo = grid.ward_of
        self.lam = {
            "eb": baseline_eb(C, T, active, wo),
            "raw": baseline_raw(C, T, active),
            "city": baseline_city_uniform(C, T, active),
            "deployed": baseline_deployed(C, T, active, wo),
            "flat": baseline_flat(C, T, active, wo),
            "k1": baseline_eb(C, T, active, wo, k_cell=1.0),
            "k16": baseline_eb(C, T, active, wo, k_cell=16.0),
        }
        self.how_seg = how[SEG0:N_BINS]
        self.Xseg = X[:, SEG0:N_BINS].copy()      # keep only the scored segment (memory)
        self.X = None
        self.E1 = _LazyE1(self)

    def seg(self, X=None):
        return self.Xseg if X is None else X[:, SEG0:N_BINS]

    def poisson(self, Xs, base="eb", r=1, w=2, floor=1e-4, min_count=0):
        A = self.grid.A[r]
        N = window_sum(disc(A, Xs), w)
        E = np.maximum(window_sum(disc(A, self.E1[base]), w), floor)
        S = poisson_score(N, E)
        if min_count:
            S = np.where(N >= min_count, S, 0)
        return S, N, E

    def score(self, method, Xs):
        g = self.grid
        if method == "proposed":
            return self.poisson(Xs)[0]
        if method == "proposed_mw":
            # pre-specified windows 10 / 30 / 60 min, Bonferroni-corrected minimum p-value
            S = np.maximum.reduce([self.poisson(Xs, w=w)[0] for w in (2, 6, 12)])
            return np.maximum(S - np.log10(3), 0)
        if method == "deployed":
            return self.poisson(Xs, base="deployed", floor=0.1)[0]
        if method == "poisson_raw":
            return self.poisson(Xs, base="raw", floor=1e-3)[0]
        if method == "poisson_city":
            return self.poisson(Xs, base="city")[0]
        if method == "count":
            return window_sum(disc(g.A[1], Xs), 2)
        if method == "ewma":
            return ewma_score(disc(g.A[1], Xs), disc(g.A[1], self.E1["eb"]))
        if method == "cusum":
            return cusum_score(disc(g.A[1], Xs), disc(g.A[1], self.E1["eb"]))
        if method == "scan":
            return scan_score(Xs, self.E1["eb"], g)
        if method == "abl_radius0":
            return self.poisson(Xs, r=0)[0]
        if method == "abl_radius2":
            return self.poisson(Xs, r=2)[0]
        if method == "abl_window5":
            return self.poisson(Xs, w=1)[0]
        if method == "abl_window30":
            return self.poisson(Xs, w=6)[0]
        if method == "abl_window60":
            return self.poisson(Xs, w=12)[0]
        if method == "abl_no_seasonality":
            return self.poisson(Xs, base="flat")[0]
        if method == "abl_k1":
            return self.poisson(Xs, base="k1")[0]
        if method == "abl_k16":
            return self.poisson(Xs, base="k16")[0]
        raise ValueError(method)


def part(S, rng):
    return S[:, rng[0]:rng[1]]


# ---------------------------------------------------------------------------
def make_surges(rng, cats, grid, active_cells, intensity, dur, seed_shift=0):
    """SURGES_PER_CAT surges per category in the test period, >= 12 h apart within a category."""
    surges = []
    lo, hi = TEST[0] + 12, TEST[1] - dur - 4
    for cat in cats:
        starts = []
        while len(starts) < SURGES_PER_CAT:
            t = int(rng.integers(lo, hi))
            if all(abs(t - s) > 144 for s in starts):
                starts.append(t)
        for t in starts:
            centre = int(rng.choice(active_cells[cat]))
            ring = list(grid.ring1[centre])
            times = np.sort(rng.integers(t, t + dur, size=intensity))
            times[0] = t
            cells = [centre if rng.random() < 0.5 else int(rng.choice(ring)) for _ in range(intensity)]
            surges.append({"cat": cat, "centre": centre, "onset": t, "dur": dur,
                           "m": intensity, "times": times.tolist(), "cells": cells})
    return surges


def inject(Xs, surges):
    Y = Xs.copy()
    for s in surges:
        for c, t in zip(s["cells"], s["times"]):
            Y[c, t] += 1
    return Y


def detect(S, thr, s, grid):
    lo, hi = s["onset"], s["onset"] + s["dur"] + 3
    ring = np.array(sorted(grid.ring2[s["centre"]]))
    sub = S[ring, lo:hi] >= thr
    hit_bins = np.nonzero(sub.any(axis=0))[0]
    if len(hit_bins) == 0:
        return False, None
    return True, (hit_bins[0] + 1) * BIN_MIN       # minutes from onset to end of first alarming bin


# ---------------------------------------------------------------------------
def main():
    t_start = time.time()
    grid = Grid(os.path.join(CACHE, "h3_cell_table.csv"))
    log("loading events ...")
    ev = load_events(DATA, os.path.join(CACHE, "h3_row_cells.txt"), grid, T0)
    ev = ev[(ev["bin"] >= 0) & (ev["bin"] < N_BINS)]
    how = hour_of_week(np.arange(N_BINS), T0)
    active = np.zeros(grid.n, dtype=bool)
    active[ev["ci"].unique()] = True
    cats = [c for c in ev["cat"].value_counts().index if c != "other"]
    if QUICK:
        cats = cats[:4]
    log(f"{len(ev):,} complaints, {grid.n} H3 cells, categories: {cats}")

    models, active_cells = {}, {}
    for cat in cats:
        sub = ev[ev["cat"] == cat]
        X = count_grid(sub, grid.n, N_BINS)
        models[cat] = CategoryModel(cat, X, grid, how, active)
        cnt = np.bincount(sub[sub["bin"] < TRAIN_END]["ci"], minlength=grid.n)
        # surge centres: cells with some activity in this category (weighted uniformly)
        active_cells[cat] = np.nonzero(cnt >= 3)[0]
    log("baselines ready")

    all_methods = METHODS + ABLATIONS
    n_cal = CAL[1] - CAL[0]
    n_test = TEST[1] - TEST[0]

    # ---- calibration on real data (no injection) --------------------------------------------
    thresholds, far_test = {}, {}
    for m in all_methods:
        # scores for one method at a time (all methods together do not fit in memory)
        sc = {cat: models[cat].score(m, models[cat].seg()) for cat in cats}
        cal_parts = [part(sc[c], CAL).copy() for c in cats]
        test_parts = [part(sc[c], TEST).copy() for c in cats]
        del sc
        thresholds[m], far_test[m] = {}, {}
        for target in FAR_TARGETS:
            thr, far_cal = calibrate(cal_parts, target, grid, n_cal)
            ft = sum(len(episodes(*alarms_from_scores(tp, thr), grid)) for tp in test_parts) / (n_test / BINS_PER_DAY)
            thresholds[m][target] = thr
            far_test[m][target] = ft
        del cal_parts, test_parts
        log(f"calibrated {m}: " + ", ".join(f"{t}/d->thr {thresholds[m][t]:.3g} (test {far_test[m][t]:.2f}/d)"
                                            for t in FAR_TARGETS))

    # production operating point: p < 0.01 and N >= 5 (distinct-user rule not applicable: no user IDs)
    prod = {}
    for name, base, floor in [("proposed", "eb", 1e-4), ("deployed", "deployed", 0.1)]:
        S = {cat: models[cat].poisson(models[cat].seg(), base=base, floor=floor, min_count=5)[0] for cat in cats}
        ft = sum(len(episodes(*alarms_from_scores(part(S[c], TEST), 2.0), grid)) for c in cats) / (n_test / BINS_PER_DAY)
        prod[name] = {"far_test_per_day": ft}
    log(f"production operating point FAR/day: {prod}")

    # ---- E1/E2: injection ------------------------------------------------------------------------
    rows = []
    for profile, dur in PROFILES.items():
        for m_int in INTENSITIES:
            for seed in SEEDS:
                rng = np.random.default_rng(seed * 1000 + m_int * 10 + dur)
                surges = make_surges(rng, cats, grid, active_cells, m_int, dur)
                by_cat = {}
                for s in surges:
                    by_cat.setdefault(s["cat"], []).append(s)
                for cat in cats:
                    mod = models[cat]
                    Xs = inject(mod.seg(), by_cat[cat])
                    for meth in all_methods:
                        S = mod.score(meth, Xs)
                        for target in FAR_TARGETS:
                            thr = thresholds[meth][target]
                            for s in by_cat[cat]:
                                hit, delay = detect(S, thr, s, grid)
                                rows.append({"profile": profile, "m": m_int, "seed": seed, "cat": cat,
                                             "method": meth, "far": target, "detected": hit, "delay": delay,
                                             "surge_id": f"{profile}-{m_int}-{seed}-{cat}-{s['onset']}-{s['centre']}"})
                    for name, base, floor in [("proposed", "eb", 1e-4), ("deployed", "deployed", 0.1)]:
                        S = mod.poisson(Xs, base=base, floor=floor, min_count=5)[0]
                        for s in by_cat[cat]:
                            hit, delay = detect(S, 2.0, s, grid)
                            rows.append({"profile": profile, "m": m_int, "seed": seed, "cat": cat,
                                         "method": f"prod_{name}", "far": -1, "detected": hit, "delay": delay,
                                         "surge_id": f"{profile}-{m_int}-{seed}-{cat}-{s['onset']}-{s['centre']}"})
                log(f"injection {profile} m={m_int} seed={seed} done ({len(rows):,} rows)")
    inj = pd.DataFrame(rows)
    inj.to_csv(os.path.join(OUT, "injection_detections.csv"), index=False)

    # ---- E3: adversarial floods ------------------------------------------------------------------
    adv_rows = []
    rng = np.random.default_rng(7)
    thr1 = thresholds["proposed"][25]
    for cat in cats:
        mod = models[cat]
        Xs = mod.seg()
        A1 = grid.A[1]
        for m_fake in [5, 10, 15, 25]:
            for gate in [0.0, 0.5, 0.8, 0.9, 0.95]:
                for _ in range(40 if not QUICK else 10):
                    t = int(rng.integers(TEST[0] + 12, TEST[1] - 4))
                    centre = int(rng.choice(active_cells[cat]))
                    kept = int(rng.binomial(m_fake, 1 - gate))
                    # local re-scoring: only discs that contain the centre cell change
                    times = rng.integers(t, t + 2, size=kept)
                    lo, hi = t - 2, t + 4
                    Y = Xs[:, lo - 2:hi].copy()
                    for tt in times:
                        Y[centre, tt - (lo - 2)] += 1
                    E1 = mod.E1["eb"][:, lo - 2:hi]
                    N = window_sum(np.asarray(A1 @ Y), 2)[:, 2:]
                    E = np.maximum(window_sum(np.asarray(A1 @ E1), 2)[:, 2:], 1e-4)
                    S = poisson_score(N, E)
                    ring = sorted(grid.ring1[centre])
                    ok_prod = bool(((S[ring] >= 2.0) & (N[ring] >= 5)).any())
                    ok_far1 = bool((S[ring] >= thr1).any())
                    adv_rows.append({"cat": cat, "m_fake": m_fake, "gate_recall": gate,
                                     "success_prod": ok_prod, "success_far25": ok_far1})
    adv = pd.DataFrame(adv_rows)
    adv.to_csv(os.path.join(OUT, "adversarial_floods.csv"), index=False)
    log("adversarial done")

    # collateral: genuine surges when the gate wrongly removes a fraction f of genuine complaints
    col_rows = []
    for f in [0.0, 0.05, 0.1, 0.2]:
        rng = np.random.default_rng(99)
        surges = make_surges(rng, cats, grid, active_cells, 15, PROFILES["fast"])
        for cat in cats:
            mod = models[cat]
            keep = [dict(s) for s in surges if s["cat"] == cat]
            for s in keep:
                mask = rng.random(len(s["times"])) >= f
                s["times"] = [t for t, k in zip(s["times"], mask) if k]
                s["cells"] = [c for c, k in zip(s["cells"], mask) if k]
            Xs = mod.seg()
            Xs = rng.binomial(Xs.astype(np.int64), 1 - f).astype(np.float32) if f > 0 else Xs
            Xs = inject(Xs, keep)
            S = mod.poisson(Xs)[0]
            for s in keep:
                col_rows.append({"gate_fp_rate": f, "cat": cat,
                                 "detected": detect(S, thresholds["proposed"][25], s, grid)[0]})
    col = pd.DataFrame(col_rows)
    col.to_csv(os.path.join(OUT, "gate_collateral.csv"), index=False)
    log("collateral done")

    # ---- E4: real-data validation (no injection) --------------------------------------------------
    target = 25
    thr = thresholds["proposed"][target]
    ep_rows, member_ids = [], set()
    for cat in cats:
        mod = models[cat]
        S, N, E = mod.poisson(mod.seg())
        St = part(S, TEST)
        c_idx, t_idx = alarms_from_scores(St, thr)
        eps = episodes(c_idx, t_idx, grid)
        sub = ev[(ev["cat"] == cat)]
        for e in eps:
            centre, first, last, n_al = e
            b0 = SEG0 + TEST[0] + first - 2
            b1 = SEG0 + TEST[0] + last
            cells = grid.ring2[centre]
            mem = sub[(sub["bin"] >= b0) & (sub["bin"] <= b1) & (sub["ci"].isin(cells))]
            if len(mem) < 2:
                continue
            peak = float(St[:, first:last + 1][list(cells)].max())
            tvc = mem["text"].value_counts(normalize=True)
            simpson = float((tvc ** 2).sum())
            member_ids.update(mem.index.tolist())
            day = (mem["bin"].iloc[0] // BINS_PER_DAY)
            ep_rows.append({"cat": cat, "start": (T0 + pd.Timedelta(minutes=int(b0) * BIN_MIN)).strftime("%Y-%m-%d %H:%M"),
                            "minutes": int((last - first + 3) * BIN_MIN), "n_complaints": len(mem),
                            "peak_score": round(peak, 2), "lat": round(mem["lat"].mean(), 5),
                            "lon": round(mem["lon"].mean(), 5), "top_descriptor": tvc.index[0],
                            "top_share": round(float(tvc.iloc[0]), 3), "simpson": simpson,
                            "median_res_hours": float(mem["res_hours"].clip(lower=0).median()),
                            "day": int(day), "member_index": mem.index.tolist()})
    epi = pd.DataFrame(ep_rows)
    # matched random groups: same category, same day, same size, complaints outside episodes
    rng = np.random.default_rng(5)
    rand_simpson, rand_res = [], []
    pool = ev[~ev.index.isin(member_ids)]
    pool_by = {k: g for k, g in pool.groupby(["cat", pool["bin"] // BINS_PER_DAY])}
    for _, e in epi.iterrows():
        g = pool_by.get((e["cat"], e["day"]))
        if g is None or len(g) < e["n_complaints"]:
            rand_simpson.append(np.nan)
            rand_res.append(np.nan)
            continue
        vals_s, vals_r = [], []
        for _ in range(50):
            smp = g.sample(int(e["n_complaints"]), random_state=int(rng.integers(1e9)))
            vals_s.append(float((smp["text"].value_counts(normalize=True) ** 2).sum()))
            vals_r.append(float(smp["res_hours"].clip(lower=0).median()))
        rand_simpson.append(np.mean(vals_s))
        rand_res.append(np.median(vals_r))
    epi["random_simpson"] = rand_simpson
    epi["random_median_res_hours"] = rand_res
    epi.drop(columns=["member_index"]).to_csv(os.path.join(OUT, "real_episodes.csv"), index=False)
    log(f"real-data episodes: {len(epi)}")

    meta = {"thresholds": thresholds, "far_test": far_test, "production_point": prod,
            "categories": cats, "n_complaints": int(len(ev)), "n_cells": int(grid.n),
            "split": {"train": "2022-01-01..2022-02-28", "calibration": "2022-03-01..2022-03-10",
                      "test": "2022-03-11..2022-03-31"},
            "seeds": SEEDS, "intensities": INTENSITIES, "profiles": PROFILES,
            "surges_per_category_per_run": SURGES_PER_CAT, "labels": LABELS,
            "runtime_min": round((time.time() - t_start) / 60, 1)}
    with open(os.path.join(OUT, "meta.json"), "w") as f:
        json.dump(meta, f, indent=1, default=float)
    log(f"done in {meta['runtime_min']} min")


if __name__ == "__main__":
    main()
