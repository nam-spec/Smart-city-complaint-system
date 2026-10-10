import os
import random
import numpy as np
import pandas as pd
import joblib
import json
from keywords import LEXICON
from multilingual_corpus import MULTILINGUAL_CORPUS
from text_normalizer import augment_for_model
from sklearn.pipeline import Pipeline, FeatureUnion
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, accuracy_score

random.seed(42)
np.random.seed(42)

SAMPLES_PER_CATEGORY = 500   # identical for every category -> no class overpowers
HELD_OUT_PER_CATEGORY = 3    # complaint phrases NEVER seen in training (honest test)

# Each category: list of distinct core complaints. The LAST 3 of each are held out for testing.
CORPUS = {
    "fire": [
        "fire outbreak in building with smoke and flames rising",
        "shop caught fire blaze spreading rapidly",
        "transformer caught fire with loud explosion and sparks",
        "gas cylinder blast in kitchen house is burning",
        "vehicle burning fiercely on highway",
        "garbage dump on fire toxic smoke filling area",
        "factory chemical storage burning need fire brigade",
        "dense black smoke in staircase residents trapped",
        "warehouse burning uncontrollably",
        "flames coming out of apartment balcony",
        "dry grass fire spreading near houses",
        "fire emergency send fire tender immediately",
        "smoke pouring out of basement parking",
        "godown ablaze firefighters needed",
    ],
    "gas": [
        "strong gas leakage smell from underground pipe",
        "lpg cylinder leaking in kitchen",
        "pngas pipeline leak near restaurant",
        "gas line punctured during road digging gas escaping",
        "gas regulator hissing high pressure leak",
        "commercial cylinder valve leaking in hotel kitchen",
        "gas smell in building basement",
        "industrial gas leakage evacuation required",
        "smell of cooking gas in the whole staircase",
        "toxic fumes causing nausea and eye irritation from factory",
        "cng pipeline joint leaking at petrol pump",
        "rotten egg smell of gas outside our society",
        "gas meter leaking near my flat",
        "suspected methane leak in the lane",
    ],
    "electric": [
        "power cut in our area for three hours",
        "electricity outage without notice",
        "street lights not working whole road dark at night",
        "voltage fluctuation damaging home appliances",
        "electric pole wire sparking on sidewalk",
        "open junction box with exposed live wires",
        "frequent load shedding in colony",
        "street light flickering all night",
        "no current in building complete blackout",
        "hanging electric cables touching tree branches",
        "fuse blown at distribution box no electricity",
        "low voltage lights dim and fans slow",
        "electric meter tripping again and again",
        "lamp post bulb fused near bus stop",
    ],
    "water": [
        "no drinking water supply since morning",
        "main water pipeline burst flooding street",
        "clean water leaking from municipal pipe",
        "contaminated brown water from tap with foul smell",
        "very low water pressure no water in tank",
        "water tanker required pump at booster station failed",
        "tap running dry municipal valve closed",
        "no municipal water supply for two days",
        "water gushing from broken fire hydrant",
        "drinking water pipeline damaged during road work",
        "dirty muddy tap water health risk",
        "water supply timing irregular in our building",
        "water meter reading wrong bill too high",
        "water line valve stuck colony has water crisis",
    ],
    "drainage": [
        "sewage overflow on the street",
        "storm water drain clogged flooding roads",
        "drain blocked water logging near my house",
        "sewer line choked dirty water entering bathroom",
        "open nala overflowing after rain",
        "manhole overflowing with sewage water",
        "drainage water backing up into ground floor",
        "gutter blocked and dirty water stagnating",
        "sewer smell and leakage from broken drain pipe",
        "waterlogging in the underpass after light rain",
        "chamber overflow near school sewage on road",
        "clogged culvert causing flooding in lane",
        "septic waste flowing on public road",
        "rainwater not draining from society compound",
    ],
    "sanitation": [
        "garbage overflowing at street corner stinking",
        "trash not collected for four days",
        "dead animal carcass lying on road",
        "illegal dumping of waste on empty plot",
        "public dustbin broken garbage scattered",
        "waste accumulating near market unhygienic",
        "sweeper has not cleaned the street",
        "rotting waste emitting foul odor and flies",
        "construction debris dumped on sidewalk",
        "dumpster overflowing near school entrance",
        "garbage truck skipping our lane",
        "public toilet dirty and unusable",
        "sanitary waste thrown openly on road",
        "litter and plastic bags all over the street",
    ],
    "road": [
        "deep pothole on main road causing accidents",
        "broken asphalt with loose gravel",
        "open uncovered manhole on road hazard for two wheelers",
        "sinkhole forming in middle of street",
        "speed breaker damaged and unpainted",
        "craters on road after heavy rain",
        "road digging left incomplete uneven surface",
        "road divider collapsed damaging tyres",
        "huge ditches and bumps on the street",
        "tar peeled off at busy junction road bumpy",
        "footpath tiles broken pedestrians tripping",
        "road surface eroded iron rods exposed",
        "missing manhole cover on carriageway",
        "newly laid road already cracked and caved in",
    ],
    "traffic": [
        "illegal parking on both sides blocking two lanes",
        "traffic signal not working causing jam",
        "abandoned vehicle parked on footpath for months",
        "car parked blocking my driveway",
        "heavy congestion because of haphazard parking",
        "wrong side driving near intersection",
        "delivery trucks double parked blocking bus stop",
        "signal blinking yellow chaos at junction",
        "vehicles parked on zebra crossing",
        "auto rickshaws stopping in middle of road jam",
        "no traffic police at rush hour intersection gridlock",
        "tempo blocking society gate",
        "vehicles overspeeding in school zone",
        "no parking zone violated daily at market",
    ],
    "noise": [
        "loud music late at night after midnight",
        "loudspeakers blaring disturbing sleep and study",
        "construction drilling noise at midnight",
        "constant honking and modified silencer noise",
        "factory machine noise in quiet residential area",
        "pub playing loud bass shaking walls",
        "neighbour's dogs barking all night",
        "generator noise running all night",
        "event using sound amplifiers without permission",
        "late night dj in open ground",
        "banging noise from workshop at 2 am",
        "wedding band playing loudly till late",
        "loud firecrackers bursting at night",
        "noisy party in the flat above us",
    ],
    "housing": [
        "cracks on load bearing walls of the building",
        "balcony railing loose risk of falling",
        "ceiling plaster falling and dampness on walls",
        "broken window frames and damaged door in flat",
        "illegal modification on terrace weakening pillar",
        "corroded staircase railing and broken tiles",
        "building wall leaning dangerously",
        "seepage from ceiling damaging wiring",
        "paint and plaster peeling due to leakage",
        "foundation showing visible fissures unsafe structure",
        "lift in building not working for weeks",
        "dilapidated old building may collapse in monsoon",
        "society refuses to repair leaking roof",
        "slab of terrace has developed cracks",
    ],
    "environment": [
        "huge tree uprooted blocking main road",
        "overgrown bushes blocking street light and view",
        "dead heavy branch dangling over school gate",
        "unpruned park trees touching power lines",
        "fallen tree trunk crushed parked car",
        "trees being cut illegally in the garden",
        "public park neglected grass overgrown",
        "playground equipment broken in garden",
        "lake surface covered with weeds and hyacinth",
        "tree cutting without permission near society",
        "branches fell on road after storm",
        "no maintenance of green belt along highway",
        "garden benches broken and lights off in park",
        "sapling plantation needed along the road",
    ],
    "pollution": [
        "thick black smoke from factory chimney polluting air",
        "burning of plastic and rubbish causing air pollution",
        "chemical effluent discharged into river",
        "dust from construction site covering houses",
        "foul smelling chemical odor from industrial unit",
        "air quality very poor breathing problem",
        "oil spill and industrial waste in the nala",
        "open burning of leaves choking the neighborhood",
        "river water turned black from untreated discharge",
        "cement plant dust making air unbreathable",
        "fumes from illegal dye unit near homes",
        "smog and vehicle emissions near the highway",
        "toxic foam floating on the lake",
        "crematorium smoke drifting into homes",
    ],
    "animals": [
        "stray dogs attacking pedestrians",
        "pack of street dogs chasing children",
        "stray cattle sitting on the road",
        "monkeys entering houses and snatching food",
        "cow blocking the lane and roaming freely",
        "snake found inside the housing society",
        "dog bite incident need animal catcher",
        "wild boar roaming near the colony",
        "stray bulls fighting on the main road",
        "pigeon droppings and dead birds in the building",
        "stray dogs barking and biting at night",
        "buffaloes left on public road by owners",
        "beehive on the school building",
        "injured stray animal needs rescue",
    ],
    "public_transport": [
        "bus not arriving on time on our route",
        "bus stop shelter broken no seating",
        "auto rickshaw drivers refusing to go by meter",
        "overcrowded local bus service too few buses",
        "bus driver rash driving passengers scared",
        "metro station escalator not working",
        "railway station foot over bridge in poor condition",
        "taxi overcharging and refusing passengers",
        "no bus service to our new sector",
        "bus conductor misbehaved with passengers",
        "cancelled buses no information at the depot",
        "bus stop has no route board or lighting",
        "shuttle service stopped without notice",
        "ticket machine at station out of order",
    ],
    "encroachment": [
        "hawkers occupying footpath entirely",
        "illegal shops built on public land",
        "unauthorized construction on government plot",
        "shopkeeper extended shed onto the road",
        "encroachment on the drain path by houses",
        "illegal hoarding put up without permission",
        "temporary stalls blocking pedestrian walkway",
        "builder occupying the common open space",
        "illegal slum expansion on park land",
        "road narrowed by unauthorised structure",
        "fruit carts taking over entire pavement",
        "wall built over public access lane",
        "illegal banners and posters on public property",
        "shop goods displayed on the footpath",
    ],
    "public_safety": [
        "chain snatching incidents in our lane",
        "group of drunk men harassing women near station",
        "theft and burglary in the colony no patrolling",
        "no cctv cameras in the crowded market",
        "street is unsafe at night no police presence",
        "gambling and drug dealing near the school",
        "eve teasing outside college gate",
        "suspicious people loitering around the society",
        "vehicle theft reported repeatedly in the area",
        "fight and violence on the street every night",
        "women feel unsafe in the dark subway",
        "bike thieves active in parking",
        "street lights and police patrol needed to stop crime",
        "illegal liquor den operating in the neighborhood",
    ],
    "health": [
        "mosquito breeding in stagnant water dengue cases rising",
        "outbreak of diarrhea in the locality",
        "malaria cases reported need fumigation",
        "no doctor at the government health center",
        "medicines unavailable at the public hospital",
        "ambulance took too long to arrive",
        "hospital waste dumped outside clinic",
        "food stalls selling stale unhygienic food",
        "fogging needed against mosquitoes",
        "rats and pests infestation in the market",
        "vaccination camp not organised in our ward",
        "unhygienic slaughterhouse spreading disease",
        "primary health center dirty and understaffed",
        "typhoid cases due to contaminated food",
    ],
}

