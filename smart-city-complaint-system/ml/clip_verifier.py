"""CLIP-based image understanding for civic complaints.

* classify_image()          - which civic category the PHOTO shows (independent of the text),
                              using several prompts per category (prompt ensembling).
* text_image_similarity()   - cosine similarity between the complaint text (English gloss)
                              and the photo.
* ai_generated_probability()- weak zero-shot signal "real phone photo" vs "AI render / digital art".
* verify_image_veracity()   - kept for backward compatibility (old /predict response shape).

torch / transformers are imported lazily, so the rest of the ML service still works when
they are not installed (image checks then report UNVERIFIED instead of crashing).
"""
import os
import numpy as np

MODEL_NAME = os.environ.get("CLIP_MODEL", "openai/clip-vit-base-patch32")

# Several prompts per category; their text embeddings are averaged (prompt ensembling),
# which is noticeably more robust than a single prompt.
CATEGORY_PROMPTS = {
    "water": ["a photo of a burst water pipe spraying water", "a photo of a leaking municipal water pipeline",
              "a photo of an empty water tap or dry water tank", "a photo of people queueing at a water tanker"],
    "gas": ["a photo of a gas cylinder leaking", "a photo of an lpg gas cylinder in a kitchen",
            "a photo of a gas pipeline leak on a street"],
    "electric": ["a photo of a broken electric pole with hanging wires", "a photo of an electrical transformer sparking",
                 "a photo of a street light pole at night that is not working", "a photo of tangled exposed electric cables"],
    "road": ["a photo of a pothole on a road", "a photo of a damaged broken asphalt road",
             "a photo of a cracked street with craters", "a photo of an open manhole on a road"],
    "sanitation": ["a photo of a pile of garbage on the street", "a photo of an overflowing garbage bin",
                   "a photo of trash and plastic waste dumped on a roadside", "a photo of a dirty public toilet"],
    "drainage": ["a photo of sewage water overflowing from a drain", "a photo of a clogged gutter with dirty water",
                 "a photo of a waterlogged flooded street after rain", "a photo of an overflowing manhole"],
    "fire": ["a photo of a building on fire with flames", "a photo of thick smoke and fire",
             "a photo of a burning vehicle", "a photo of firefighters at a fire"],
    "noise": ["a photo of large loudspeakers at a street event", "a photo of a dj setup at a party at night",
              "a photo of a crowded loud procession with speakers"],
    "traffic": ["a photo of a traffic jam with many cars", "a photo of vehicles illegally parked blocking a road",
                "a photo of a broken traffic signal at a junction"],
    "pollution": ["a photo of a factory chimney emitting black smoke", "a photo of smog and air pollution over a city",
                  "a photo of chemical foam or effluent in a river"],
    "animals": ["a photo of stray dogs on a street", "a photo of cows or cattle sitting on a road",
                "a photo of monkeys on a building", "a photo of a snake"],
    "public_safety": ["a photo of a dark unsafe alley at night", "a photo of a police crime scene",
                      "a photo of broken cctv camera in a public place"],
    "housing": ["a photo of a large crack in a building wall", "a photo of a collapsed balcony or ceiling",
                "a photo of a dilapidated old building", "a photo of water seepage and damp walls"],
    "environment": ["a photo of a fallen tree blocking a road", "a photo of a broken tree branch",
                    "a photo of an overgrown neglected park"],
    "public_transport": ["a photo of a bus stop shelter", "a photo of a city bus", "a photo of a metro station",
                         "a photo of auto rickshaws"],
    "encroachment": ["a photo of street hawkers occupying a footpath", "a photo of illegal stalls on a sidewalk",
                     "a photo of unauthorized construction on public land"],
    "health": ["a photo of mosquitoes breeding in stagnant water", "a photo of a hospital or clinic",
               "a photo of fogging machine spraying insecticide"],
}
NON_CIVIC_PROMPTS = [
    "a screenshot of a mobile phone screen", "a screenshot of a chat conversation",
    "a photo of a payment receipt or bank transaction", "a scanned printed document or invoice",
    "a selfie of a person", "a meme with text", "a photo of a pet at home", "a photo of food on a plate",
    "a photo of furniture inside a house", "a cartoon or illustration", "a photo of a celebrity or poster",
]
REAL_PROMPTS = ["a real photo taken with a smartphone camera", "an amateur outdoor photograph of a street"]
AI_PROMPTS = ["an ai generated image", "a digital art rendering", "a 3d render", "a photorealistic cgi image",
              "a stable diffusion or midjourney artwork"]

