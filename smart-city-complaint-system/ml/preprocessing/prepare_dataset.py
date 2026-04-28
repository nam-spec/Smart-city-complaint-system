import pandas as pd

# Load dataset
df = pd.read_csv("..//data//311_Service_Requests_from_2020_to_Present_20260319.csv")

# Print column names
print("Columns in dataset:")
print(df.columns)


# Select required columns
df = df[
    [
        "Problem Detail (formerly Descriptor)",
        "Problem (formerly Complaint Type)",
        "Latitude",
        "Longitude",
        "Created Date",
        "Closed Date"
    ]
]

# Rename columns to cleaner names
df = df.rename(
    columns={
        "Problem Detail (formerly Descriptor)": "text",
        "Problem (formerly Complaint Type)": "category",
        "Latitude": "lat",
        "Longitude": "lon",
        "Created Date": "timestamp",
        "Closed Date" : "closed_date"
    }
)

print("Selected columns:")
print(df.columns)

print("\nSample rows:")
print(df.head())
# Count rows before cleaning
print("\nTotal rows before cleaning:", len(df))

# Remove rows with missing values
df = df.dropna(subset=["text", "lat", "lon"])

# Count rows after cleaning
print("Total rows after cleaning:", len(df))
# Convert timestamp to datetime
df["timestamp"] = pd.to_datetime(df["timestamp"])

print("\nTimestamp datatype:")
print(df["timestamp"].dtype)

print("\nTimestamp sample:")
print(df["timestamp"].head())
# Save cleaned dataset
df.to_csv("../data/complaints_clean.csv", index=False)

print("\nClean dataset saved successfully!")
print("\nDataset Statistics")

print("Total complaints:", len(df))
print("Number of categories:", df["category"].nunique())

print("Time range:")
print(df["timestamp"].min(), "to", df["timestamp"].max())

import os
print(os.path.abspath("../data/complaints_clean.csv"))
