"""
STSEP - Step 4: Acceleration (Surge Signal)
acceleration = Δgrowth_rate (first difference of log growth).
Exports window-level stats for paper figures.
"""

import pandas as pd
import numpy as np

# ─────────────────────────────────────────────
# Load
# ─────────────────────────────────────────────
df = pd.read_csv("../data/complaints_with_growth.csv")
df["timestamp"] = pd.to_datetime(df["timestamp"])
print("Loaded:", len(df))

# ─────────────────────────────────────────────
# Window-level table (one row per window)
# ─────────────────────────────────────────────
window_df = (
    df[["time_window", "growth_rate"]]
    .drop_duplicates()
    .sort_values("time_window")
    .reset_index(drop=True)
)

window_df["growth_prev"]  = window_df["growth_rate"].shift(1)
window_df["acceleration"] = (
    window_df["growth_rate"] - window_df["growth_prev"]
).fillna(0)

# ─────────────────────────────────────────────
# Merge back
# ─────────────────────────────────────────────
df = df.merge(
    window_df[["time_window", "acceleration"]],
    on="time_window", how="left"
)

print("\nAcceleration stats:")
print(df["acceleration"].describe())

print("\nTop 5 SURGE windows:")
print(window_df.sort_values("acceleration", ascending=False).head())

print("\nTop 5 DROP windows:")
print(window_df.sort_values("acceleration").head())

# Export window-level data for paper figures
window_df.to_csv("../data/window_level_stats.csv", index=False)

df.to_csv("../data/complaints_with_acceleration.csv", index=False)
print("Saved → complaints_with_acceleration.csv")