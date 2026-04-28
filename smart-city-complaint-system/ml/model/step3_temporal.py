"""
STSEP - Step 3: Temporal Density + Growth Rate
Window-size sensitivity analysis to justify 10-min window.
Minimum-count guard before saving.
"""

import pandas as pd
import numpy as np

# ─────────────────────────────────────────────
# Load
# ─────────────────────────────────────────────
df = pd.read_csv("../data/complaints_with_density.csv")
df["timestamp"] = pd.to_datetime(df["timestamp"])
print("Loaded:", len(df))

# ─────────────────────────────────────────────
# Window-size sensitivity analysis
# Select window maximising SNR of growth-rate signal
# ─────────────────────────────────────────────
WINDOWS = ["5T", "10T", "15T", "20T", "30T"]

print("\nWindow sensitivity analysis:")
best_w, best_snr = "10T", -1

for w in WINDOWS:
    tmp        = df.copy()
    tmp["tw"]  = tmp["timestamp"].dt.floor(w)
    wdf        = tmp.groupby("tw").size().reset_index(name="lam")
    wdf["prev"] = wdf["lam"].shift(1)
    wdf["gr"]   = np.log((wdf["lam"] + 1) / (wdf["prev"] + 1)).fillna(0)
    wdf.loc[wdf["prev"] < 5, "gr"] = 0
    snr = wdf["gr"].std() / (wdf["gr"].abs().mean() + 1e-9)
    print(f"  window={w:<4}  windows={len(wdf):>4}  "
          f"gr_std={wdf['gr'].std():.4f}  SNR={snr:.3f}")
    if snr > best_snr:
        best_snr, best_w = snr, w

print(f"\nSelected window: {best_w}  (highest SNR = {best_snr:.3f})")

# ─────────────────────────────────────────────
# Compute with chosen window
# ─────────────────────────────────────────────
df["time_window"] = df["timestamp"].dt.floor(best_w)

window_counts = df.groupby("time_window").size().reset_index(name="lambda_t")

window_counts["lambda_prev"] = window_counts["lambda_t"].shift(1)
window_counts["growth_rate"] = np.log(
    (window_counts["lambda_t"] + 1) /
    (window_counts["lambda_prev"] + 1)
).fillna(0)

# Suppress noise from tiny windows
window_counts.loc[window_counts["lambda_prev"] < 5, "growth_rate"] = 0

df = df.merge(
    window_counts[["time_window", "lambda_t", "growth_rate"]],
    on="time_window", how="left"
)
df.rename(columns={"lambda_t": "temporal_density"}, inplace=True)

print("\nGrowth rate stats:")
print(df["growth_rate"].describe())

df.to_csv("../data/complaints_with_growth.csv", index=False)
print("Saved → complaints_with_growth.csv")