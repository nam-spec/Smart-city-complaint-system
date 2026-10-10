"""Image authenticity checks for complaint evidence photos.

No single test reliably proves an image is fake, so several independent forensic signals
are combined into one risk score (noisy-OR) and every signal that fired is reported with a
human-readable reason, so an admin can see WHY a complaint was flagged.

Signals
  AI_METADATA        Generator fingerprints in metadata: Stable Diffusion / ComfyUI prompt chunks,
                     Midjourney, DALL-E, Firefly, Gemini/Imagen, C2PA "trainedAlgorithmicMedia".
  AI_VISUAL          Optional dedicated AI-image detector (set AI_DETECTOR_MODEL) and/or CLIP
                     zero-shot "AI render vs real phone photo".
  EDITING_SOFTWARE   Saved by Photoshop, GIMP, Canva, PicsArt, Snapseed ...
  SCREENSHOT         Phone-screen-sized PNG without camera data, or tagged as a screenshot.
  ELA_TAMPERING      Error-level analysis: one region recompresses very differently from the
                     rest of the JPEG, typical of copy-paste / splicing.
  STALE_PHOTO        Camera timestamp much older than the complaint (re-used old photo).
  GPS_MISMATCH       Photo's GPS location is far from the complaint location.
  LOW_RESOLUTION     Tiny image - typically a thumbnail downloaded from the web.
  NO_CAMERA_DATA     No camera make/model (weak: WhatsApp also strips EXIF).
Duplicate / re-used images are detected in the backend by comparing the perceptual hash
returned here (`phash`) with earlier complaints.
"""
import io
import math
import os
from datetime import datetime, timezone

import numpy as np
from PIL import Image, ImageChops

LIKELY_FAKE_AT = 0.60
SUSPICIOUS_AT = 0.30

AI_MARKERS = [b"midjourney", b"dall-e", b"dall\xc2\xb7e", b"dalle", b"stable diffusion", b"stablediffusion",
              b"comfyui", b"automatic1111", b"novelai", b"invokeai", b"firefly", b"imagen", b"gemini",
              b"trainedalgorithmicmedia", b"compositewithtrainedalgorithmicmedia", b"bing image creator",
              b"leonardo.ai", b"ideogram", b"openai", b"synthid", b"made with ai", b"ai generated",
              b"sdxl", b"flux.1"]
PNG_AI_KEYS = {"parameters", "prompt", "workflow", "dream", "sd-metadata", "invokeai_metadata",
               "negative_prompt", "generation_data"}
# Full editors (compositing possible) vs light photo-adjustment apps
EDITORS = ["photoshop", "gimp", "canva", "picsart", "pixlr", "affinity", "paint.net", "facetune",
           "remini", "fotor", "photopea", "meitu", "befunky", "krita"]
LIGHT_EDITORS = ["lightroom", "snapseed", "inshot", "vsco"]
SCREEN_WIDTHS = {640, 720, 750, 828, 1080, 1125, 1170, 1179, 1242, 1284, 1290, 1440, 1536, 1600, 1920, 2048}

_ai_detector = None
_ai_detector_failed = False


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _read_bytes(image_input):
    if isinstance(image_input, (bytes, bytearray)):
        return bytes(image_input)
    if isinstance(image_input, str):
        with open(image_input, "rb") as f:
            return f.read()
    if hasattr(image_input, "seek"):
        image_input.seek(0)
    data = image_input.read()
    if hasattr(image_input, "seek"):
        image_input.seek(0)
    return data


