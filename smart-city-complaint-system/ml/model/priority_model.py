import pandas as pd

# -----------------------------
# Load dataset
# -----------------------------
df = pd.read_csv("../data/complaints_with_acceleration.csv")

print("Dataset loaded:", len(df))

# -----------------------------
# Step 1: Normalization function
# -----------------------------
def normalize(col):
    return (col - col.min()) / (col.max() - col.min())

# -----------------------------
# Step 2: Normalize features
# -----------------------------
df["severity_norm"] = normalize(df["severity_score"])
df["spatial_norm"] = normalize(df["spatial_density"])
df["temporal_norm"] = normalize(df["temporal_density"])
df["acceleration_norm"] = normalize(df["acceleration"])

print("\nNormalization check:")
print(df[[
    "severity_norm",
    "spatial_norm",
    "temporal_norm",
    "acceleration_norm"
]].describe())

# -----------------------------
# Step 3: Define weights
# -----------------------------
alpha = 0.30   # severity
beta  = 0.25   # spatial
gamma = 0.20   # temporal
delta = 0.30   # acceleration (SURGE)

# -----------------------------
# Step 4: Compute priority score
# -----------------------------
df["priority_score"] = (
    alpha * df["severity_norm"] +
    beta  * df["spatial_norm"] +
    gamma * df["temporal_norm"] +
    delta * df["acceleration_norm"]
)

# -----------------------------
# Step 5: Validation
# -----------------------------
print("\nPriority score stats:")
print(df["priority_score"].describe())

print("\nTop 10 priority complaints:")
print(df.sort_values("priority_score", ascending=False)[
    ["text", "category_clean", "priority_score"]
].head(10))

# -----------------------------
# Step 6: Explainability (VERY IMPORTANT)
# -----------------------------
print("\nSample explanation (Top row):")
top_row = df.sort_values("priority_score", ascending=False).iloc[0]

print(top_row[[
    "severity_norm",
    "spatial_norm",
    "temporal_norm",
    "acceleration_norm",
    "priority_score"
]])

# -----------------------------
# Save final dataset
# -----------------------------
df.to_csv("../data/final_priority_dataset.csv", index=False)

print("\nFinal dataset saved!")