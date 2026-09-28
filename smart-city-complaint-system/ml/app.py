import os
import re
import numpy as np
import joblib
from flask import Flask, request, jsonify
from keywords import keyword_scores

app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PIPE_PATH = os.path.join(BASE_DIR, "model", "pipeline.pkl")

pipeline = joblib.load(PIPE_PATH) if os.path.exists(PIPE_PATH) else None
CLASSES = list(pipeline.classes_) if pipeline is not None else []
print("Loaded classifier." if pipeline is not None else "WARNING: model missing. Run train.py first.")

# ---- Tunables -------------------------------------------------------------
KEYWORD_WEIGHT = 0.25        # max share the keyword prior can contribute (additive, bounded)
MIN_CONFIDENCE = 0.20        # below this -> "unclassified"
# ---------------------------------------------------------------------------

# Severity: each category has a base score + an anchor sentence for semantic matching
SEVERITY = {
    "fire":             (1.00, "fire outbreak explosion blaze smoke flames trapped emergency"),
    "gas":              (0.95, "gas leak cylinder blast toxic fumes explosion hazard evacuation"),
    "electric":         (0.80, "live wire sparking transformer blast power outage blackout shock hazard"),
    "water":            (0.65, "water pipe burst no drinking water contaminated supply failure"),
    "drainage":         (0.70, "sewage overflow flooding blocked drain waterlogging"),
    "public_safety":    (0.85, "theft chain snatching harassment crime unsafe violence"),
    "health":           (0.80, "disease outbreak dengue malaria no doctor ambulance hospital"),
    "road":             (0.70, "pothole open manhole sinkhole broken road accident hazard"),
    "traffic":          (0.60, "traffic signal broken jam illegal parking blocked road"),
    "pollution":        (0.65, "toxic smoke chemical discharge air pollution effluent"),
    "animals":          (0.60, "stray dogs attacking bite cattle on road snake"),
    "sanitation":       (0.55, "garbage not collected overflowing waste stench carcass"),
    "housing":          (0.60, "wall cracks ceiling falling balcony loose unsafe building"),
    "environment":      (0.45, "fallen tree branch bushes park garden maintenance"),
    "public_transport": (0.40, "bus delayed bus stop broken metro escalator not working"),
    "encroachment":     (0.40, "illegal encroachment hawkers unauthorized construction footpath"),
    "noise":            (0.35, "loud music noise loudspeaker late night disturbance"),
}
URGENCY_WORDS = ["emergency", "urgent", "trapped", "injured", "explosion", "collapse", "immediately",
                 "life", "dangerous", "children", "died", "accident", "fatal"]

# Optional semantic encoder (falls back gracefully)
encoder, anchor_embeds = None, None
try:
    from sentence_transformers import SentenceTransformer
    encoder = SentenceTransformer("all-MiniLM-L6-v2")
    anchor_embeds = encoder.encode([v[1] for v in SEVERITY.values()], show_progress_bar=False)
    print("MiniLM encoder loaded.")
except Exception as e:
    print(f"INFO: encoder unavailable, severity uses category prior only. Reason: {e}")


def softmax(x):
    e = np.exp(x - x.max())
    return e / e.sum()


def classify(text):
    """ML probabilities + bounded keyword prior. Returns (category, confidence, top3)."""
    X_has_vocab = bool(re.search(r"[a-zA-Z]{2,}", text))
    if not X_has_vocab:
        return "unclassified", 0.0, []

    ml = pipeline.predict_proba([text])[0]
    kw = keyword_scores(text, CLASSES)                 # sums to 1, or zeros if no hit
    blend = (1 - KEYWORD_WEIGHT) * ml + KEYWORD_WEIGHT * kw if kw.sum() > 0 else ml
    blend = blend / blend.sum()

    order = np.argsort(blend)[::-1]
    top3 = [{"category": CLASSES[i], "score": round(float(blend[i]), 4)} for i in order[:3]]
    best = order[0]
    if blend[best] < MIN_CONFIDENCE:
        return "unclassified", float(blend[best]), top3
    return CLASSES[best], float(blend[best]), top3


def severity_for(text, category):
    lower = text.lower()
    base = SEVERITY[category][0] if category in SEVERITY else None
    semantic = None
    if encoder is not None:
        try:
            from sklearn.metrics.pairwise import cosine_similarity
            sims = cosine_similarity(encoder.encode([text], show_progress_bar=False), anchor_embeds)[0]
            scores = np.array([v[0] for v in SEVERITY.values()])
            semantic = float((softmax(sims * 8) * scores).sum())
        except Exception as e:
            print(f"Embedding severity failed: {e}")

    if base is not None and semantic is not None:
        score = 0.6 * base + 0.4 * semantic
    else:
        score = base if base is not None else (semantic if semantic is not None else 0.5)

    score += 0.03 * min(3, sum(w in lower for w in URGENCY_WORDS))
    return float(np.clip(score, 0.3, 1.0))


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "status": "ML API is running",
        "categories": CLASSES,
        "endpoints": {"/predict": "POST {'text': '...'} -> category, confidence, severity_score"},
    })


@app.route("/predict", methods=["POST"])
def predict():
    try:
        if pipeline is None:
            return jsonify({"error": "Model not trained. Run train.py first."}), 503
        text = ((request.json or {}).get("text") or "").strip()
        if not text:
            return jsonify({"error": "Text is required"}), 400

        category, confidence, top3 = classify(text)
        return jsonify({
            "category": category,
            "confidence": round(confidence, 4),
            "top_predictions": top3,
            "severity_score": round(severity_for(text, category), 4),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(port=5001)