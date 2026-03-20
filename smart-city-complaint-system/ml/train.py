import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
import joblib
import os

# Dummy dataset (baseline)
data = {
    "text": [
        "water leakage in street",
        "road accident near school",
        "garbage not collected",
        "electricity power cut",
        "fire outbreak in building"
    ],
    "label": [
        "Water",
        "Traffic",
        "Sanitation",
        "Electricity",
        "Emergency"
    ]
}

df = pd.DataFrame(data)

# Convert text to numerical features
vectorizer = TfidfVectorizer()
X = vectorizer.fit_transform(df["text"])
y = df["label"]

# Train classifier
model = LogisticRegression()
model.fit(X, y)

# Ensure model directory exists
os.makedirs("model", exist_ok=True)

# Save model and vectorizer
joblib.dump(model, "model/model.pkl")
joblib.dump(vectorizer, "model/vectorizer.pkl")

print("Model trained and saved successfully.")