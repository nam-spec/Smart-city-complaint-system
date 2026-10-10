"""Distinctive keyword stems per category. A token matches if it STARTS WITH a stem.
Only words that strongly indicate ONE category are listed (no generic words like
'road', 'light', 'power', 'water', 'car'), so no category can overpower the others.
"""

LEXICON = {
    "fire": ["fire", "blaze", "flame", "ablaze", "burning", "burnt", "firefight", "fire brigade",
             "fire tender", "inferno", "explosion", "blast", "charred", "आग", "ज्वाला", "धूर", "विस्तव", "aag", "dhua"],
    "gas": ["gas", "lpg", "cng", "png", "cylinder", "methane", "propane", "regulator", "fume", "hissing",
            "गॅस", "गॅस गळती", "सिलेंडर", "gas leak", "galti"],
    "electric": ["electric", "electricity", "voltage", "blackout", "load shedding", "transformer", "fuse",
                 "streetlight", "street light", "lamp", "power cut", "power outage", "junction box",
                 "meter", "wire", "cable", "sparking", "bulb", "current", "वीज", "लाइट", "तार", "शॉर्ट सर्किट",
                 "bijli", "light nahi hai", "taar toot"],
    "water": ["tap", "drinking water", "water supply", "tanker", "hydrant", "pipeline", "water pressure",
              "water bill", "borewell", "booster", "muddy water", "contaminated water", "water tank",
              "पानी", "पाणी", "नळ", "पिण्याचे पाणी", "paani", "pani nahi aara"],
    "drainage": ["sewage", "sewer", "drain", "gutter", "nala", "nullah", "culvert", "waterlog", "septic",
                 "manhole overflow", "stagnant", "flooding", "clogged", "choked", "गटार", "नाला", "सांडपाणी",
                 "gutar", "gutar overflow", "nala jam", "तुंबले", "साचले", "saandpaani", "pani bhar"],
    "sanitation": ["garbage", "trash", "dustbin", "dumpster", "litter", "sweeper", "waste", "rubbish",
                   "carcass", "toilet", "dumping", "stink", "unhygienic", "filth", "कचरा", "घाण", "उकिरडा",
                   "कचऱ्याची", "कचरापेटी", "kachra", "kachra gaddi", "badboo", "साचला", "kuda", "gandagi"],
    "road": ["pothole", "asphalt", "tar", "gravel", "speed breaker", "sinkhole", "manhole", "footpath",
             "pavement", "crater", "ditch", "pitted", "carriageway", "divider", "खड्डा", "रस्ता", "पाथवे",
             "khadda", "khatta", "road kharab", "gadda"],
    "traffic": ["traffic", "parking", "parked", "signal", "jam", "congestion", "gridlock", "honk",
                "zebra crossing", "driveway", "double park", "overspeed", "wrong side", "bottleneck",
                "ट्रॅफिक", "वाहतूक", "गाड्या", "traffic jam", "gaadi parking"],
    "noise": ["noise", "noisy", "loud", "music", "loudspeaker", "speaker", "amplifier", "dj", "bass",
              "barking", "firecracker", "decibel", "blaring", "drilling", "आवाज", "ध्वनी", "लाउडस्पीकर",
              "aawaz", "shor", "dj sound"],
    "housing": ["crack", "plaster", "ceiling", "seepage", "dampness", "balcony", "leaning", "dilapidated",
                "structural", "foundation", "lift", "slab", "terrace", "railing", "society", "भिंत", "छत",
                "इमारत", "chhat", "deewar crack"],
    "environment": ["tree", "branch", "bush", "sapling", "garden", "park", "playground", "foliage",
                    "uprooted", "lake", "green belt", "weed", "plantation", "grass", "झाड", "झाडाची फांदी",
                    "zhaad", "ped gir gaya"],
    "pollution": ["pollut", "effluent", "chimney", "emission", "smog", "air quality", "dust", "toxic",
                  "chemical", "untreated", "oil spill", "foam", "discharge", "soot", "unbreathable",
                  "प्रदूषण", "धूर", "विषारी हवा", "dhua", "hawa kharab"],
    "animals": ["stray", "dog", "cattle", "cow", "monkey", "snake", "bull", "buffalo", "boar", "animal",
                "beehive", "bite", "pigeon", "rabies", "कुत्रा", "भटकणारे कुत्रे", "माकड", "साप",
                "kutte", "kutta katne"],
    "public_transport": ["bus", "metro", "railway", "station", "rickshaw", "taxi", "shuttle", "conductor",
                         "commuter", "fare", "depot", "route", "cab", "train", "बस", "रिक्षा", "रेल्वे",
                         "bus timing", "auto rickshaw"],
    "encroachment": ["encroach", "hawker", "vendor", "illegal shop", "unauthori", "hoarding", "banner",
                     "stall", "slum", "occupying", "illegal construction", "public land", "shed",
                     "अतिक्रमण", "फेरीवाले", "अनधिकृत बांधकाम", "kabza", "footpath encroach"],
    "public_safety": ["theft", "thief", "burglary", "snatch", "harass", "eve teasing", "crime", "unsafe",
                      "cctv", "patrol", "police", "drunk", "gambling", "drug", "robbery", "violence",
                      "liquor", "loiter", "चोरी", "दरोडा", "गुन्हेगारी", "सुरक्षा", "chori", "maar peet"],
    "health": ["mosquito", "dengue", "malaria", "typhoid", "diarrhea", "outbreak", "hospital", "doctor",
               "medicine", "ambulance", "vaccin", "fogging", "disease", "clinic", "pest", "rats", "infestation",
               "डास", "डेंग्यू", "मलेरिया", "औषधफवारणी", "dengue machhar", "dawa spray"],
}


def keyword_scores(text, categories):
    """Return a normalized vector (sums to 1, or all zeros if no keyword hit).
    Each category's hit count is capped at 2, so a long keyword list cannot dominate."""
    import numpy as np
    from text_normalizer import tokenize
    low = text.lower()
    # NOTE: re.findall(r"\w+") splits Devanagari words at vowel signs ("गटार" -> "गट", "र"),
    # so Marathi/Hindi keywords never matched. tokenize() keeps whole Devanagari words.
    tokens = tokenize(low)
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