import os
import json
import numpy as np
import joblib
from flask import Flask, request, jsonify
from keywords import keyword_scores
from text_normalizer import (augment_for_model, detect_language, english_gloss,
                             split_cause_effect, normalize)
from veracity import assess_complaint_image

app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PIPE_PATH = os.path.join(BASE_DIR, "model", "pipeline.pkl")
PROTO_PATH = os.path.join(BASE_DIR, "model", "prototypes.json")

pipeline = joblib.load(PIPE_PATH) if os.path.exists(PIPE_PATH) else None
CLASSES = list(pipeline.classes_) if pipeline is not None else []
print("Loaded classifier." if pipeline is not None else "WARNING: model missing. Run train.py first.")

# ---- Tunables -------------------------------------------------------------
KEYWORD_WEIGHT = 0.25        # share of the keyword prior when no encoder is available
REVIEW_BELOW = 0.45          # confidence below this -> needs_manual_review (category still kept)
UNCLASSIFIED_BELOW = 0.20    # confidence below this -> "unclassified"
CAUSE_WEIGHT = 0.65          # weight of the cause clause when a causal marker is found
MIN_CAUSE_CONF = 0.30        # cause clause must be at least this confident to override
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
    "sanitation":       (0.55, "garbage not collected overflowing waste stench carcass कचरा उकिरडा घाण कचरापेटी सड़न kachra badboo dustbin kachra kachra gaddi rasta kachra"),
    "housing":          (0.60, "wall cracks ceiling falling balcony loose unsafe building भिंत छत इमारत पडण्याची शक्यता deewar crack"),
    "environment":      (0.45, "fallen tree branch bushes park garden maintenance झाड झाडाची फांदी पडली ped gir gaya"),
    "public_transport": (0.40, "bus delayed bus stop broken metro escalator not working बस रिक्षा रेल्वे वेळ bus timing"),
    "encroachment":     (0.40, "illegal encroachment hawkers unauthorized construction footpath अतिक्रमण फेरीवाले unauthori construction"),
    "noise":            (0.35, "loud music noise loudspeaker late night disturbance आवाज ध्वनी लाउडस्पीकर shor aawaz dj sound"),
}
URGENCY_WORDS = ["emergency", "urgent", "trapped", "injured", "explosion", "collapse", "immediately",
                 "life", "dangerous", "danger", "children", "died", "accident", "fatal", "आणीबाणी",
                 "धोकादायक", "तातडीने", "विस्फोट"]

# ---------------------------------------------------------------------------
# Multilingual sentence encoder (paraphrase-multilingual-MiniLM-L12-v2 understands Hindi,
# Marathi and English natively). Each category is represented by ALL its training phrases
# (English + Hinglish + Marathi + Hindi, from model/prototypes.json) plus the severity anchor,
# and a complaint is scored by its mean similarity to the 3 nearest prototypes per category.
# ---------------------------------------------------------------------------
encoder, anchor_embeds = None, None
proto_embeds, proto_labels = None, None
try:
    from sentence_transformers import SentenceTransformer
    print("Loading paraphrase-multilingual-MiniLM-L12-v2 model at startup...")
    encoder = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
    anchor_embeds = encoder.encode([v[1] for v in SEVERITY.values()], show_progress_bar=False,
                                   normalize_embeddings=True)
    texts, labels = [], []
    if os.path.exists(PROTO_PATH):
        with open(PROTO_PATH, encoding="utf-8") as f:
            for p in json.load(f)["prototypes"]:
                texts.append(p["text"])
                labels.append(p["category"])
    for cat, (_, anchor) in SEVERITY.items():
        texts.append(anchor)
        labels.append(cat)
    proto_embeds = encoder.encode(texts, show_progress_bar=False, normalize_embeddings=True, batch_size=64)
    proto_labels = np.array(labels)
    print(f"Multilingual encoder loaded with {len(texts)} category prototypes.")
