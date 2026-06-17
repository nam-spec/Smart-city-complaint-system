import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
import joblib
import os

print("Starting training script...")

# Paths
DATA_PATH = "../data/complaints_with_severity.csv"
MODEL_DIR = "model"

if not os.path.exists(DATA_PATH):
    # Try alternate path if run from project root
    DATA_PATH = "data/complaints_with_severity.csv"

if not os.path.exists(DATA_PATH):
    raise FileNotFoundError(f"Could not find complaints_with_severity.csv at {DATA_PATH}. Please make sure ML data is generated.")

print(f"Loading dataset from {DATA_PATH}...")
df = pd.read_csv(DATA_PATH).dropna(subset=["text", "category_clean"])
print(f"Loaded {len(df):,} complaints.")

# Train on a sample to keep the pickle file small and training fast
SAMPLE_SIZE = min(50000, len(df))
print(f"Sampling {SAMPLE_SIZE:,} complaints for training...")
df_sample = df.sample(n=SAMPLE_SIZE, random_state=42)

print("Fitting TF-IDF Vectorizer...")
vectorizer = TfidfVectorizer(max_features=5000, stop_words="english")
X = vectorizer.fit_transform(df_sample["text"])
y = df_sample["category_clean"]

print(f"Training Logistic Regression classifier (classes: {y.nunique()})...")
model = LogisticRegression(max_iter=1000, solver="lbfgs", multi_class="multinomial")
model.fit(X, y)

# Ensure model directory exists
os.makedirs(MODEL_DIR, exist_ok=True)

# Save model and vectorizer
print("Saving model files...")
joblib.dump(model, os.path.join(MODEL_DIR, "model.pkl"))
joblib.dump(vectorizer, os.path.join(MODEL_DIR, "vectorizer.pkl"))

print("Model trained and saved successfully on real 311 categories!")