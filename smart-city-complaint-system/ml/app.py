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
MIN_CONFIDENCE = 0.50        # below this -> "unclassified" & send to manual review
# ---------------------------------------------------------------------------

# Severity: each category has a base score + multilingual anchor sentence for semantic matching
SEVERITY = {
    "fire":             (1.00, "fire outbreak explosion blaze smoke flames trapped emergency इमारत आग धूर विस्फोट विस्तव भीषण आग आग की लपटें आग लगी aag dhua aag lagi pyre bhishab aag"),
    "gas":              (0.95, "gas leak cylinder blast toxic fumes explosion hazard evacuation गॅस गळती सिलेंड्‍डर गॅस वास रिसाव gas leak galti"),
    "electric":         (0.80, "live wire sparking transformer blast power outage blackout shock hazard विद्युत वीज शॉर्ट सर्किट बिजली गुल लाइट नहीं है bijli taar"),
    "water":            (0.65, "water pipe burst no drinking water contaminated supply failure पिण्याच्या पाण्याचा नळ गळती पानी की टंकी paani pani nahi"),
    "drainage":         (0.70, "sewage overflow flooding blocked drain waterlogging गटार तुंबले नाला सांडपाणी नाली सड़क gutar overflow nala jam gatar nala gutter paani bhar badboo ghus gaya sewer overflow"),
    "public_safety":    (0.85, "theft chain snatching harassment crime unsafe violence चोरी दरोडा गुन्हेगारी सुरक्षा चोर चौरस्ता chori maar peet"),
    "health":           (0.80, "disease outbreak dengue malaria no doctor ambulance hospital डास डेंग्यू आजार फवारणी मलेरिया dawa spray"),
    "road":             (0.70, "pothole open manhole sinkhole broken road accident hazard रस्ता खड्डा खड्डे सड़क धंस गई गड्डा khadda khatta"),
    "traffic":          (0.60, "traffic signal broken jam illegal parking blocked road वाहतूक कोंडी ट्रॅफिक जॅम गाड्यांची रांग traffic jam"),
    "pollution":        (0.65, "toxic smoke chemical discharge air pollution effluent dust smog प्रदूषण धूर विषारी हवा सांस लेने तकलीफ dhua hawa kharab"),
    "animals":          (0.60, "stray dogs attacking bite cattle on road snake कुत्रा भटकणारे कुत्रे माकड kutta katne"),
    "sanitation":       (0.55, "garbage not collected overflowing waste stench carcass कचरा उकिरडा घाण कचरापेटी सड़न kachra badboo dustbin kachra kachra gaddi rasta kachra"),
    "housing":          (0.60, "wall cracks ceiling falling balcony loose unsafe building भिंत छत इमारत पडण्याची शक्यता deewar crack"),
    "environment":      (0.45, "fallen tree branch bushes park garden maintenance झाड झाडाची फांदी पडली ped gir gaya"),
    "public_transport": (0.40, "bus delayed bus stop broken metro escalator not working बस रिक्षा रेल्वे वेळ bus timing"),
    "encroachment":     (0.40, "illegal encroachment hawkers unauthorized construction footpath अतिक्रमण फेरीवाले unauthori construction"),
    "noise":            (0.35, "loud music noise loudspeaker late night disturbance आवाज ध्वनी लाउडस्पीकर shor aawaz dj sound"),
}
URGENCY_WORDS = ["emergency", "urgent", "trapped", "injured", "explosion", "collapse", "immediately",
                 "life", "dangerous", "children", "died", "accident", "fatal", "आणीबाणी", "धोकादायक", "तातडीने", "विस्फोट"]

# Load multilingual transformer model once at startup
encoder, anchor_embeds = None, None
try:
    from sentence_transformers import SentenceTransformer
    print("Loading paraphrase-multilingual-MiniLM-L12-v2 model at startup...")
    encoder = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
    anchor_embeds = encoder.encode([v[1] for v in SEVERITY.values()], show_progress_bar=False)
    print("Multilingual MiniLM-L12 encoder loaded successfully.")
except Exception as e:
    print(f"INFO: encoder unavailable, severity uses category prior only. Reason: {e}")


def softmax(x):
    e = np.exp(x - x.max())
    return e / e.sum()


def classify(text):
    """ML probabilities + multilingual transformer embeddings + bounded keyword prior. Returns (category, confidence, top3, needs_manual_review)."""
    has_text = len(text.strip()) >= 3
    if not has_text:
        return "unclassified", 0.0, [], True

    # 1. Keyword prior
    kw = keyword_scores(text, CLASSES)

    # 2. Multilingual SentenceTransformer Semantic Embedding Probabilities
    sem_prob = None
    if encoder is not None and anchor_embeds is not None:
        try:
            from sklearn.metrics.pairwise import cosine_similarity
            text_emb = encoder.encode([text], show_progress_bar=False)
            sims = cosine_similarity(text_emb, anchor_embeds)[0]
            exp_sims = np.exp(sims * 15.0 - np.max(sims * 15.0))
            raw_sem_prob = exp_sims / exp_sims.sum()

            sev_keys = list(SEVERITY.keys())
            sem_prob = np.zeros(len(CLASSES))
            for idx, cat in enumerate(CLASSES):
                if cat in sev_keys:
                    sev_idx = sev_keys.index(cat)
                    sem_prob[idx] = raw_sem_prob[sev_idx]
            if sem_prob.sum() > 0:
                sem_prob = sem_prob / sem_prob.sum()
        except Exception as e:
            print(f"Semantic classify error: {e}")

    # 3. TF-IDF classifier prior
    ml = pipeline.predict_proba([text])[0] if pipeline is not None else None

    # Combine distributions
    if sem_prob is not None and kw.sum() > 0:
        blend = 0.70 * sem_prob + 0.30 * kw
    elif sem_prob is not None:
        blend = sem_prob
    elif kw.sum() > 0:
        blend = (1 - KEYWORD_WEIGHT) * (ml if ml is not None else np.ones(len(CLASSES))/len(CLASSES)) + KEYWORD_WEIGHT * kw
    elif ml is not None:
        blend = ml
    else:
        blend = np.ones(len(CLASSES)) / max(len(CLASSES), 1)

    blend = blend / blend.sum()

    order = np.argsort(blend)[::-1]
    top3 = [{"category": CLASSES[i], "score": round(float(blend[i]), 4)} for i in order[:3]]
    best = order[0]
    confidence = float(blend[best])

    needs_manual_review = confidence < MIN_CONFIDENCE
    category = CLASSES[best] if not needs_manual_review else "unclassified"

    return category, confidence, top3, needs_manual_review


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

        category, confidence, top3, needs_manual_review = classify(text)
        return jsonify({
            "category": category,
            "confidence": round(confidence, 4),
            "needs_manual_review": needs_manual_review,
            "top_predictions": top3,
            "severity_score": round(severity_for(text, category), 4),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(port=5001)