except Exception as e:
    print(f"INFO: encoder unavailable, using TF-IDF + keyword classifier only. Reason: {e}")


def softmax(x):
    e = np.exp(x - x.max())
    return e / e.sum()


def _encoder_distribution(text):
    if encoder is None or proto_embeds is None or not CLASSES:
        return None
    emb = encoder.encode([text], show_progress_bar=False, normalize_embeddings=True)[0]
    sims = proto_embeds @ emb
    scores = np.full(len(CLASSES), -1.0)
    for i, cat in enumerate(CLASSES):
        s = np.sort(sims[proto_labels == cat])[::-1]
        if len(s):
            scores[i] = s[:3].mean()
    return softmax(scores * 20.0)


def _distribution(text):
    """Probability distribution over CLASSES from the ensemble of
    encoder (multilingual semantics) + TF-IDF (trained on gloss-augmented text) + keyword prior."""
    aug = augment_for_model(text)
    kw = keyword_scores(aug, CLASSES)
    ml = pipeline.predict_proba([aug])[0] if pipeline is not None else None
    enc = None
    try:
        enc = _encoder_distribution(text)
    except Exception as e:
        print(f"Encoder scoring error: {e}")

    uniform = np.ones(len(CLASSES)) / max(len(CLASSES), 1)
    ml = ml if ml is not None else uniform
    if enc is not None:
        blend = 0.45 * enc + 0.35 * ml + 0.20 * kw if kw.sum() > 0 else 0.55 * enc + 0.45 * ml
    elif kw.sum() > 0:
        blend = (1 - KEYWORD_WEIGHT) * ml + KEYWORD_WEIGHT * kw
    else:
        blend = ml
    return blend / blend.sum()


def analyze_text(text):
    """Full multilingual analysis of a complaint description.

    Returns a dict with the ROOT-CAUSE category (what the department must fix), the symptom
    category (what the citizen sees, if different), language, English gloss and confidence."""
    text = (text or "").strip()
    language = detect_language(text)
    gloss = english_gloss(text)
    base = {"language": language, "normalized_text": normalize(text), "english_gloss": gloss,
            "cause_text": None, "effect_text": None, "causal_marker": None}
    if len(text) < 3 or not CLASSES:
        return {**base, "category": "unclassified", "root_cause_category": "unclassified",
                "symptom_category": None, "confidence": 0.0, "top_predictions": [],
                "needs_manual_review": True}

    full = _distribution(text)
    final = full
    symptom = None
    cause, effect, marker = split_cause_effect(text)
    if cause:
        pc = _distribution(cause)
        if pc.max() >= MIN_CAUSE_CONF:
            final = CAUSE_WEIGHT * pc + (1 - CAUSE_WEIGHT) * full
            base.update(cause_text=cause, effect_text=effect, causal_marker=marker)
            root_idx = int(np.argmax(final))
            if effect and len(effect) >= 3:
                pe = _distribution(effect)
                e_idx = int(np.argmax(pe))
                if e_idx != root_idx and pe[e_idx] >= 0.40:
                    symptom = CLASSES[e_idx]
            if symptom is None:
                f_idx = int(np.argmax(full))
                if f_idx != root_idx and full[f_idx] >= 0.30:
                    symptom = CLASSES[f_idx]

    order = np.argsort(final)[::-1]
    top3 = [{"category": CLASSES[i], "score": round(float(final[i]), 4)} for i in order[:3]]
    confidence = float(final[order[0]])
    category = CLASSES[order[0]] if confidence >= UNCLASSIFIED_BELOW else "unclassified"
    return {**base, "category": category, "root_cause_category": category, "symptom_category": symptom,
            "confidence": round(confidence, 4), "top_predictions": top3,
            "needs_manual_review": confidence < REVIEW_BELOW}


def classify(text):
    """Backward-compatible wrapper: (category, confidence, top3, needs_manual_review)."""
    r = analyze_text(text)
    return r["category"], r["confidence"], r["top_predictions"], r["needs_manual_review"]


