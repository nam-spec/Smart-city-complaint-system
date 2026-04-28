"""
STSEP - Step 1: Severity Scoring
Uses sentence embeddings (all-MiniLM-L6-v2) with softmax-weighted
cosine similarity against severity anchors.
"""

import pandas as pd
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

# ─────────────────────────────────────────────
# Load
# ─────────────────────────────────────────────
df = pd.read_csv("../data/complaints_clean.csv")
print("Loaded:", len(df))

df["timestamp"] = pd.to_datetime(df["timestamp"])

# ─────────────────────────────────────────────
# Category mapping
# ─────────────────────────────────────────────
CATEGORY_MAP = {
    "HEAT/HOT WATER":                     "water",
    "WATER LEAK":                         "water",
    "Water System":                       "water",
    "PLUMBING":                           "water",
    "Illegal Parking":                    "traffic",
    "Blocked Driveway":                   "traffic",
    "Abandoned Vehicle":                  "traffic",
    "Derelict Vehicles":                  "traffic",
    "Noise - Residential":                "noise",
    "Noise - Street/Sidewalk":            "noise",
    "Noise - Commercial":                 "noise",
    "Noise - Vehicle":                    "noise",
    "Noise":                              "noise",
    "UNSANITARY CONDITION":               "sanitation",
    "Request Large Bulky Item Collection":"sanitation",
    "Street Condition":                   "road",
    "Traffic Signal Condition":           "road",
    "Street Light Condition":             "electric",
    "DOOR/WINDOW":                        "housing",
    "PAINT/PLASTER":                      "housing",
}

df["category_clean"] = df["category"].map(CATEGORY_MAP)
df = df.dropna(subset=["category_clean"])
print("After mapping:", len(df))

# ─────────────────────────────────────────────
# Sentence-embedding based severity scoring
# ─────────────────────────────────────────────
print("\nLoading sentence encoder …")
encoder = SentenceTransformer("all-MiniLM-L6-v2")

SEVERITY_ANCHORS = {
    1.0:  "electrical fire power outage dangerous emergency sparks explosion",
    0.85: "severe water leak flooding no hot water pipe burst overflow",
    0.75: "traffic accident blocked road signal broken vehicle crash",
    0.70: "road pothole damaged street condition hazard",
    0.65: "garbage overflow sanitation issue large waste bulky items",
    0.60: "housing door window paint structural damage",
    0.40: "noise complaint loud music party disturbance",
}

anchor_texts  = list(SEVERITY_ANCHORS.values())
anchor_scores = list(SEVERITY_ANCHORS.keys())
anchor_embeds = encoder.encode(anchor_texts, show_progress_bar=False)

print("Encoding complaint texts …")
BATCH  = 4096
texts  = df["text"].fillna("").tolist()
embeds = []

for start in range(0, len(texts), BATCH):
    batch = texts[start : start + BATCH]
    embeds.append(encoder.encode(batch, show_progress_bar=False))
    if (start // BATCH) % 10 == 0:
        print(f"  encoded {start + len(batch):,} / {len(texts):,}")

embeds = np.vstack(embeds)

sims = cosine_similarity(embeds, anchor_embeds)   # (N, 7)
anchor_arr = np.array(anchor_scores)

def softmax(x, axis=-1):
    e = np.exp(x - x.max(axis=axis, keepdims=True))
    return e / e.sum(axis=axis, keepdims=True)

weights = softmax(sims * 5)                        # temperature = 5
df["severity_score"] = (weights * anchor_arr).sum(axis=1)
df["severity_score"] = df["severity_score"].clip(0.35, 1.0)

print("\nSeverity stats (embedding-based):")
print(df["severity_score"].describe())

# ─────────────────────────────────────────────
# Save
# ─────────────────────────────────────────────
out = df[["text", "category_clean", "lat", "lon", "timestamp", "severity_score","closed_date"]]
out.to_csv("../data/complaints_with_severity.csv", index=False)
print("\nSaved → complaints_with_severity.csv")