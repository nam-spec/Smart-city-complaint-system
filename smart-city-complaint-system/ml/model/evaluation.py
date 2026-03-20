import pandas as pd
from sklearn.metrics import ndcg_score

# -----------------------------
# Load dataset
# -----------------------------
df = pd.read_csv("../data/final_priority_dataset.csv")

print("Dataset loaded:", len(df))

# -----------------------------
# Step 1: Baselines
# -----------------------------
df["baseline_semantic"] = df["severity_norm"]
df["baseline_spatial"] = df["spatial_norm"]

# -----------------------------
# Step 2: Ground Truth (Proxy)
# -----------------------------
# -----------------------------
# Better Ground Truth (Top 5%)
# -----------------------------
threshold = df["priority_score"].quantile(0.85)

df["ground_truth"] = (
    df["acceleration"] > df["acceleration"].quantile(0.90)
).astype(int)

print("\nGround truth distribution:")
print(df["ground_truth"].value_counts(normalize=True))



# -----------------------------
# Step 3: Prepare for NDCG
# -----------------------------
y_true = df["ground_truth"].values.reshape(1, -1)

y_pred_stsep = df["priority_score"].values.reshape(1, -1)
y_pred_semantic = df["baseline_semantic"].values.reshape(1, -1)
y_pred_spatial = df["baseline_spatial"].values.reshape(1, -1)

# -----------------------------
# Step 4: Compute NDCG
# -----------------------------
ndcg_stsep = ndcg_score(y_true, y_pred_stsep)
ndcg_semantic = ndcg_score(y_true, y_pred_semantic)
ndcg_spatial = ndcg_score(y_true, y_pred_spatial)

print("\nNDCG Scores:")
print(f"STSEP Model:     {ndcg_stsep:.4f}")
print(f"Semantic Only:   {ndcg_semantic:.4f}")
print(f"Spatial Only:    {ndcg_spatial:.4f}")

# No-surge model (remove acceleration)
df["priority_no_surge"] = (
    0.30 * df["severity_norm"] +
    0.25 * df["spatial_norm"] +
    0.20 * df["temporal_norm"]
)

y_pred_no_surge = df["priority_no_surge"].values.reshape(1, -1)

ndcg_no_surge = ndcg_score(y_true, y_pred_no_surge)

print(f"No-Surge Model:  {ndcg_no_surge:.4f}")

# -----------------------------
# Load cluster dataset (sample)
# -----------------------------
df_cluster = pd.read_csv("../data/complaints_with_clusters.csv")

# Use same ground truth logic (IMPORTANT)
df_cluster["ground_truth"] = (
    df_cluster["acceleration"] > df_cluster["acceleration"].quantile(0.90)
).astype(int)

print("\nCluster GT distribution:")
print(df_cluster["ground_truth"].value_counts(normalize=True))

# Prepare
y_true_cluster = df_cluster["ground_truth"].values.reshape(1, -1)
y_pred_cluster = df_cluster["cluster_norm"].values.reshape(1, -1)

# Compute NDCG
ndcg_cluster = ndcg_score(y_true_cluster, y_pred_cluster)

print(f"\nST-DBSCAN Baseline NDCG: {ndcg_cluster:.4f}")