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
    1.00: "fire outbreak explosion building blaze gas leak cylinder blast dangerous emergency smoke trapped",
    0.90: "electrical short circuit live wire sparking transformer power outage blackout high voltage hazard",
    0.85: "severe water leak pipe burst main flooding contaminated sewage drain overflow pipeline break",
    0.75: "traffic accident blocked road signal broken vehicle crash collision snarl gridlock",
    0.70: "road pothole crater open manhole cave in sinkhole damaged asphalt street hazard",
    0.65: "garbage overflow stinking waste uncollected trash carcass dumping sanitary issue",
    0.60: "housing wall crack ceiling plaster falling building structural damage balcony loose",
    0.50: "environment fallen tree uprooted wild bushes blocking road",
    0.40: "noise complaint loud music party late night loudspeaker honking disturbance",
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

KEYWORD_MAP = {
    "fire": ["fire", "blaze", "flames", "smoke", "burning", "explosion", "firefighting", "blast"],
    "gas": ["gas", "lpg", "cylinder", "fumes", "methane", "propane"],
    "electric": ["electric", "electricity", "power", "light", "voltage", "current", "transformer", "blackout", "fuse", "wire", "pole", "lighting"],
    "water": ["water", "leak", "pipe", "burst", "flood", "flooding", "sewage", "drain", "drainage", "tap", "pipeline", "plumbing"],
    "sanitation": ["garbage", "trash", "sanitation", "waste", "dustbin", "dump", "dumpster", "litter", "carcass", "stink", "stinking", "odor"],
    "road": ["pothole", "road", "street", "asphalt", "manhole", "sidewalk", "pavement", "sinkhole", "curb", "tar"],
    "traffic": ["traffic", "parking", "parked", "jam", "signal", "driveway", "car", "vehicle", "truck", "bottleneck"],
    "noise": ["noise", "loud", "music", "party", "speaker", "honking", "drilling", "sound", "banging", "loudspeaker"],
    "housing": ["housing", "building", "wall", "ceiling", "plaster", "balcony", "roof", "crack", "seepage", "structure"],
    "environment": ["tree", "bushes", "branch", "uprooted", "park", "plant", "foliage"]
}

def predict_complaint(text):
    text = text.strip()
    if not text:
        return

    lower_txt = text.lower()
    classes = list(model.classes_)
    
    # 1. Base ML Model Probabilities
    X = vectorizer.transform([text])
    if X.nnz > 0:
        base_probs = model.predict_proba(X)[0].copy()
    else:
        base_probs = np.ones(len(classes)) / len(classes)

    # 2. Keyword Boosting
    boosted_probs = base_probs.copy()
    keyword_found = False
    
    for cat_idx, cat_name in enumerate(classes):
        if cat_name in KEYWORD_MAP:
            kw_list = KEYWORD_MAP[cat_name]
            match_count = sum(1 for kw in kw_list if kw in lower_txt)
            if match_count > 0:
                keyword_found = True
                boosted_probs[cat_idx] *= (1.0 + 4.0 * match_count)

    # 3. Normalize Probabilities
    probs = boosted_probs / boosted_probs.sum()
    max_idx = np.argmax(probs)
    max_prob = probs[max_idx]

    # 4. Check Non-Civic / Gibberish Threshold
    if not keyword_found and X.nnz == 0:
        pred_cat = "unclassified"
    elif not keyword_found and max_prob < 0.22:
        pred_cat = "unclassified"
    else:
        pred_cat = classes[max_idx]

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
