import pandas as pd
import numpy as np
from sklearn.neighbors import BallTree
import time

# -----------------------------
# Load dataset
# -----------------------------
df = pd.read_csv("../data/complaints_with_severity.csv")

print("Dataset loaded")
print("Total complaints:", len(df))

# -----------------------------
# Step 1: Round coordinates (reduce duplicates)
# -----------------------------
df["lat_rounded"] = df["lat"].round(4)
df["lon_rounded"] = df["lon"].round(4)

# -----------------------------
# Step 2: Get unique locations
# -----------------------------
unique_locations = df[["lat_rounded", "lon_rounded"]].drop_duplicates()

print("\nUnique locations:", len(unique_locations))

# -----------------------------
# Step 3: Prepare coordinates
# -----------------------------
coords_unique = unique_locations[["lat_rounded", "lon_rounded"]].values
coords_rad = np.radians(coords_unique)

# -----------------------------
# Step 4: Build BallTree
# -----------------------------
print("\nBuilding BallTree...")
start = time.time()

tree = BallTree(coords_rad, metric="haversine")

end = time.time()
print("BallTree built in:", round(end - start, 2), "seconds")

# -----------------------------
# Step 5: Define radius (500 meters)
# -----------------------------
earth_radius = 6371  # km
radius_km = 0.5
radius = radius_km / earth_radius

print("\nQuerying neighbors...")

start = time.time()

# -----------------------------
# Step 6: Query neighbors
# -----------------------------
indices = tree.query_radius(coords_rad, r=radius)

end = time.time()
print("Query time:", round(end - start, 2), "seconds")

# -----------------------------
# Step 7: Compute spatial density (ON UNIQUE LOCATIONS)
# -----------------------------
unique_locations["spatial_density"] = [len(i) for i in indices]

# -----------------------------
# Step 8: Merge back to original dataset
# -----------------------------
df = df.merge(unique_locations, on=["lat_rounded", "lon_rounded"], how="left")

# -----------------------------
# Step 9: Validation
# -----------------------------
print("\nSpatial density stats:")
print(df["spatial_density"].describe())

print("\nTop 5 dense points:")
print(df.sort_values("spatial_density", ascending=False)[
    ["lat", "lon", "category_clean", "spatial_density"]
].head())

# -----------------------------
# (Optional) Save output
# -----------------------------
df.to_csv("../data/complaints_with_density.csv", index=False)

print("\nDataset with spatial density saved!")