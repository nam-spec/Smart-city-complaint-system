import pandas as pd
import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import StandardScaler
import time

# -----------------------------
# Load dataset
# -----------------------------
df = pd.read_csv("../data/final_priority_dataset.csv")

print("Dataset loaded:", len(df))

# -----------------------------
# Sample subset (IMPORTANT)
# -----------------------------
sample_size = 50000   # start with 50k (safe)

df_sample = df.sample(n=sample_size, random_state=42)

print("Using sample size:", len(df_sample))

# -----------------------------
# Step 1: Prepare features
# -----------------------------
# Convert timestamp
df_sample["timestamp"] = pd.to_datetime(df_sample["timestamp"])

# Convert to numeric time
df_sample["time_numeric"] = df_sample["timestamp"].astype("int64") // 10**9

# Convert lat/lon to radians (important for geo)
coords = np.radians(df_sample[["lat", "lon"]].values)

# Scale time separately
time_vals = df_sample[["time_numeric"]].values
time_scaled = StandardScaler().fit_transform(time_vals)

# Combine features
X = np.hstack([coords, time_scaled])

print("\nFeature matrix shape:", X.shape)

# -----------------------------
# Step 2: DBSCAN
# -----------------------------
print("\nRunning ST-DBSCAN baseline...")

start = time.time()

model = DBSCAN(
    eps=0.0005,        # slightly larger
    min_samples=10,
    n_jobs=-1        # parallel (important)
)

labels = model.fit_predict(X)
df_sample["cluster_id"] = labels

end = time.time()

print("Clustering time:", round(end - start, 2), "seconds")

# -----------------------------
# Step 3: Save labels
# -----------------------------
df_sample["cluster_id"] = labels

# -----------------------------
# Validation
# -----------------------------
num_clusters = len(set(labels)) - (1 if -1 in labels else 0)
num_noise = (labels == -1).sum()

print("\nNumber of clusters:", num_clusters)
print("Noise points:", num_noise)

print("\nTop cluster sizes:")
print(df_sample["cluster_id"].value_counts().head())




# -----------------------------
# Compute cluster size
# -----------------------------
cluster_sizes = df_sample["cluster_id"].value_counts()

# Map size to each point
df_sample["cluster_size"] = df_sample["cluster_id"].map(cluster_sizes)

# Remove noise influence
df_sample.loc[df_sample["cluster_id"] == -1, "cluster_size"] = 0

# Normalize
df_sample["cluster_norm"] = (
    df_sample["cluster_size"] - df_sample["cluster_size"].min()
) / (
    df_sample["cluster_size"].max() - df_sample["cluster_size"].min() + 1e-5
)

print("\nCluster priority stats:")
print(df_sample["cluster_norm"].describe())

# Save
print(df_sample.columns)
df_sample.to_csv("../data/complaints_with_clusters.csv", index=False)

print("\nDataset with clusters saved!")
print("\nColumns being saved:")
print(df_sample.columns)