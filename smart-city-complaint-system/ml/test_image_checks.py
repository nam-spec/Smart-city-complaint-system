"""Tests for fake-image detection and the text/image veracity decision.

Builds synthetic test images (camera photo, Photoshop-edited, Stable-Diffusion PNG,
screenshot, old photo taken elsewhere, spliced JPEG) and checks the verdicts.
The CLIP part is replaced by a stub so this runs without downloading model weights;
run `python clip_verifier.py` separately to check the real CLIP model loads.

Run:  python test_image_checks.py
"""
import io
import os
import sys
import tempfile
from datetime import datetime, timedelta

import numpy as np
from PIL import Image, ImageFilter, PngImagePlugin

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import clip_verifier as cv  # noqa: E402
import veracity  # noqa: E402
from fake_detector import analyze_authenticity, hamming_hex  # noqa: E402

LAT, LNG = 19.0760, 72.8777
TMP = tempfile.mkdtemp()


def scene(w=1600, h=1200, seed=0):
    r = np.random.default_rng(seed)
    y, x = np.mgrid[0:h, 0:w]
    base = np.stack([120 + 60 * np.sin(x / 90 + seed) + 30 * np.cos(y / 70),
                     110 + 50 * np.cos(x / 60) + 20 * np.sin(y / 40 + seed),
                     90 + 40 * np.sin((x + y) / 120)], -1)
    base += r.normal(0, 12, base.shape)
    return Image.fromarray(np.clip(base, 0, 255).astype("uint8")).filter(ImageFilter.GaussianBlur(1.2))


def exif(make=True, software=None, taken=None, gps=None):
    ex = Image.Exif()
    if make:
        ex[271], ex[272] = "samsung", "SM-A525F"
    if software:
        ex[305] = software
    if taken:
        ex[306] = taken.strftime("%Y:%m:%d %H:%M:%S")
        ex.get_ifd(0x8769)[36867] = taken.strftime("%Y:%m:%d %H:%M:%S")
    if gps:
        def dms(v):
            v = abs(v); d = int(v); m = int((v - d) * 60)
            return (d, m, round(((v - d) * 60 - m) * 60, 4))
        g = ex.get_ifd(0x8825)
        g[1], g[2], g[3], g[4] = "N", dms(gps[0]), "E", dms(gps[1])
    return ex


def path(name):
    return os.path.join(TMP, name)


def build_images():
    now = datetime.now()
    scene().save(path("genuine.jpg"), "JPEG", quality=88, exif=exif(taken=now - timedelta(hours=2), gps=(LAT, LNG)))
    scene(seed=1).save(path("photoshop.jpg"), "JPEG", quality=88,
                       exif=exif(software="Adobe Photoshop 25.0 (Windows)", taken=now - timedelta(hours=3)))
    info = PngImagePlugin.PngInfo()
    info.add_text("parameters", "a pothole on an indian road, photorealistic\nSteps: 30, Sampler: DPM++ 2M")
    scene(1024, 1024, 2).save(path("sd_generated.png"), pnginfo=info)
    scene(1080, 2340, 3).save(path("screenshot.png"))
    scene(seed=4).save(path("old_far.jpg"), "JPEG", quality=88,
                       exif=exif(taken=datetime(2019, 5, 3, 10, 0), gps=(18.5204, 73.8567)))
    bg = scene(seed=5)
    b = io.BytesIO(); bg.save(b, "JPEG", quality=55); bg = Image.open(b).convert("RGB")
    bg.paste(scene(400, 300, 9), (600, 450))
    bg.save(path("spliced.jpg"), "JPEG", quality=95, exif=exif(taken=now - timedelta(hours=1)))
    scene().resize((1280, 960)).save(path("genuine_resent_on_whatsapp.jpg"), "JPEG", quality=75)
    scene(738, 1599, 8).save(path("phone_screenshot_as_jpeg.jpg"), "JPEG", quality=80)
    scene(1080, 1920, 10).save(path("portrait_16x9_photo.jpg"), "JPEG", quality=85,
                                exif=exif(taken=now - timedelta(hours=1)))


def check(name, expected_verdicts, expected_code=None):
    r = analyze_authenticity(path(name), latitude=LAT, longitude=LNG)
    codes = [s["code"] for s in r["signals"]]
    ok = r["verdict"] in expected_verdicts and (expected_code is None or expected_code in codes)
    print(f"[{'PASS' if ok else 'FAIL'}] {name:32} {r['verdict']:12} risk={r['risk_score']:.2f} {codes}")
    return ok, r


