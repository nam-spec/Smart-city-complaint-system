"""
STSEP - Step 2: Spatial Density
BallTree haversine approach with radius sensitivity analysis.
Selected radius maximises coefficient of variation (most discriminative).
"""

import pandas as pd
import numpy as np
from sklearn.neighbors import BallTree
import time

# ─────────────────────────────────────────────
# Load
# ─────────────────────────────────────────────
df = pd.read_csv("../data/complaints_with_severity.csv")
print("Loaded:", len(df))

df["lat_rounded"] = df["lat"].round(4)
df["lon_rounded"] = df["lon"].round(4)

unique_locations = df[["lat_rounded", "lon_rounded"]].drop_duplicates()
print("Unique locations:", len(unique_locations))

coords_rad = np.radians(unique_locations[["lat_rounded", "lon_rounded"]].values)

# ─────────────────────────────────────────────
# Build BallTree once
# ─────────────────────────────────────────────
tree = BallTree(coords_rad, metric="haversine")

# ─────────────────────────────────────────────
# Radius sensitivity analysis
# Select radius that maximises coefficient of variation
# ─────────────────────────────────────────────
EARTH_R   = 6371.0
radii_km  = [0.25, 0.5, 0.75, 1.0]

print("\nRadius sensitivity analysis:")
best_r, best_cv = 0.5, -1

for r_km in radii_km:
    r_rad  = r_km / EARTH_R
    idx    = tree.query_radius(coords_rad, r=r_rad)
    counts = np.array([len(i) for i in idx], dtype=float)
    cv     = counts.std() / counts.mean()
    print(f"  r={r_km:.2f} km  →  mean={counts.mean():.1f}  CV={cv:.3f}")
    if cv > best_cv:
        best_cv, best_r = cv, r_km

print(f"\nSelected radius: {best_r} km  (highest CV = {best_cv:.3f})")

# ─────────────────────────────────────────────
# Final density at chosen radius
# ─────────────────────────────────────────────
r_rad = best_r / EARTH_R
t0    = time.time()
indices = tree.query_radius(coords_rad, r=r_rad)
print("Query time:", round(time.time() - t0, 2), "s")

unique_locations = unique_locations.copy()
unique_locations["spatial_density"] = [len(i) for i in indices]

df = df.merge(unique_locations, on=["lat_rounded", "lon_rounded"], how="left")

print("\nSpatial density stats:")
print(df["spatial_density"].describe())

df.to_csv("../data/complaints_with_density.csv", index=False)
print("Saved → complaints_with_density.csv")