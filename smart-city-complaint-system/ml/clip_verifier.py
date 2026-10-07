import os
import torch
import numpy as np
from PIL import Image
from transformers import CLIPProcessor, CLIPModel

# Dictionary of zero-shot candidate text prompts for civic complaint categories + non-civic media
CIVIC_CATEGORY_PROMPTS = {
    "water": "a photo of water leakage, pipe burst, street flooding, or water supply issue",
    "gas": "a photo of gas leak, commercial gas cylinder, or toxic fume smoke",
    "electric": "a photo of broken electric pole, hanging transformer wires, or power outage sparks",
    "road": "a photo of a pothole, damaged asphalt road, street crack, or broken pavement",
    "sanitation": "a photo of piled garbage, overflowing trash dump, bin waste, or litter",
    "drainage": "a photo of sewage overflow, clogged gutter, open manhole, or dirty waterlogging",
    "fire": "a photo of fire flames, burning building, heavy smoke, or explosion",
    "noise": "a photo of loud speaker, party crowd, night event stage, or disturbance",
    "traffic": "a photo of traffic jam, blocked street vehicles, or broken signal",
    "pollution": "a photo of toxic factory smoke, air pollution, or chemical discharge",
    "animals": "a photo of stray dogs, aggressive animals, or cattle on road",
    "public_safety": "a photo of police crime scene, hazard zone, or danger area",
    "housing": "a photo of cracked wall, balcony collapse, or damaged building structure",
    "environment": "a photo of fallen tree branch, overgrown bushes, or park maintenance",
    "public_transport": "a photo of bus stop, bus delay, or public transport terminal",
    "encroachment": "a photo of illegal hawker stall, unauthorized footpath construction, or encroachment",
    "fake_unrelated": "a photo of a bank transaction receipt, upi payment screenshot, mobile phone screenshot, printed document, financial bill, invoice, chat message, indoor furniture, selfie, meme, pet animal, or unrelated non-civic picture"
}

_clip_model = None
_clip_processor = None

def get_clip_model():
    global _clip_model, _clip_processor
    if _clip_model is None or _clip_processor is None:
        try:
            print("Loading OpenAI CLIP model (clip-vit-base-patch32)...")
            _clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
            _clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
            _clip_model.eval()
            print("CLIP Model loaded successfully.")
        except Exception as e:
            print(f"Error loading CLIP model: {e}")
            _clip_model = None
            _clip_processor = None
    return _clip_model, _clip_processor

def verify_image_veracity(image_input, predicted_text_category):
    """
    Computes zero-shot CLIP image-text cross-modal similarity.
    Compares uploaded image against candidate civic category prompts and 'fake_unrelated'.
    """
    model, processor = get_clip_model()
    target_cat = (predicted_text_category or "unclassified").lower()

    if model is None or processor is None:
        return {
            "is_fake": False,
            "veracity_score": 0.0,
            "veracity_status": "UNVERIFIED",
            "clip_visual_category": "unprocessed",
            "predicted_text_category": target_cat,
            "category_similarity": 0.0,
            "explanation": "CLIP model offline; image cross-modal verification skipped."
        }

    try:
        if isinstance(image_input, str):
            if not os.path.exists(image_input):
                return {
                    "is_fake": True,
                    "veracity_score": 0.0,
                    "veracity_status": "FAKE_MISMATCH",
                    "clip_visual_category": "missing_image",
                    "predicted_text_category": target_cat,
                    "category_similarity": 0.0,
                    "explanation": "Uploaded image file not found on server."
                }
            image = Image.open(image_input).convert("RGB")
        else:
            image = Image.open(image_input).convert("RGB")

        categories = list(CIVIC_CATEGORY_PROMPTS.keys())
        prompts = [CIVIC_CATEGORY_PROMPTS[cat] for cat in categories]

        inputs = processor(text=prompts, images=image, return_tensors="pt", padding=True)
        with torch.no_grad():
            outputs = model(**inputs)
            logits_per_image = outputs.logits_per_image # image-to-text similarity logits
            probs = logits_per_image.softmax(dim=1).numpy()[0]

        # Top predicted visual category
        top_idx = int(np.argmax(probs))
        top_visual_category = categories[top_idx]
        top_visual_score = float(probs[top_idx])

        # Similarity to predicted text category
        if target_cat in categories:
            cat_idx = categories.index(target_cat)
            target_similarity = float(probs[cat_idx])
        else:
            target_similarity = 0.0

        # Decision rules for veracity classification
        is_fake = False
        if top_visual_category == "fake_unrelated":
            is_fake = True
            veracity_status = "FAKE_MISMATCH"
        elif target_cat != "unclassified" and top_visual_category != target_cat and top_visual_score > 0.25 and target_similarity < 0.12:
            is_fake = True
            veracity_status = "FAKE_MISMATCH"
        elif target_similarity >= 0.15 and top_visual_category == target_cat:
            is_fake = False
            veracity_status = "VERIFIED"
        elif target_similarity >= 0.08:
            is_fake = False
            veracity_status = "SUSPICIOUS"
        else:
            is_fake = True
            veracity_status = "FAKE_MISMATCH"

        veracity_score = float(np.clip(target_similarity * 3.0 if not is_fake else target_similarity * 0.5, 0.0, 1.0))

        if is_fake:
            if top_visual_category == "fake_unrelated":
                explanation = (
                    f"Uploaded evidence image detected as non-civic/unrelated media (bank receipt, document, or personal screenshot). "
                    f"Cross-modal similarity to '{target_cat}' is only {round(target_similarity * 100, 1)}%. Flagged as Fake Report."
                )
            else:
                explanation = (
                    f"Complaint text reported '{target_cat}', but uploaded image visual features "
                    f"match '{top_visual_category}' ({round(top_visual_score * 100, 1)}% match). "
                    f"Cross-modal CLIP similarity to '{target_cat}' is only {round(target_similarity * 100, 1)}%. Flagged as Category Mismatch."
                )
        else:
            explanation = (
                f"Uploaded image matches predicted '{target_cat}' category "
                f"with CLIP cross-modal similarity of {round(target_similarity * 100, 1)}% ({veracity_status})."
            )

        return {
            "is_fake": is_fake,
            "veracity_score": round(veracity_score, 4),
            "veracity_status": veracity_status,
            "clip_visual_category": top_visual_category,
            "predicted_text_category": target_cat,
            "category_similarity": round(target_similarity, 4),
            "explanation": explanation
        }

    except Exception as e:
        print(f"Error running CLIP verification: {e}")
        return {
            "is_fake": False,
            "veracity_score": 0.0,
            "veracity_status": "UNVERIFIED",
            "clip_visual_category": "unknown",
            "predicted_text_category": target_cat,
            "category_similarity": 0.0,
            "explanation": f"CLIP processing exception: {str(e)}"
        }

if __name__ == "__main__":
    print("Testing clip_verifier module...")
    get_clip_model()