def severity_for(text, category):
    aug = augment_for_model(text)
    lower = aug.lower()
    base = SEVERITY[category][0] if category in SEVERITY else None
    semantic = None
    if encoder is not None:
        try:
            sims = anchor_embeds @ encoder.encode([text], show_progress_bar=False, normalize_embeddings=True)[0]
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


def complaint_severity(text, analysis):
    """Severity is driven by the worse of root cause and symptom
    (a short circuit that caused a FIRE is as urgent as a fire)."""
    cats = [c for c in (analysis["root_cause_category"], analysis.get("symptom_category")) if c]
    if not cats or cats == ["unclassified"]:
        return severity_for(text, "unclassified")
    return max(severity_for(text, c) for c in cats if c != "unclassified")


def _read_request():
    if request.is_json:
        data = request.json or {}
        return data, None
    data = request.form.to_dict()
    return data, request.files.get("image")


def _float_or_none(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "status": "ML API running: multilingual root-cause classifier + CLIP image classifier + fake-image detection",
        "categories": CLASSES,
        "encoder_loaded": encoder is not None,
        "endpoints": {
            "/predict": "POST {'text', 'image_path'?, 'latitude'?, 'longitude'?} -> category, root cause, image analysis, veracity",
            "/analyze-text": "POST {'text'} -> language, root cause, symptom, confidence",
            "/verify-veracity": "POST image file or image_path + text/category -> image classification + authenticity + match",
        },
    })


@app.route("/analyze-text", methods=["POST"])
def analyze_text_route():
    data, _ = _read_request()
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Text is required"}), 400
    r = analyze_text(text)
    r["severity_score"] = round(complaint_severity(text, r), 4)
    return jsonify(r)


@app.route("/predict", methods=["POST"])
def predict():
    try:
        if pipeline is None:
            return jsonify({"error": "Model not trained. Run train.py first."}), 503

        data, image_file = _read_request()
        text = (data.get("text") or "").strip()
        image_path = data.get("image_path")
        if not text:
            return jsonify({"error": "Text is required"}), 400

        analysis = analyze_text(text)
        severity = round(complaint_severity(text, analysis), 4)

        image_input = image_file or image_path
        veracity_result = assess_complaint_image(
            image_input,
            text_category=analysis["root_cause_category"],
            symptom_category=analysis.get("symptom_category"),
            english_text=f"{analysis['normalized_text']} {analysis['english_gloss']}".strip(),
            latitude=_float_or_none(data.get("latitude")),
            longitude=_float_or_none(data.get("longitude")),
        )

        return jsonify({
            "category": analysis["category"],
            "root_cause_category": analysis["root_cause_category"],
            "symptom_category": analysis["symptom_category"],
            "language": analysis["language"],
            "english_gloss": analysis["english_gloss"],
            "cause_text": analysis["cause_text"],
            "confidence": analysis["confidence"],
            "needs_manual_review": bool(analysis["needs_manual_review"] or veracity_result.get("needs_manual_review")),
            "top_predictions": analysis["top_predictions"],
            "severity_score": severity,
            "veracity": veracity_result,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/verify-veracity", methods=["POST"])
def verify_veracity():
    try:
        data, image_file = _read_request()
        text = data.get("text", "") or ""
        category = data.get("category", "") or ""
        image_input = image_file or data.get("image_path")
        symptom, english_text = None, text
        if text:
            a = analyze_text(text)
            category = category or a["root_cause_category"]
            symptom = a["symptom_category"]
            english_text = f"{a['normalized_text']} {a['english_gloss']}".strip()

        res = assess_complaint_image(image_input, text_category=category, symptom_category=symptom,
                                     english_text=english_text,
                                     latitude=_float_or_none(data.get("latitude")),
                                     longitude=_float_or_none(data.get("longitude")))
        return jsonify({"success": True, "veracity": res})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == "__main__":
    app.run(port=5001)
