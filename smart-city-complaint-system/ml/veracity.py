"""Combines image classification, text-image matching and fake-image forensics into one verdict.

veracity_status
  VERIFIED       image is authentic and shows what the description says
  SUSPICIOUS     weak match or some authenticity concerns -> manual review
  FAKE_MISMATCH  image does not show what the description says (or shows non-civic content)
  LIKELY_FAKE    image is likely AI-generated, edited, a screenshot or a re-used old photo
  UNVERIFIED     no image / image could not be analysed
(The backend adds DUPLICATE when the same photo was already used in another complaint.)
"""
import numpy as np

import clip_verifier as cv
from fake_detector import analyze_authenticity

# Categories whose photos legitimately look alike; a match between them gets partial credit.
RELATED = {
    "water": {"drainage", "health"},
    "drainage": {"water", "sanitation", "road", "health"},
    "sanitation": {"drainage", "health", "animals", "encroachment"},
    "road": {"traffic", "drainage", "encroachment", "environment"},
    "traffic": {"road", "encroachment", "public_transport"},
    "fire": {"pollution", "electric", "gas"},
    "gas": {"fire", "pollution"},
    "electric": {"fire", "environment", "public_safety"},
    "pollution": {"fire", "drainage", "sanitation"},
    "environment": {"road", "electric", "housing"},
    "housing": {"environment"},
    "encroachment": {"road", "traffic", "sanitation"},
    "public_transport": {"traffic", "road"},
    "health": {"drainage", "sanitation", "water"},
    "animals": {"sanitation", "road"},
    "public_safety": {"electric"},
    "noise": set(),
}

# Priority multipliers the backend applies (kept here so both sides document the same policy)
PRIORITY_FACTOR = {"VERIFIED": 1.0, "UNVERIFIED": 0.95, "SUSPICIOUS": 0.85,
                   "FAKE_MISMATCH": 0.5, "LIKELY_FAKE": 0.4}


def _category_agreement(image_probs, text_category, symptom_category):
    """0..1: how much probability mass the image puts on the text's root cause / symptom
    (full credit) or on related categories (half credit), relative to its top category."""
    if not image_probs or not text_category or text_category == "unclassified":
        return None
    targets = {text_category} | ({symptom_category} if symptom_category else set())
    related = set()
    for t in targets:
        related |= RELATED.get(t, set())
    related -= targets
    direct = sum(image_probs.get(t, 0.0) for t in targets)
    partial = 0.5 * sum(image_probs.get(t, 0.0) for t in related)
    top = max(image_probs.values())
    return float(np.clip((direct + partial) / max(top, 1e-6), 0, 1))


def _similarity_to_unit(sim):
    """Map raw CLIP cosine (≈0.15 unrelated, ≈0.30+ strong) to 0..1."""
    if sim is None:
        return None
    return float(np.clip((sim - 0.17) / (0.30 - 0.17), 0, 1))