def _exif(img):
    out = {}
    try:
        ex = img.getexif()
        if not ex:
            return out
        out["make"] = ex.get(271)
        out["model"] = ex.get(272)
        out["software"] = ex.get(305)
        out["datetime"] = ex.get(306)
        try:
            sub = ex.get_ifd(0x8769)
            out["datetime_original"] = sub.get(36867) or sub.get(36868)
            out["user_comment"] = sub.get(37510)
        except Exception:
            pass
        try:
            gps = ex.get_ifd(0x8825)
            if gps and 2 in gps and 4 in gps:
                def dms(v):
                    d, m, s = [float(x) for x in v]
                    return d + m / 60 + s / 3600
                lat = dms(gps[2]) * (-1 if gps.get(1) in ("S", b"S") else 1)
                lng = dms(gps[4]) * (-1 if gps.get(3) in ("W", b"W") else 1)
                out["gps"] = (lat, lng)
        except Exception:
            pass
    except Exception:
        pass
    return {k: v for k, v in out.items() if v not in (None, "", b"")}


def _parse_exif_dt(s):
    if isinstance(s, bytes):
        s = s.decode(errors="ignore")
    for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y:%m:%d %H:%M:%S%z"):
        try:
            return datetime.strptime(str(s).strip()[:19], fmt[:17] if "%z" in fmt else fmt)
        except Exception:
            continue
    return None


def _haversine_km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def _dct_matrix(n):
    m = np.zeros((n, n))
    for k in range(n):
        for i in range(n):
            m[k, i] = math.cos(math.pi * (2 * i + 1) * k / (2 * n))
    m[0] *= 1 / math.sqrt(n)
    m[1:] *= math.sqrt(2 / n)
    return m


_DCT32 = _dct_matrix(32)


def perceptual_hash(img):
    """64-bit DCT pHash as a 16-char hex string (robust to resizing / recompression)."""
    g = np.asarray(img.convert("L").resize((32, 32), Image.LANCZOS), dtype=np.float64)
    d = _DCT32 @ g @ _DCT32.T
    low = d[:8, :8].flatten()[1:]
    bits = low > np.median(low)
    bits = np.concatenate([[False], bits])  # keep 64 bits
    return "".join(f"{int(''.join('1' if b else '0' for b in bits[i:i + 4]), 2):x}" for i in range(0, 64, 4))


def hamming_hex(a, b):
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def error_level_analysis(img, quality=90, block=16):
    """Returns (heterogeneity_score, details). Compares each block's recompression error with the
    image as a whole; a spliced region keeps a distinctly different error level."""
    rgb = img.convert("RGB")
    w, h = rgb.size
    # NOTE: never resize before ELA - resampling destroys the 8x8 JPEG grid the test relies on.
    # Very large photos are cropped to their central 3000x3000 region instead.
    if max(w, h) > 3000:
        cx, cy = w // 2, h // 2
        rgb = rgb.crop((max(0, cx - 1500), max(0, cy - 1500), min(w, cx + 1500), min(h, cy + 1500)))
    buf = io.BytesIO()
    rgb.save(buf, "JPEG", quality=quality)
    buf.seek(0)
    diff = np.asarray(ImageChops.difference(rgb, Image.open(buf).convert("RGB")), dtype=np.float32).mean(axis=2)
    gray = np.asarray(rgb.convert("L"), dtype=np.float32)
    H, W = diff.shape
    hb, wb = H // block, W // block
    if hb < 4 or wb < 4:
        return 0.0, {"reason": "image too small for ELA"}
    d = diff[:hb * block, :wb * block].reshape(hb, block, wb, block).mean(axis=(1, 3))
    # normalise by local texture: busy regions naturally have more error
    g = gray[:hb * block, :wb * block].reshape(hb, block, wb, block).std(axis=(1, 3)) + 8.0
    r = d / g
    if float(np.median(d)) < 0.05:
        return 0.0, {"reason": "flat / synthetic image, ELA not meaningful"}
    med = float(np.median(r)) + 1e-6
    p99 = float(np.percentile(r, 99.5))
    ratio = p99 / med
    # fraction of blocks that are strong outliers, and whether they form a compact region
    outliers = r > (med * 3.0)
    frac = float(outliers.mean())
    score = float(np.clip((ratio - 3.5) / 5.0, 0, 1)) if 0.003 < frac < 0.35 else 0.0
    return score, {"ratio": round(ratio, 2), "outlier_fraction": round(frac, 4), "mean_error": round(float(diff.mean()), 3)}


