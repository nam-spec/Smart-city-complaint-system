import pandas as pd

# -----------------------------
# Load dataset (with growth)
# -----------------------------
df = pd.read_csv("../data/complaints_with_growth.csv")

print("Dataset loaded:", len(df))

# Ensure datetime
df["timestamp"] = pd.to_datetime(df["timestamp"])

# -----------------------------
# Recreate time windows (match Task 5)
# -----------------------------
df["time_window"] = df["timestamp"].dt.floor("10min")

# -----------------------------
# Build window-level table
# (ONE row per window)
# -----------------------------
window_df = (
    df[["time_window", "growth_rate"]]
    .drop_duplicates()
    .sort_values("time_window")
    .reset_index(drop=True)
)

# -----------------------------
# Step 1: Previous growth
# -----------------------------
window_df["growth_prev"] = window_df["growth_rate"].shift(1)

# -----------------------------
# Step 2: Acceleration
# -----------------------------
window_df["acceleration"] = (
    window_df["growth_rate"] - window_df["growth_prev"]
)

# Handle first window
window_df["acceleration"] = window_df["acceleration"].fillna(0)

# -----------------------------
# Step 3: Merge back
# -----------------------------
df = df.merge(
    window_df[["time_window", "acceleration"]],
    on="time_window",
    how="left"
)

# -----------------------------
# Validation
# -----------------------------
print("\nAcceleration stats:")
print(df["acceleration"].describe())

print("\nTop 5 highest acceleration (SURGE):")
print(window_df.sort_values("acceleration", ascending=False).head())

print("\nTop 5 lowest acceleration (DROP):")
print(window_df.sort_values("acceleration").head())

# -----------------------------
# Save
# -----------------------------
df.to_csv("../data/complaints_with_acceleration.csv", index=False)

print("\nDataset with acceleration saved!")