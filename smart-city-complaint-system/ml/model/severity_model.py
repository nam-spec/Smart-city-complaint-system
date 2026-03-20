import pandas as pd

# Load dataset
df = pd.read_csv("../data/complaints_clean.csv")

print("Dataset loaded")
print("Total rows:", len(df))

# Check timestamp (IMPORTANT)
print("\nTimestamp dtype BEFORE conversion:")
print(df["timestamp"].dtype)

# Convert timestamp (safe step)
df["timestamp"] = pd.to_datetime(df["timestamp"])

print("\nTimestamp dtype AFTER conversion:")
print(df["timestamp"].dtype)

# Show sample
print("\nSample data:")
print(df.head())

print("\nTop 20 categories:")
print(df["category"].value_counts().head(20))

# Apply category mapping
CATEGORY_MAP = {
    "HEAT/HOT WATER": "water",
    "WATER LEAK": "water",
    "Water System": "water",
    "PLUMBING": "water",

    "Illegal Parking": "traffic",
    "Blocked Driveway": "traffic",
    "Abandoned Vehicle": "traffic",
    "Derelict Vehicles": "traffic",

    "Noise - Residential": "noise",
    "Noise - Street/Sidewalk": "noise",
    "Noise - Commercial": "noise",
    "Noise - Vehicle": "noise",
    "Noise": "noise",

    "UNSANITARY CONDITION": "sanitation",
    "Request Large Bulky Item Collection": "sanitation",

    "Street Condition": "road",
    "Traffic Signal Condition": "road",

    "Street Light Condition": "electric",

    "DOOR/WINDOW": "housing",
    "PAINT/PLASTER": "housing",
}

df["category_clean"] = df["category"].map(CATEGORY_MAP)

# Drop unmapped rows
df = df.dropna(subset=["category_clean"])

print("\nAfter category mapping:")
print("Remaining rows:", len(df))

print("\nCategory distribution:")
print(df["category_clean"].value_counts())

SEVERITY_MAP = {
    "electric": 0.95,
    "water": 0.85,
    "traffic": 0.75,
    "road": 0.70,
    "sanitation": 0.65,
    "housing": 0.60,
    "noise": 0.40,
}

df["severity_base"] = df["category_clean"].map(SEVERITY_MAP)

print("\nSeverity base stats:")
print(df["severity_base"].describe())

KEYWORDS = {
    "urgent": 0.1,
    "danger": 0.15,
    "accident": 0.2,
    "fire": 0.3,
    "flood": 0.2,
    "leak": 0.1,
    "broken": 0.1,
    "overflow": 0.15,
    "blocked": 0.1,
    "not working": 0.1,
    "no water": 0.2,
    "power outage": 0.3
}

def adjust_severity(text, base):
    text = str(text).lower()
    boost = 0
    
    for word, val in KEYWORDS.items():
        if word in text:
            boost += val
    
    return min(base + boost, 1.0)

df["severity_score"] = df.apply(
    lambda x: adjust_severity(x["text"], x["severity_base"]),
    axis=1
)

print("\nFinal severity stats:")
print(df["severity_score"].describe())

# Select final columns
final_df = df[[
    "text",
    "category_clean",
    "lat",
    "lon",
    "timestamp",
    "severity_score"
]]

# Save to CSV
final_df.to_csv("../data/complaints_with_severity.csv", index=False)

print("\nFinal dataset saved!")

print("\nSample final dataset:")
print(final_df.head())
