from flask import Flask, request, jsonify
import joblib
import numpy as np
import os

app = Flask(__name__)

# Load category classifier
MODEL_PATH = "model/model.pkl"
VEC_PATH = "model/vectorizer.pkl"

if os.path.exists(MODEL_PATH) and os.path.exists(VEC_PATH):
    model = joblib.load(MODEL_PATH)
    vectorizer = joblib.load(VEC_PATH)
    print("Loaded category classification model.")
else:
    model = None
    vectorizer = None
    print("WARNING: Classification model not found. Call train.py first.")

# Severity Anchors definition
SEVERITY_ANCHORS = {
    1.0:  "electrical fire power outage dangerous emergency sparks explosion",
    0.85: "severe water leak flooding no hot water pipe burst overflow",
    0.75: "traffic accident blocked road signal broken vehicle crash",
    0.70: "road pothole damaged street condition hazard",
    0.65: "garbage overflow sanitation issue large waste bulky items",
    0.60: "housing door window paint structural damage",
    0.40: "noise complaint loud music party disturbance",
}
anchor_texts = list(SEVERITY_ANCHORS.values())
anchor_scores = np.array(list(SEVERITY_ANCHORS.keys()))

# Load Sentence Transformer model (Embedding-based severity)
encoder = None
try:
    from sentence_transformers import SentenceTransformer
    print("Sentence Transformers found. Loading MiniLM encoder...")
    encoder = SentenceTransformer("all-MiniLM-L6-v2")
    # Pre-encode anchors
    anchor_embeds = encoder.encode(anchor_texts, show_progress_bar=False)
    print("MiniLM encoder loaded successfully.")
except Exception as e:
    print(f"INFO: Sentence Transformers fallback to TF-IDF Cosine Similarity. Reason: {e}")

def softmax(x, axis=-1):
    e = np.exp(x - x.max(axis=axis, keepdims=True))
    return e / e.sum(axis=axis, keepdims=True)

def calculate_severity_embedding(text):
    """Calculate severity using sentence embeddings and softmax similarities."""
    query_embed = encoder.encode([text], show_progress_bar=False)
    # Cosine similarity between query and all anchors
    from sklearn.metrics.pairwise import cosine_similarity
    sims = cosine_similarity(query_embed, anchor_embeds)  # shape (1, 7)
    weights = softmax(sims * 5)  # temperature = 5
    score = float((weights * anchor_scores).sum())
    return np.clip(score, 0.35, 1.0)

def calculate_severity_tfidf(text):
    """Lightweight fallback using TF-IDF and cosine similarity for severity."""
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    
    temp_vec = TfidfVectorizer(stop_words="english")
    all_texts = [text] + anchor_texts
    try:
        tfidf_mat = temp_vec.fit_transform(all_texts)
        sims = cosine_similarity(tfidf_mat[0:1], tfidf_mat[1:])  # shape (1, 7)
        weights = softmax(sims * 5)
        score = float((weights * anchor_scores).sum())
        return np.clip(score, 0.35, 1.0)
    except Exception:
        # Fallback to base category severity if tfidf fit fails (e.g. empty description)
        return 0.50

@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.json or {}
        text = data.get("text")

        if not text:
            return jsonify({"error": "Text is required"}), 400

        # 1. Predict Category
        category = "unclassified"
        if model and vectorizer:
            try:
                X = vectorizer.transform([text])
                category = str(model.predict(X)[0])
            except Exception as e:
                print(f"Error predicting category: {e}")
        else:
            # simple keyword match if classifier model is missing
            lower_txt = text.lower()
            if any(w in lower_txt for w in ["water", "leak", "pipe", "flood"]):
                category = "water"
            elif any(w in lower_txt for w in ["traffic", "park", "car", "vehicle"]):
                category = "traffic"
            elif any(w in lower_txt for w in ["noise", "loud", "music"]):
                category = "noise"
            elif any(w in lower_txt for w in ["garbage", "trash", "sanitation"]):
                category = "sanitation"
            elif any(w in lower_txt for w in ["road", "street", "pothole"]):
                category = "road"
            elif any(w in lower_txt for w in ["light", "electric", "power"]):
                category = "electric"
            elif any(w in lower_txt for w in ["door", "window", "structure"]):
                category = "housing"

        # 2. Calculate Severity Score
        if encoder:
            try:
                severity_score = calculate_severity_embedding(text)
            except Exception as e:
                print(f"Embedding calculation failed: {e}, falling back to TF-IDF")
                severity_score = calculate_severity_tfidf(text)
        else:
            severity_score = calculate_severity_tfidf(text)

        return jsonify({
            "category": category,
            "severity_score": round(severity_score, 4)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(port=5001)