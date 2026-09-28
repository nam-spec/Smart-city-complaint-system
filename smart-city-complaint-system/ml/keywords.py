"""Distinctive keyword stems per category. A token matches if it STARTS WITH a stem.
Only words that strongly indicate ONE category are listed (no generic words like
'road', 'light', 'power', 'water', 'car'), so no category can overpower the others.
"""

LEXICON = {
    "fire": ["fire", "blaze", "flame", "ablaze", "burning", "burnt", "firefight", "fire brigade",
             "fire tender", "inferno", "explosion", "blast", "charred"],
    "gas": ["gas", "lpg", "cng", "png", "cylinder", "methane", "propane", "regulator", "fume", "hissing"],
    "electric": ["electric", "electricity", "voltage", "blackout", "load shedding", "transformer", "fuse",
                 "streetlight", "street light", "lamp", "power cut", "power outage", "junction box",
                 "meter", "wire", "cable", "sparking", "bulb", "current"],
    "water": ["tap", "drinking water", "water supply", "tanker", "hydrant", "pipeline", "water pressure",
              "water bill", "borewell", "booster", "muddy water", "contaminated water", "water tank"],
    "drainage": ["sewage", "sewer", "drain", "gutter", "nala", "nullah", "culvert", "waterlog", "septic",
                 "manhole overflow", "stagnant", "flooding", "clogged", "choked"],
    "sanitation": ["garbage", "trash", "dustbin", "dumpster", "litter", "sweeper", "waste", "rubbish",
                   "carcass", "toilet", "dumping", "stink", "unhygienic", "filth"],
    "road": ["pothole", "asphalt", "tar", "gravel", "speed breaker", "sinkhole", "manhole", "footpath",
             "pavement", "crater", "ditch", "pitted", "carriageway", "divider"],
    "traffic": ["traffic", "parking", "parked", "signal", "jam", "congestion", "gridlock", "honk",
                "zebra crossing", "driveway", "double park", "overspeed", "wrong side", "bottleneck"],
    "noise": ["noise", "noisy", "loud", "music", "loudspeaker", "speaker", "amplifier", "dj", "bass",
              "barking", "firecracker", "decibel", "blaring", "drilling"],
    "housing": ["crack", "plaster", "ceiling", "seepage", "dampness", "balcony", "leaning", "dilapidated",
                "structural", "foundation", "lift", "slab", "terrace", "railing", "society"],
    "environment": ["tree", "branch", "bush", "sapling", "garden", "park", "playground", "foliage",
                    "uprooted", "lake", "green belt", "weed", "plantation", "grass"],
    "pollution": ["pollut", "effluent", "chimney", "emission", "smog", "air quality", "dust", "toxic",
                  "chemical", "untreated", "oil spill", "foam", "discharge", "soot", "unbreathable"],
    "animals": ["stray", "dog", "cattle", "cow", "monkey", "snake", "bull", "buffalo", "boar", "animal",
                "beehive", "bite", "pigeon", "rabies"],
    "public_transport": ["bus", "metro", "railway", "station", "rickshaw", "taxi", "shuttle", "conductor",
                         "commuter", "fare", "depot", "route", "cab", "train"],
    "encroachment": ["encroach", "hawker", "vendor", "illegal shop", "unauthori", "hoarding", "banner",
                     "stall", "slum", "occupying", "illegal construction", "public land", "shed"],
    "public_safety": ["theft", "thief", "burglary", "snatch", "harass", "eve teasing", "crime", "unsafe",
                      "cctv", "patrol", "police", "drunk", "gambling", "drug", "robbery", "violence",
                      "liquor", "loiter"],
    "health": ["mosquito", "dengue", "malaria", "typhoid", "diarrhea", "outbreak", "hospital", "doctor",
               "medicine", "ambulance", "vaccin", "fogging", "disease", "clinic", "pest", "rats", "infestation"],
}


def keyword_scores(text, categories):
    """Return a normalized vector (sums to 1, or all zeros if no keyword hit).
    Each category's hit count is capped at 2, so a long keyword list cannot dominate."""
    import re
    import numpy as np
    low = text.lower()
    tokens = re.findall(r"[a-z]+", low)
    hits = np.zeros(len(categories))
    for i, cat in enumerate(categories):
        n = 0
        for stem in LEXICON.get(cat, []):
            if " " in stem:
                n += stem in low
            else:
                n += any(t.startswith(stem) for t in tokens)
        hits[i] = min(n, 2)
    total = hits.sum()
    return hits / total if total > 0 else hits