class FakeClip:
    """Stub replacing CLIP: returns a fixed image category distribution."""
    def __init__(self, probs):
        self.probs = probs

    def install(self):
        labels = cv.CATEGORIES + [cv.NON_CIVIC]
        probs = {l: self.probs.get(l, 0.001) for l in labels}
        tot = sum(probs.values()); probs = {k: v / tot for k, v in probs.items()}
        top = max(probs, key=probs.get)
        cv.classify_image = lambda img: {"category": top, "confidence": probs[top],
                                         "top_predictions": [{"category": top, "score": probs[top]}],
                                         "probabilities": probs, "non_civic_probability": probs[cv.NON_CIVIC],
                                         "_embedding": np.zeros(4)}
        cv.text_image_similarity = lambda emb, t: 0.27 if probs.get(t, 0) > 0.25 else 0.16
        cv.ai_generated_probability = lambda emb: 0.2


def run():
    build_images()
    results = []
    print("=" * 70); print("Forensic authenticity checks"); print("=" * 70)
    results.append(check("genuine.jpg", {"AUTHENTIC"})[0])
    results.append(check("genuine_resent_on_whatsapp.jpg", {"AUTHENTIC"})[0])
    results.append(check("photoshop.jpg", {"SUSPICIOUS", "LIKELY_FAKE"}, "EDITING_SOFTWARE")[0])
    results.append(check("sd_generated.png", {"LIKELY_FAKE"}, "AI_METADATA")[0])
    results.append(check("screenshot.png", {"SUSPICIOUS", "LIKELY_FAKE"}, "SCREENSHOT")[0])
    results.append(check("old_far.jpg", {"LIKELY_FAKE"}, "GPS_MISMATCH")[0])
    results.append(check("spliced.jpg", {"SUSPICIOUS", "LIKELY_FAKE"}, "ELA_TAMPERING")[0])
    results.append(check("phone_screenshot_as_jpeg.jpg", {"SUSPICIOUS", "LIKELY_FAKE"}, "SCREENSHOT")[0])
    results.append(check("portrait_16x9_photo.jpg", {"AUTHENTIC"})[0])

    a = analyze_authenticity(path("genuine.jpg"))["phash"]
    b = analyze_authenticity(path("genuine_resent_on_whatsapp.jpg"))["phash"]
    d = hamming_hex(a, b)
    ok = d <= 6
    print(f"[{'PASS' if ok else 'FAIL'}] same photo resized+recompressed -> pHash distance {d} (duplicate if <= 6)")
    results.append(ok)

    print("\n" + "=" * 70); print("Text <-> image decision (CLIP stubbed)"); print("=" * 70)
    cases = [
        ("pothole photo + pothole text", {"road": 0.8, "traffic": 0.1}, "genuine.jpg", "road", "VERIFIED"),
        ("pothole photo + garbage text", {"road": 0.85, "traffic": 0.1}, "genuine.jpg", "sanitation", "FAKE_MISMATCH"),
        ("waterlogging photo + drain text", {"drainage": 0.3, "water": 0.25, "road": 0.3}, "genuine.jpg", "drainage", None),
        ("receipt photo + water text", {cv.NON_CIVIC: 0.9}, "genuine.jpg", "water", "FAKE_MISMATCH"),
        ("AI pothole + pothole text", {"road": 0.8}, "sd_generated.png", "road", "LIKELY_FAKE"),
        ("old photo elsewhere", {"road": 0.8}, "old_far.jpg", "road", "LIKELY_FAKE"),
    ]
    for label, probs, img, text_cat, expected in cases:
        FakeClip(probs).install()
        r = veracity.assess_complaint_image(path(img), text_category=text_cat, english_text=text_cat,
                                            latitude=LAT, longitude=LNG)
        ok = (r["veracity_status"] == expected) if expected else r["veracity_status"] in ("VERIFIED", "SUSPICIOUS")
        if expected == "FAKE_MISMATCH":
            ok = ok and r["fake_signals"][0]["code"] in ("NON_CIVIC_CONTENT", "CATEGORY_MISMATCH")
        results.append(ok)
        print(f"[{'PASS' if ok else 'FAIL'}] {label:34} -> {r['veracity_status']:13} match={r['text_image_match']} "
              f"risk={r['fake_risk_score']:.2f} factor={r['priority_factor']}")
    print(f"\n{sum(results)}/{len(results)} passed")
    return all(results)


if __name__ == "__main__":
    assert run(), "image checks failed"
    print("PASSED")