# Generic context added to ALL categories equally, so it carries no class signal.
PREFIXES = ["", "", "", "urgent: ", "please resolve: ", "complaint: ", "citizen report: ",
            "high priority: ", "attention needed: ", "kindly look into this: ", "sir, "]
SUFFIXES = ["", "", "", " at main road junction", " in our residential sector", " near the school",
            " causing severe inconvenience", " immediate action needed", " in front of my building",
            " near the market area", " since yesterday", " for the last few days", " in our ward",
            " near the bus stop", " please help"]


def typo(word):
    if len(word) > 4 and random.random() < 0.5:
        i = random.randrange(len(word) - 1)
        word = word[:i] + word[i + 1] + word[i] + word[i + 2:]
    return word


def augment(phrase):
    words = phrase.split()
    if len(words) > 5:
        words = [w for w in words if random.random() > 0.12] or phrase.split()
    if random.random() < 0.2:
        words = [typo(w) for w in words]
    text = f"{random.choice(PREFIXES)}{' '.join(words)}{random.choice(SUFFIXES)}".strip()
    r = random.random()
    if r < 0.05:
        text = text.upper()
    elif r < 0.10:
        text = text.capitalize()
    return text


def lexicon_sample(cat):
    """Short keyword-style complaint built from distinctive words of ONE category."""
    words = random.sample(LEXICON[cat], k=random.randint(1, 3))
    return augment(" ".join(words))


