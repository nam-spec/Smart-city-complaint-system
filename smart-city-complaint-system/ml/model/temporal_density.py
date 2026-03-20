import pandas as pd
import time

# -----------------------------
# Load dataset
# -----------------------------
df = pd.read_csv("../data/complaints_with_density.csv")

print("Dataset loaded:", len(df))

# -----------------------------
# Step 1: Convert timestamp
# -----------------------------
df["timestamp"] = pd.to_datetime(df["timestamp"])

# VERY IMPORTANT: sort by time
df = df.sort_values("timestamp").reset_index(drop=True)

print("\nSorted by timestamp")

# -----------------------------
# Step 2: Convert to Unix time
# -----------------------------
df["timestamp_unix"] = df["timestamp"].astype("int64") // 10**9

# -----------------------------
# Step 3: Define window
# -----------------------------
window_minutes = 10
window_seconds = window_minutes * 60

print(f"\nWindow size: {window_minutes} minutes")

# -----------------------------
# Step 4: Sliding window
# -----------------------------
timestamps = df["timestamp_unix"].values

counts = []
left = 0

print("\nComputing temporal density...")
start = time.time()

for right in range(len(timestamps)):
    
    while timestamps[right] - timestamps[left] > window_seconds:
        left += 1
        
    counts.append(right - left + 1)

end = time.time()

print("Computation time:", round(end - start, 2), "seconds")

# -----------------------------
# Step 5: Assign values
# -----------------------------
df["temporal_density"] = counts

# -----------------------------
# Step 6: Validation
# -----------------------------
print("\nTemporal density stats:")
print(df["temporal_density"].describe())

print("\nTop 5 temporal spikes:")
print(df.sort_values("temporal_density", ascending=False)[
    ["timestamp", "lat", "lon", "category_clean", "temporal_density"]
].head())

# -----------------------------
# Save dataset
# -----------------------------
df.to_csv("../data/complaints_with_temporal.csv", index=False)

print("\nDataset with temporal density saved!")