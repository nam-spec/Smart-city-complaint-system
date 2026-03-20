import pandas as pd
import numpy as np

# -----------------------------
# Load dataset
# -----------------------------
df = pd.read_csv("../data/complaints_with_temporal.csv")

print("Dataset loaded:", len(df))

# Convert timestamp
df["timestamp"] = pd.to_datetime(df["timestamp"])

# -----------------------------
# Step 1: Create time windows
# -----------------------------
window_size = "10T"  # 10 minutes

df["time_window"] = df["timestamp"].dt.floor(window_size)

print("\nTime windows created")

# -----------------------------
# Step 2: Compute lambda_t
# -----------------------------
window_counts = df.groupby("time_window").size()

# Convert to DataFrame
window_df = window_counts.reset_index(name="lambda_t")

print("\nNumber of time windows:", len(window_df))


# -----------------------------
# Step 3: Compute growth rate (LOG VERSION)
# -----------------------------
window_df["lambda_prev"] = window_df["lambda_t"].shift(1)

# Log-based growth (stable)
window_df["growth_rate"] = np.log(
    (window_df["lambda_t"] + 1) /
    (window_df["lambda_prev"] + 1)
)

# Handle first row
window_df["growth_rate"] = window_df["growth_rate"].fillna(0)


# -----------------------------
# Step 4: Merge back
# -----------------------------
df = df.merge(
    window_df[["time_window", "growth_rate"]],
    on="time_window",
    how="left"
)

# Suppress noise from very small windows
window_df.loc[window_df["lambda_prev"] < 5, "growth_rate"] = 0
# -----------------------------
# Step 5: Validation
# -----------------------------
print("\nGrowth rate stats:")
print(df["growth_rate"].describe())

print("\nTop 5 highest growth windows:")
print(window_df.sort_values("growth_rate", ascending=False).head())

print("\nTop 5 lowest growth windows:")
print(window_df.sort_values("growth_rate").head())

# -----------------------------
# Save dataset
# -----------------------------
df.to_csv("../data/complaints_with_growth.csv", index=False)

print("\nDataset with growth rate saved!")