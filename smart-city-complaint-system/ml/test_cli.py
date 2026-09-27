import os
import sys
import joblib
import numpy as np

# Load trained model and vectorizer
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model", "model.pkl")
VEC_PATH = os.path.join(BASE_DIR, "model", "vectorizer.pkl")

if not os.path.exists(MODEL_PATH) or not os.path.exists(VEC_PATH):
    print("Error: Model or vectorizer not found. Please run train.py first.")
    sys.exit(1)

model = joblib.load(MODEL_PATH)
vectorizer = joblib.load(VEC_PATH)

# Severity Anchors
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

# Load sentence transformer encoder if available
encoder = None
try:
    from sentence_transformers import SentenceTransformer
    encoder = SentenceTransformer("all-MiniLM-L6-v2")
    anchor_embeds = encoder.encode(anchor_texts, show_progress_bar=False)
except Exception:
    pass

def softmax(x):
    e_x = np.exp(x - np.max(x))
    return e_x / e_x.sum(axis=0)

def predict_complaint(text):
    text = text.strip()
    if not text:
        return

    # 1. Category Prediction
    X = vectorizer.transform([text])
    if X.nnz > 0:
        pred_cat = str(model.predict(X)[0])
        probs = model.predict_proba(X)[0]
    else:
        # Keyword heuristic fallback for completely unknown words
        lower_txt = text.lower()
        if any(w in lower_txt for w in ["electric", "power", "light", "pole", "wire", "voltage", "current", "transformer", "blackout", "fuse"]):
            pred_cat = "electric"
        elif any(w in lower_txt for w in ["water", "leak", "pipe", "flood", "sewage", "drain", "tap", "drinking"]):
            pred_cat = "water"
        elif any(w in lower_txt for w in ["garbage", "trash", "sanitation", "waste", "dustbin", "dump", "debris"]):
            pred_cat = "sanitation"
        elif any(w in lower_txt for w in ["pothole", "road", "street", "asphalt", "manhole", "sidewalk", "pavement"]):
            pred_cat = "road"
        elif any(w in lower_txt for w in ["traffic", "park", "car", "vehicle", "jam", "signal", "driveway"]):
            pred_cat = "traffic"
        elif any(w in lower_txt for w in ["noise", "loud", "music", "party", "speaker", "honking"]):
            pred_cat = "noise"
        elif any(w in lower_txt for w in ["wall", "door", "window", "crack", "plaster", "building", "balcony", "housing"]):
            pred_cat = "housing"
        else:
            pred_cat = str(model.predict(X)[0])
        probs = model.predict_proba(X)[0]

    # 2. Severity Calculation
    if encoder:
        emb = encoder.encode([text], show_progress_bar=False)
        sims = np.dot(emb, anchor_embeds.T).flatten()
        weights = softmax(sims * 5)
        sev_score = float((weights * anchor_scores).sum())
        sev_score = np.clip(sev_score, 0.35, 1.0)
    else:
        # TF-IDF fallback
        from sklearn.metrics.pairwise import cosine_similarity
        vec_anchors = vectorizer.transform(anchor_texts)
        sims = cosine_similarity(X, vec_anchors).flatten()
        if sims.sum() > 0:
            weights = softmax(sims * 5)
            sev_score = float((weights * anchor_scores).sum())
        else:
            sev_score = 0.50
        sev_score = np.clip(sev_score, 0.35, 1.0)

    # Display results
    print("\n" + "=" * 50)
    print(f"COMPLAINT TEXT: \"{text}\"")
    print("=" * 50)
    print(f"  * PREDICTED CATEGORY : {pred_cat.upper()}")
    print(f"  * SEVERITY SCORE     : {sev_score:.4f} (Scale: 0.35 - 1.00)")
    print("\n  Category Probabilities:")
    prob_dict = sorted(zip(model.classes_, probs), key=lambda x: x[1], reverse=True)
    for cat, p in prob_dict:
        bar = "#" * int(p * 20)
        print(f"    - {cat:<11} : {p * 100:>5.1f}% | {bar}")
    print("=" * 50 + "\n")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        # CLI Argument mode
        query = " ".join(sys.argv[1:])
        predict_complaint(query)
    else:
        # Interactive mode
        print("=" * 50)
        print("Smart City NLP Model - Console Testing Tool")
        print("Type a complaint description to test (or 'exit' to quit)")
        print("=" * 50)
        
        while True:
            try:
                inp = input("\nEnter complaint > ").strip()
                if inp.lower() in ["exit", "quit", "q"]:
                    print("Exiting test console.")
                    break
                if inp:
                    predict_complaint(inp)
            except (KeyboardInterrupt, EOFError):
                break
