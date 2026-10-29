"""Core data structures and detectors for the surge-detection evaluation.

Everything is computed on a dense (H3 cell x 5-minute bin) count grid per category.
Detectors produce a score for every (centre cell, bin); an alarm is raised where the
score >= threshold. Alarms are merged into *episodes* (same category, centre within the
2-ring of the episode centre, gap <= 60 min) - this mirrors how the live system attaches
new complaints to an already-active surge instead of raising a new one.
"""
import os
import numpy as np
import pandas as pd
from scipy import sparse
from scipy.stats import poisson

BIN_MIN = 5
BINS_PER_HOUR = 60 // BIN_MIN
BINS_PER_DAY = 24 * BINS_PER_HOUR

# NYC 311 complaint types -> the categories used by the complaint system
CATEGORY_MAP = {
    "water": ["HEAT/HOT WATER", "Water System", "WATER LEAK", "PLUMBING", "Plumbing", "Water Conservation",
              "Water Quality", "Non-Residential Heat", "Boilers"],
    "traffic": ["Illegal Parking", "Blocked Driveway", "Abandoned Vehicle", "Derelict Vehicles",
                "Traffic Signal Condition", "Traffic", "For Hire Vehicle Complaint", "Taxi Complaint",
                "Broken Parking Meter"],
    "sanitation": ["Request Large Bulky Item Collection", "Missed Collection", "Dirty Condition", "Illegal Dumping",
                   "Rodent", "Dead Animal", "Residential Disposal Complaint", "Litter Basket Request",
                   "Street Sweeping Complaint", "Sanitation Worker or Vehicle Complaint", "Dumpster Complaint",
                   "Electronics Waste Appointment"],
    "road": ["Street Condition", "Sidewalk Condition", "Snow or Ice", "Curb Condition",
             "Root/Sewer/Sidewalk Condition", "Street Sign - Dangling", "Street Sign - Damaged",
             "Street Sign - Missing"],
    "housing": ["UNSANITARY CONDITION", "PAINT/PLASTER", "DOOR/WINDOW", "GENERAL", "General Construction/Plumbing",
                "FLOORING/STAIRS", "APPLIANCE", "Building/Use", "Elevator", "ELEVATOR", "SAFETY", "Lead"],
    "electric": ["Street Light Condition", "ELECTRIC", "Electrical"],
    "drainage": ["Sewer"],
    "environment": ["Damaged Tree", "New Tree Request", "Overgrown Tree/Branches", "Dead/Dying Tree",
                    "Illegal Tree Damage"],
    "pollution": ["Air Quality", "Indoor Air Quality", "Smoking", "Hazardous Materials"],
    "public_safety": ["Non-Emergency Police Matter", "Drug Activity", "Drinking"],
}
TYPE_TO_CAT = {t: c for c, ts in CATEGORY_MAP.items() for t in ts}


def map_category(raw):
    if isinstance(raw, str) and raw.startswith("Noise"):
        return "noise"
    return TYPE_TO_CAT.get(raw, "other")


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------
class Grid:
    """Cells, adjacency (ring 0/1/2), ward (res-6 parent) membership and time bins."""

    def __init__(self, cell_table_path):
        tab = pd.read_csv(cell_table_path)
        self.cells = tab["cell"].tolist()
        self.idx = {c: i for i, c in enumerate(self.cells)}
        n = len(self.cells)
        self.n = n
        self.ward = tab["parent6"].values
        self.ward_ids, self.ward_of = np.unique(self.ward, return_inverse=True)

        def adj(col):
            rows, cols = [], []
            for i, ring in enumerate(tab[col]):
                for c in ring.split("|"):
                    j = self.idx.get(c)
                    if j is not None:
                        rows.append(i)
                        cols.append(j)
            return sparse.csr_matrix((np.ones(len(rows), dtype=np.float32), (rows, cols)), shape=(n, n))

        self.A = {0: sparse.identity(n, dtype=np.float32, format="csr"), 1: adj("ring1"), 2: adj("ring2")}
        # ring-2 membership as python sets (episode merging / detection matching)
        self.ring2 = [set(np.nonzero(self.A[2][i].toarray()[0])[0]) for i in range(n)]
        self.ring1 = [set(np.nonzero(self.A[1][i].toarray()[0])[0]) for i in range(n)]