NON_CIVIC = "fake_unrelated"
CATEGORIES = list(CATEGORY_PROMPTS.keys())

_clip_model = None
_clip_processor = None
_label_embeds = None      # (n_labels, d) prompt-ensembled embeddings, last row = non-civic
_ai_embeds = None         # (2, d): real, ai
_load_failed = False


def get_clip_model():
    global _clip_model, _clip_processor, _label_embeds, _ai_embeds, _load_failed
    if _clip_model is not None or _load_failed:
        return _clip_model, _clip_processor
    try:
        import torch
        from transformers import CLIPProcessor, CLIPModel
        print(f"Loading CLIP model ({MODEL_NAME})...")
        _clip_processor = CLIPProcessor.from_pretrained(MODEL_NAME)
        _clip_model = CLIPModel.from_pretrained(MODEL_NAME)
        _clip_model.eval()

        def embed_group(prompts):
            inp = _clip_processor(text=prompts, return_tensors="pt", padding=True, truncation=True)
            with torch.no_grad():
                e = _clip_model.get_text_features(**inp)
            e = e / e.norm(dim=-1, keepdim=True)
            m = e.mean(dim=0)
            return (m / m.norm()).numpy()

        _label_embeds = np.stack([embed_group(CATEGORY_PROMPTS[c]) for c in CATEGORIES] +
                                 [embed_group(NON_CIVIC_PROMPTS)])
        _ai_embeds = np.stack([embed_group(REAL_PROMPTS), embed_group(AI_PROMPTS)])
        print("CLIP model loaded successfully.")
    except Exception as e:
        print(f"CLIP unavailable ({e}); image classification will report UNVERIFIED.")
        _clip_model, _clip_processor, _load_failed = None, None, True
    return _clip_model, _clip_processor


def is_available():
    m, _ = get_clip_model()
    return m is not None


def _load_image(image_input):
    from PIL import Image
    if hasattr(image_input, "seek"):
        image_input.seek(0)
    return Image.open(image_input).convert("RGB")


def _image_embedding(image):
    import torch
    model, processor = get_clip_model()
    inp = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        e = model.get_image_features(**inp)
    e = e / e.norm(dim=-1, keepdim=True)
    return e[0].numpy()


def _logit_scale():
    try:
        return float(_clip_model.logit_scale.exp().item())
    except Exception:
        return 100.0


def classify_image(image):
    """Zero-shot category of the photo. `image` is a PIL image.
    Returns {category, confidence, top_predictions, probabilities, non_civic_probability}."""
    if not is_available():
        return None
    emb = _image_embedding(image)
    logits = _logit_scale() * (_label_embeds @ emb)
    probs = np.exp(logits - logits.max())
    probs /= probs.sum()
    labels = CATEGORIES + [NON_CIVIC]
    order = np.argsort(probs)[::-1]
    return {
        "category": labels[order[0]],
        "confidence": round(float(probs[order[0]]), 4),
        "top_predictions": [{"category": labels[i], "score": round(float(probs[i]), 4)} for i in order[:3]],
        "probabilities": {labels[i]: float(probs[i]) for i in range(len(labels))},
        "non_civic_probability": round(float(probs[-1]), 4),
        "_embedding": emb,
    }


def text_image_similarity(image_embedding, english_text):
    """Raw CLIP cosine similarity (typically 0.15 unrelated .. 0.35 strongly related)."""
    import torch
    if not is_available() or not english_text:
        return None
    inp = _clip_processor(text=[english_text[:300]], return_tensors="pt", padding=True, truncation=True)
    with torch.no_grad():
        t = _clip_model.get_text_features(**inp)
    t = (t / t.norm(dim=-1, keepdim=True))[0].numpy()
    return float(t @ image_embedding)


def ai_generated_probability(image_embedding):
    """Zero-shot P(AI-generated) from CLIP. Weak on its own; used as one signal among several."""
    if not is_available():
        return None
    logits = _logit_scale() * (_ai_embeds @ image_embedding)
    p = np.exp(logits - logits.max())
    p /= p.sum()
    return float(p[1])


def verify_image_veracity(image_input, predicted_text_category):
    """Backward-compatible wrapper used by older code paths."""
    from veracity import assess_complaint_image
    return assess_complaint_image(image_input, text_category=predicted_text_category)


if __name__ == "__main__":
    print("Testing clip_verifier module...")
    print("available:", is_available())