def build(cat, phrases, n, lexicon_share=0.35):
    n_lex = int(n * lexicon_share)
    rows = [augment(random.choice(phrases)) for _ in range(n - n_lex)]
    rows += [lexicon_sample(cat) for _ in range(n_lex)]
    return rows


print("=" * 70)
print("Smart City Complaint Classifier - balanced training")
print("=" * 70)

MULTI_HELD_OUT = 2           # multilingual phrases per category held out for the test split
MULTI_SHARE = 0.30           # share of each category's samples drawn from Hinglish/Marathi/Hindi phrases


def build_multi(phrases, n):
    rows = []
    for _ in range(n):
        p = random.choice(phrases)
        words = p.split()
        if len(words) > 5:
            words = [w for w in words if random.random() > 0.12] or p.split()
        rows.append(" ".join(words))
    return rows


train_rows, test_rows = [], []
for cat, phrases in CORPUS.items():
    train_p, test_p = phrases[:-HELD_OUT_PER_CATEGORY], phrases[-HELD_OUT_PER_CATEGORY:]
    multi = MULTILINGUAL_CORPUS.get(cat, [])
    m_train, m_test = multi[:-MULTI_HELD_OUT], multi[-MULTI_HELD_OUT:]
    n_multi = int(SAMPLES_PER_CATEGORY * MULTI_SHARE) if m_train else 0
    for t in build(cat, train_p, SAMPLES_PER_CATEGORY - n_multi):
        train_rows.append((t, cat))
    for t in build_multi(m_train, n_multi):
        train_rows.append((t, cat))
    for p in test_p:                       # held-out phrases, unaugmented + light augmentation
        test_rows.append((p, cat))
        for _ in range(4):
            test_rows.append((augment(p), cat))
    for p in m_test:
        test_rows.append((p, cat))