def assess_complaint_image(image_input, text_category=None, symptom_category=None, english_text=None,
                           latitude=None, longitude=None):
    target = (text_category or "unclassified").lower()
    if not image_input:
        return {"is_fake": False, "veracity_score": 1.0, "veracity_status": "UNVERIFIED",
                "needs_manual_review": False, "clip_visual_category": target, "image_category": None,
                "image_confidence": None, "image_top_predictions": [], "predicted_text_category": target,
                "category_similarity": None, "text_image_match": None, "category_agreement": None,
                "fake_risk_score": 0.0, "authenticity_verdict": None, "fake_signals": [], "phash": None,
                "priority_factor": PRIORITY_FACTOR["UNVERIFIED"],
                "explanation": "No image attached; text classification only."}

    # Load image
    try:
        if isinstance(image_input, str):
            import os
            if not os.path.exists(image_input):
                return {"is_fake": False, "veracity_score": 0.0, "veracity_status": "UNVERIFIED",
                        "needs_manual_review": True, "clip_visual_category": "missing_image",
                        "image_category": None, "image_confidence": None, "image_top_predictions": [],
                        "predicted_text_category": target, "category_similarity": None,
                        "text_image_match": None, "category_agreement": None, "fake_risk_score": 0.0,
                        "authenticity_verdict": None, "fake_signals": [], "phash": None,
                        "priority_factor": PRIORITY_FACTOR["UNVERIFIED"],
                        "explanation": "Uploaded image file not found on the ML server."}
        image = cv._load_image(image_input)
    except Exception as e:
        return {"is_fake": True, "veracity_score": 0.0, "veracity_status": "LIKELY_FAKE",
                "needs_manual_review": True, "clip_visual_category": "unreadable", "image_category": None,
                "image_confidence": None, "image_top_predictions": [], "predicted_text_category": target,
                "category_similarity": None, "text_image_match": None, "category_agreement": None,
                "fake_risk_score": 1.0, "authenticity_verdict": "LIKELY_FAKE",
                "fake_signals": [{"code": "UNREADABLE", "weight": 1.0, "message": f"Image could not be decoded: {e}"}],
                "phash": None, "priority_factor": PRIORITY_FACTOR["LIKELY_FAKE"],
                "explanation": "The uploaded file is not a valid image."}

    # 1. image classification (independent of text)
    img_cls, sim, ai_p = None, None, None
    try:
        img_cls = cv.classify_image(image)
        if img_cls is not None:
            emb = img_cls.pop("_embedding")
            sim = cv.text_image_similarity(emb, english_text) if english_text else None
            # The zero-shot "AI render vs real photo" check is only meaningful for photos of scenes.
            # Screenshots, documents and app UIs look like "digital art" to CLIP, so skip it for them.
            if img_cls["category"] != cv.NON_CIVIC and img_cls["non_civic_probability"] < 0.5:
                ai_p = cv.ai_generated_probability(emb)
    except Exception as e:
        print(f"CLIP image analysis failed: {e}")
        img_cls = None

    # 2. forensic authenticity
    try:
        auth = analyze_authenticity(image_input, latitude=latitude, longitude=longitude, clip_ai_probability=ai_p)
    except Exception as e:
        print(f"Authenticity analysis failed: {e}")
        auth = {"risk_score": 0.0, "verdict": "AUTHENTIC", "signals": [], "phash": None}

    # 3. text <-> image match
    agreement = _category_agreement(img_cls["probabilities"], target, symptom_category) if img_cls else None
    sim_unit = _similarity_to_unit(sim)
    parts = [(agreement, 0.6), (sim_unit, 0.4)]
    parts = [(v, w) for v, w in parts if v is not None]
    match = sum(v * w for v, w in parts) / sum(w for _, w in parts) if parts else None

    image_category = img_cls["category"] if img_cls else None
    non_civic = img_cls["non_civic_probability"] if img_cls else 0.0
    risk = auth["risk_score"]
    signals = list(auth["signals"])

    # 4. decision
    reasons = []
    if image_category == cv.NON_CIVIC or non_civic >= 0.5:
        status = "FAKE_MISMATCH"
        reasons.append("the photo shows non-civic content (screenshot, document, selfie, receipt or similar)")
    elif auth["verdict"] == "LIKELY_FAKE":
        status = "LIKELY_FAKE"
        reasons.append("forensic checks indicate the photo is not a genuine, recent camera photo")
    elif target != "unclassified" and ((match is not None and match < 0.25) or
                                       (img_cls and img_cls["confidence"] >= 0.5 and agreement is not None
                                        and agreement < 0.10)):
        status = "FAKE_MISMATCH"
        reasons.append(f"the photo looks like '{image_category}' but the description is about '{target}'")
    elif auth["verdict"] == "SUSPICIOUS" or (match is not None and match < 0.5):
        status = "SUSPICIOUS"
        if auth["verdict"] == "SUSPICIOUS":
            reasons.append("some authenticity checks raised concerns")
        if match is not None and match < 0.5:
            reasons.append(f"only a weak match between photo ('{image_category}') and description ('{target}')")
    elif img_cls is None:
        status = "UNVERIFIED" if risk < 0.3 else "SUSPICIOUS"
        reasons.append("CLIP image model is not available, only forensic checks were run")
    else:
        status = "VERIFIED"

    # Put the decisive reason first in the evidence list shown to citizens and admins
    if status == "FAKE_MISMATCH":
        if image_category == cv.NON_CIVIC or non_civic >= 0.5:
            signals.insert(0, {"code": "NON_CIVIC_CONTENT", "weight": 0.8,
                               "message": "The photo does not show a civic problem - it looks like a screenshot, "
                                          "document, receipt, selfie or other unrelated picture."})
        else:
            signals.insert(0, {"code": "CATEGORY_MISMATCH", "weight": 0.6,
                               "message": f"The photo looks like '{str(image_category).replace('_', ' ')}' but the "
                                          f"description is about '{target.replace('_', ' ')}'."})
    elif status == "SUSPICIOUS" and match is not None and match < 0.5:
        signals.insert(0, {"code": "WEAK_MATCH", "weight": 0.3,
                           "message": f"Only a weak match ({match:.0%}) between the photo and the description."})

    is_fake = status in ("FAKE_MISMATCH", "LIKELY_FAKE")
    match_v = match if match is not None else 0.5
    veracity_score = float(np.clip((1 - risk) * (0.4 + 0.6 * match_v), 0, 1))

    if status == "UNVERIFIED":
        explanation = ("Image model (CLIP) not available, so the photo was not compared with the description; "
                       f"forensic checks found risk {risk:.0%}.")
    elif status == "VERIFIED":
        explanation = (f"Photo shows '{image_category}' which matches the reported '{target}' "
                       f"(match {match_v:.0%}); no signs of manipulation (risk {risk:.0%}).")
    else:
        explanation = "Flagged: " + "; ".join(reasons) + "."
        if signals:
            extra = [s["message"] for s in signals[:4]
                     if s["code"] not in ("NO_CAMERA_DATA", "NON_CIVIC_CONTENT", "CATEGORY_MISMATCH", "WEAK_MATCH")]
            if extra:
                explanation += " Evidence: " + " ".join(extra[:3])

    return {
        "is_fake": is_fake,
        "veracity_score": round(veracity_score, 4),
        "veracity_status": status,
        "needs_manual_review": status != "VERIFIED" and status != "UNVERIFIED",
        # backward-compatible fields used by the existing frontend
        "clip_visual_category": image_category or "unprocessed",
        "predicted_text_category": target,
        "category_similarity": round(agreement, 4) if agreement is not None else None,
        # new fields
        "image_category": image_category,
        "image_confidence": img_cls["confidence"] if img_cls else None,
        "image_top_predictions": img_cls["top_predictions"] if img_cls else [],
        "text_image_similarity": round(sim, 4) if sim is not None else None,
        "text_image_match": round(match, 4) if match is not None else None,
        "category_agreement": round(agreement, 4) if agreement is not None else None,
        "ai_generated_probability": round(ai_p, 4) if ai_p is not None else None,
        "fake_risk_score": risk,
        "authenticity_verdict": auth["verdict"],
        "fake_signals": signals,
        "phash": auth.get("phash"),
        "image_meta": {k: auth.get(k) for k in ("format", "width", "height", "exif", "ela")},
        "priority_factor": PRIORITY_FACTOR[status],
        "explanation": explanation,
    }