def load_events(csv_path, row_cells_path, grid, t0):
    df = pd.read_csv(csv_path, usecols=["text", "category", "lat", "lon", "timestamp", "closed_date"])
    with open(row_cells_path) as f:
        df["cell"] = f.read().split("\n")[:len(df)]
    df = df[df["cell"].isin(grid.idx)].copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df["closed"] = pd.to_datetime(df["closed_date"], format="%m/%d/%Y %I:%M:%S %p", errors="coerce")
    df = df.dropna(subset=["timestamp"])
    df["cat"] = df["category"].map(map_category)
    df["ci"] = df["cell"].map(grid.idx).astype(int)
    df["bin"] = ((df["timestamp"] - t0).dt.total_seconds() // (BIN_MIN * 60)).astype(int)
    df["res_hours"] = (df["closed"] - df["timestamp"]).dt.total_seconds() / 3600
    return df


def hour_of_week(bin_idx, t0):
    ts = t0 + pd.to_timedelta(np.asarray(bin_idx) * BIN_MIN, unit="m")
    return (ts.dayofweek * 24 + ts.hour).values


def count_grid(ev, n_cells, n_bins):
    X = np.zeros((n_cells, n_bins), dtype=np.float32)
    np.add.at(X, (ev["ci"].values, ev["bin"].values), 1)
    return X


# ---------------------------------------------------------------------------
# Baselines (expected hourly rate per cell and hour-of-week, learned on training bins)
# ---------------------------------------------------------------------------
def training_counts(X, train_bins, how_of_bin):
    """C[c, h] total training count, T[h] number of training occurrences (weeks) of hour h."""
    n = X.shape[0]
    C = np.zeros((n, 168), dtype=np.float64)
    T = np.zeros(168)
    hours = how_of_bin[:train_bins]
    for h in range(168):
        m = hours == h
        C[:, h] = X[:, :train_bins][:, m].sum(axis=1)
        T[h] = m.sum() / BINS_PER_HOUR
    return C, T


def baseline_raw(C, T, active):
    lam = C / T[None, :]
    return lam


def baseline_city_uniform(C, T, active):
    city = C[active].sum(axis=0) / (active.sum() * T)
    return np.tile(city, (C.shape[0], 1))


def baseline_eb(C, T, active, ward_of, k_ward=20.0, k_cell=4.0):
    """Gamma-Poisson empirical Bayes: cell -> ward (H3 res 6) -> city.
    Prior strength is in pseudo-weeks (cell) / pseudo cell-weeks (ward); zero cells are included."""
    n_ward = ward_of.max() + 1
    city = C[active].sum(axis=0) / (active.sum() * T)                      # per-cell hourly rate
    Cw = np.zeros((n_ward, 168))
    nw = np.zeros(n_ward)
    np.add.at(Cw, ward_of[active], C[active])
    np.add.at(nw, ward_of[active], 1)
    ward = (Cw + k_ward * city[None, :]) / (nw[:, None] * T[None, :] + k_ward)
    prior = ward[ward_of]
    return (C + k_cell * prior) / (T[None, :] + k_cell)


def baseline_deployed(C, T, active, ward_of, k=20.0):
    """Replicates backend getShrunkBaseline(): only non-zero (cell, hour) records exist, raw means
    are averaged over those records, and shrinkage weights are total counts (not exposure)."""
    default = 6.0 / 7
    mean = C / T[None, :]
    has = C > 0
    lam = np.zeros_like(C)
    n_ward = ward_of.max() + 1
    for h in range(168):
        hc = has[:, h]
        if hc.any():
            n_city = C[hc, h].sum()
            city = (n_city * mean[hc, h].mean() + k * default) / (n_city + k)
        else:
            city = default
        wardv = np.full(n_ward, city)
        for w in np.unique(ward_of[hc]):
            m = hc & (ward_of == w)
            nW = C[m, h].sum()
            wardv[w] = (nW * mean[m, h].mean() + k * city) / (nW + k)
        pw = wardv[ward_of]
        lam[:, h] = np.where(hc, (C[:, h] * mean[:, h] + k * pw) / (C[:, h] + k), pw)
    return lam


def baseline_flat(C, T, active, ward_of, **kw):
    """EB baseline without hour-of-week seasonality (one rate per cell)."""
    tot = C.sum(axis=1, keepdims=True)
    lam_eb = baseline_eb(tot.repeat(168, 1) / 168 * 1.0, T, active, ward_of, **kw)
    return lam_eb


# ---------------------------------------------------------------------------
# Window / disc helpers
# ---------------------------------------------------------------------------
def window_sum(M, w):
    """Sliding sum over the last w bins (inclusive) along axis 1."""
    if w == 1:
        return M
    cs = np.cumsum(M, axis=1, dtype=np.float64)
    out = cs.copy()
    out[:, w:] = cs[:, w:] - cs[:, :-w]
    return out.astype(np.float32)


def disc(A, M):
    return np.asarray(A @ M, dtype=np.float32)


def expected_per_bin(lam, how_of_bin):
    """Expected count per 5-min bin for every (cell, bin)."""
    return (lam[:, how_of_bin] / BINS_PER_HOUR).astype(np.float32)


def poisson_score(N, E):
    """-log10 P(X >= N | E); 0 where N == 0."""
    S = np.zeros_like(N, dtype=np.float32)
    m = N >= 1
    p = poisson.sf(N[m] - 1, np.maximum(E[m], 1e-6))
    S[m] = -np.log10(np.maximum(p, 1e-300))
    return S


def scan_score(X, E1, grid, radii=(0, 1, 2), windows=(1, 2, 4, 6, 12), lo=0, hi=None):
    """Prospective space-time scan (Kulldorff Poisson LLR, excess only), max over cylinders
    ending at each bin: radius in H3 rings, duration in bins."""
    best = None
    for r in radii:
        Xr = disc(grid.A[r], X)
        Er = disc(grid.A[r], E1)
        for w in windows:
            N = window_sum(Xr, w)[:, lo:hi]
            E = np.maximum(window_sum(Er, w)[:, lo:hi], 1e-6)
            llr = np.where(N > E, N * np.log(np.maximum(N, 1e-9) / E) - (N - E), 0).astype(np.float32)
            best = llr if best is None else np.maximum(best, llr)
    return best


def cusum_score(D1, E1, rho=2.0):
    """Poisson CUSUM tuned to detect a rate multiplied by rho."""
    S = np.zeros(D1.shape[0], dtype=np.float32)
    out = np.zeros_like(D1)
    lr = np.log(rho)
    for t in range(D1.shape[1]):
        S = np.maximum(0, S + D1[:, t] * lr - E1[:, t] * (rho - 1))
        out[:, t] = S
    return out


def ewma_score(D1, E1, lam=0.2):
    z = np.zeros(D1.shape[0], dtype=np.float32)
    out = np.zeros_like(D1)
    sd = np.sqrt(lam / (2 - lam))
    for t in range(D1.shape[1]):
        e = np.maximum(E1[:, t], 1e-3)
        r = (D1[:, t] - e) / np.sqrt(e)
        z = lam * r + (1 - lam) * z
        out[:, t] = z / sd
    return out


# ---------------------------------------------------------------------------
# Alarms -> episodes, calibration, detection matching
# ---------------------------------------------------------------------------
def alarms_from_scores(S, thr):
    c, t = np.nonzero(S >= thr)
    order = np.argsort(t, kind="stable")
    return c[order], t[order]


def episodes(cells, bins, grid, gap_bins=12):
    """Merge alarms into episodes. Returns list of (centre_cell, first_bin, last_bin, n_alarms)."""
    eps = []          # [centre, first, last, n]
    active = []       # indexes into eps
    for c, t in zip(cells, bins):
        active = [i for i in active if t - eps[i][2] <= gap_bins]
        hit = None
        for i in active:
            if c in grid.ring2[eps[i][0]]:
                hit = i
                break
        if hit is None:
            eps.append([c, t, t, 1])
            active.append(len(eps) - 1)
        else:
            eps[hit][2] = t
            eps[hit][3] += 1
    return eps


def far_per_day(S, thr, grid, n_bins):
    c, t = alarms_from_scores(S, thr)
    if len(c) > 200000:
        return np.inf
    return len(episodes(c, t, grid)) / (n_bins / BINS_PER_DAY)


def calibrate(S_list, target_far, grid, n_bins, lo=None, hi=None, iters=22):
    """Threshold giving `target_far` episodes/day summed over all categories (bisection)."""
    vals = np.concatenate([s[s > 0].ravel() for s in S_list])
    if lo is None:
        lo = float(np.quantile(vals, 0.5)) if len(vals) else 0.0
    if hi is None:
        hi = float(vals.max()) + 1e-6 if len(vals) else 1.0

    def far(th):
        tot = 0.0
        for s in S_list:
            f = far_per_day(s, th, grid, n_bins)
            if not np.isfinite(f):
                return np.inf
            tot += f
        return tot

    a, b = lo, hi
    # make sure the lower end is permissive enough
    while far(a) < target_far and a > 1e-6:
        a = a / 2
    for _ in range(iters):
        m = (a + b) / 2
        if far(m) > target_far:
            a = m
        else:
            b = m
    return b, far(b)