train_df = pd.DataFrame(train_rows, columns=["text", "category"])
test_df = pd.DataFrame(test_rows, columns=["text", "category"])
print(f"Categories: {len(CORPUS)} | train samples: {len(train_df)} (equal per class) | test samples: {len(test_df)}")

pipeline = Pipeline([
    ("features", FeatureUnion([
        ("word", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, lowercase=True)),
        ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True, lowercase=True)),
    ])),
    ("clf", LogisticRegression(C=3.0, class_weight="balanced", max_iter=2000)),
])
# The classifier sees the normalised text + its English gloss (see text_normalizer.py),
# exactly as app.py feeds it at prediction time.
pipeline.fit(train_df["text"].map(augment_for_model), train_df["category"])

pred = pipeline.predict(test_df["text"].map(augment_for_model))
print("\n" + "=" * 70)
print("Evaluation on HELD-OUT complaint phrases (never seen in training)")
print("=" * 70)
print(f"Accuracy: {accuracy_score(test_df['category'], pred):.3f}\n")
print(classification_report(test_df["category"], pred, zero_division=0))

# Independent hand-written sentences (different wording from the corpus)
CHECKS = [
    ("there is a big fire in the market and people are running", "fire"),
    ("smell of lpg in my house please send someone", "gas"),
    ("we have had no electricity since last evening", "electric"),
    ("street lamp near my house has stopped glowing", "electric"),
    ("our tap has no water since two days", "water"),
    ("sewer is overflowing in front of the temple", "drainage"),
    ("garbage has not been picked up for a week", "sanitation"),
    ("a huge pothole has formed near the signal", "road"),
    ("cars are parked illegally and blocking the entire lane", "traffic"),
    ("neighbours play very loud music every night", "noise"),
    ("walls of my flat have big cracks", "housing"),
    ("tree fell on the road after the storm", "environment"),
    ("factory releasing black smoke making it hard to breathe", "pollution"),
    ("street dogs are chasing kids on the way to school", "animals"),
    ("bus on route 12 never comes on time", "public_transport"),
    ("vendors have taken over the whole footpath", "encroachment"),
    ("someone snatched a chain from a woman in our lane", "public_safety"),
    ("many people have dengue because of stagnant water", "health"),
]
print("=" * 70)
print("Independent sanity checks")
print("=" * 70)
ok = 0
for text, exp in CHECKS:
    proba = pipeline.predict_proba([augment_for_model(text)])[0]
    p = pipeline.classes_[proba.argmax()]
    ok += p == exp
    print(f"[{'PASS' if p == exp else 'FAIL'}] pred={p:<17} conf={proba.max():.2f} exp={exp:<17} | {text}")
print(f"\n{ok}/{len(CHECKS)} passed")

# Final model: refit on ALL phrases (including the held-out ones) for deployment
final_rows = []
for cat, phrases in CORPUS.items():
    multi = MULTILINGUAL_CORPUS.get(cat, [])
    n_multi = int(SAMPLES_PER_CATEGORY * MULTI_SHARE) if multi else 0
    final_rows += [(t, cat) for t in build(cat, phrases, SAMPLES_PER_CATEGORY - n_multi)]
    final_rows += [(t, cat) for t in build_multi(multi, n_multi)]
final_df = pd.DataFrame(final_rows, columns=["text", "category"])
pipeline.fit(final_df["text"].map(augment_for_model), final_df["category"])
print("\nRefit final model on all phrases.")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "model")
os.makedirs(MODEL_DIR, exist_ok=True)
joblib.dump(pipeline, os.path.join(MODEL_DIR, "pipeline.pkl"))
print(f"\nSaved pipeline to {os.path.join(MODEL_DIR, 'pipeline.pkl')}")

# Prototype phrases for the multilingual sentence encoder in app.py (nearest-prototype scoring).
prototypes = [{"text": p, "category": c} for c, ps in CORPUS.items() for p in ps]
prototypes += [{"text": p, "category": c} for c, ps in MULTILINGUAL_CORPUS.items() for p in ps]
with open(os.path.join(MODEL_DIR, "prototypes.json"), "w", encoding="utf-8") as f:
    json.dump({"preprocess": "augment_for_model_v1", "prototypes": prototypes}, f, ensure_ascii=False, indent=1)
print(f"Saved {len(prototypes)} encoder prototypes to model/prototypes.json")