def _ai_detector_probability(img):
    """Optional dedicated detector, e.g. AI_DETECTOR_MODEL=umm-maybe/AI-image-detector."""
    global _ai_detector, _ai_detector_failed
    name = os.environ.get("AI_DETECTOR_MODEL", "").strip()
    if not name or _ai_detector_failed:
        return None
    try:
        if _ai_detector is None:
            from transformers import pipeline
            print(f"Loading AI-image detector {name} ...")
            _ai_detector = pipeline("image-classification", model=name)
        preds = _ai_detector(img.convert("RGB"))
        p = 0.0
        for pr in preds:
            lab = pr["label"].lower()
            if any(k in lab for k in ("artificial", "ai", "fake", "generated", "synthetic")):
                p = max(p, float(pr["score"]))
        return p
    except Exception as e:
        print(f"AI detector unavailable: {e}")
        _ai_detector_failed = True
        return None


# ---------------------------------------------------------------------------
# main entry
# ---------------------------------------------------------------------------
def analyze_authenticity(image_input, latitude=None, longitude=None, now=None,
                         clip_ai_probability=None, max_photo_age_days=30):
    """Returns {risk_score, verdict, signals[], phash, exif, ela}.
    verdict: AUTHENTIC | SUSPICIOUS | LIKELY_FAKE"""
    now = now or datetime.now()
    raw = _read_bytes(image_input)
    img = Image.open(io.BytesIO(raw))
    img.load()
    fmt = (img.format or "").upper()
    signals = []

    def add(code, weight, message):
        signals.append({"code": code, "weight": round(float(weight), 3), "message": message})

    exif = _exif(img)
    low_raw = raw.lower()

    # 1. AI generator fingerprints in metadata ---------------------------------
    png_keys = {k.lower() for k in (img.info or {}).keys() if isinstance(k, str)}
    ai_keys = png_keys & PNG_AI_KEYS
    hits = [m.decode(errors="ignore") for m in AI_MARKERS if m in low_raw[:2_000_000]]
    sw = str(exif.get("software", "")).lower()
    if ai_keys or hits:
        what = ", ".join(sorted(set(list(ai_keys) + hits)))[:120]
        add("AI_METADATA", 0.90, f"Image metadata contains AI-generator fingerprints ({what}).")

    # 2. Dedicated / zero-shot AI-image detection -----------------------------
    p_det = _ai_detector_probability(img)
    if p_det is not None and p_det >= 0.6:
        add("AI_VISUAL", 0.70 * (p_det - 0.5) / 0.5 + 0.2,
            f"AI-image detector rates this image {p_det:.0%} likely AI-generated.")
    elif clip_ai_probability is not None and clip_ai_probability >= 0.70:
        add("AI_VISUAL", 0.40 * (clip_ai_probability - 0.5) / 0.5,
            f"Visual style resembles an AI render / digital art ({clip_ai_probability:.0%}).")

    # 3. Editing software ---------------------------------------------------------
    def find(names):
        e = next((n for n in names if n in sw), None)
        return e or next((n for n in names if n.encode() in low_raw[:200_000]), None)
    editor = find(EDITORS)
    if editor:
        add("EDITING_SOFTWARE", 0.35, f"Image was saved by editing software ({editor}).")
    else:
        light = find(LIGHT_EDITORS)
        if light:
            add("EDITING_SOFTWARE", 0.20, f"Image was adjusted in a photo app ({light}).")

    # 4. Screenshot -----------------------------------------------------------------
    w, h = img.size
    tall = max(w, h) / max(1, min(w, h))
    comment = str(exif.get("user_comment", "")).lower()
    if "screenshot" in comment or b"screenshot" in low_raw[:100_000]:
        add("SCREENSHOT", 0.55, "Image is tagged as a screenshot.")
    elif fmt == "PNG" and not exif.get("make") and min(w, h) in SCREEN_WIDTHS and tall >= 1.75:
        add("SCREENSHOT", 0.45, f"Phone-screen sized PNG ({w}x{h}) without camera data - likely a screenshot.")
    elif not exif.get("make") and not exif.get("model") and tall >= 1.95:
        # Phone screens are ~19.5:9 (ratio ~2.1); camera photos are 4:3 (1.33) or 16:9 (1.78).
        # Catches screenshots that were re-saved as JPEG / resized (e.g. shared via WhatsApp).
        add("SCREENSHOT", 0.40, f"Image has a phone-screen shape ({w}x{h}) and no camera data - likely a screenshot.")

    # 5. Error level analysis (JPEG only) ------------------------------------------
    ela_score, ela = (0.0, {})
    if fmt in ("JPEG", "MPO"):
        ela_score, ela = error_level_analysis(img)
        if ela_score > 0.15:
            add("ELA_TAMPERING", 0.45 * ela_score + 0.1,
                "Error-level analysis shows a region that recompresses differently from the rest "
                "of the photo (possible copy-paste / splice).")

    # 6. Timestamp ------------------------------------------------------------------
    dt = _parse_exif_dt(exif.get("datetime_original") or exif.get("datetime") or "")
    if dt:
        age_days = (now.replace(tzinfo=None) - dt).total_seconds() / 86400
        if age_days > 365:
            add("STALE_PHOTO", 0.40, f"Photo was taken {age_days / 365:.1f} years before the complaint.")
        elif age_days > max_photo_age_days:
            add("STALE_PHOTO", 0.25, f"Photo was taken {int(age_days)} days before the complaint.")
        elif age_days < -2:
            add("STALE_PHOTO", 0.20, "Photo timestamp is in the future (clock tampering?).")

    # 7. GPS vs complaint location --------------------------------------------------
    if exif.get("gps") and latitude is not None and longitude is not None:
        km = _haversine_km(exif["gps"], (latitude, longitude))
        if km > 10:
            add("GPS_MISMATCH", 0.50, f"Photo GPS location is {km:.0f} km away from the complaint location.")
        elif km > 1:
            add("GPS_MISMATCH", 0.30, f"Photo GPS location is {km:.1f} km away from the complaint location.")

    # 8. Resolution / camera data --------------------------------------------------
    if max(w, h) < 300:
        add("LOW_RESOLUTION", 0.20, f"Very small image ({w}x{h}) - typical of a web thumbnail.")
    if not exif.get("make") and not exif.get("model") and not any(s["code"] == "SCREENSHOT" for s in signals):
        add("NO_CAMERA_DATA", 0.08, "No camera make/model in metadata (may also be stripped by WhatsApp).")

    # combine (noisy-OR) -----------------------------------------------------------
    risk = 1.0
    for s in signals:
        risk *= (1 - min(max(s["weight"], 0), 0.99))
    risk = 1 - risk
    verdict = "LIKELY_FAKE" if risk >= LIKELY_FAKE_AT else ("SUSPICIOUS" if risk >= SUSPICIOUS_AT else "AUTHENTIC")
    signals.sort(key=lambda s: -s["weight"])

    exif_summary = {k: (str(v) if k != "gps" else [round(v[0], 6), round(v[1], 6)])
                    for k, v in exif.items() if k in ("make", "model", "software", "datetime_original", "gps")}
    return {
        "risk_score": round(risk, 4),
        "verdict": verdict,
        "signals": signals,
        "phash": perceptual_hash(img),
        "format": fmt,
        "width": w,
        "height": h,
        "exif": exif_summary,
        "ela": ela,
    }


if __name__ == "__main__":
    import sys
    import json
    for p in sys.argv[1:]:
        print(p, json.dumps(analyze_authenticity(p), indent=2))
