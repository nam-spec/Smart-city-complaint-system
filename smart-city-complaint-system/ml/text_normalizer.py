"""Multilingual text normalisation for civic complaints.

Handles four ways citizens actually write:
  * English
  * Hinglish        (Hindi written in Roman script, e.g. "paani nahi aa raha h")
  * Marathi / Hindi in Devanagari ("गटार तुंबले आहे", "नाली जाम है")
  * Romanised Marathi ("ghari pani yet nahi")

What it does
  1. Unicode-normalises and lower-cases the text, collapses stretched letters ("bahuttt").
  2. Tokenises WITHOUT breaking Devanagari words (Python's \\w splits words at vowel
     signs, so "गटार" became "गट" + "र" and Marathi keywords never matched).
  3. Canonicalises common Hinglish spelling variants (nhi/nai -> nahi, pani -> paani ...).
  4. Detects the language / script.
  5. Produces an English "gloss": distinctive Devanagari and romanised words are mapped to
     English civic keywords, so the English-trained models, the keyword prior and CLIP's
     (English-only) text encoder all understand Marathi and Hinglish complaints.
  6. Splits a complaint into CAUSE and EFFECT clauses using causal markers in all four
     languages ("due to", "ki wajah se", "के कारण", "-मुळे", "isliye", "त्यामुळे" ...),
     which is what root-cause classification is built on.
"""
import re
import unicodedata

# ---------------------------------------------------------------------------
# 1. Tokenisation
# ---------------------------------------------------------------------------
# A token is a run of letters, digits, Devanagari letters AND Devanagari combining marks
# (matras, virama, anusvara, nukta), plus the zero-width joiners used in Marathi "ऱ्य".
_TOKEN_RE = re.compile(r"[0-9a-zऀ-ॿ‌‍_]+")
_DEVANAGARI_RE = re.compile(r"[ऀ-ॿ]")
_LATIN_RE = re.compile(r"[a-z]")


def tokenize(text):
    return _TOKEN_RE.findall(text.lower())


# ---------------------------------------------------------------------------
# 2. Hinglish / romanised spelling canonicalisation  (variant -> canonical)
# ---------------------------------------------------------------------------
_SPELLING = {
    # function words
    "nhi": "nahi", "nai": "nahi", "nahin": "nahi", "nahee": "nahi", "nahi.": "nahi",
    "h": "hai", "he": "hai", "hain": "hai", "hay": "hai", "hae": "hai",
    "bohot": "bahut", "bhot": "bahut", "bahot": "bahut", "boht": "bahut",
    "mein": "me", "mai": "me", "main": "me",
    "rha": "raha", "rhi": "rahi", "rhe": "rahe",
    "gya": "gaya", "gyi": "gayi", "gayi": "gayi", "gai": "gayi",
    "kiya": "kiya", "kro": "karo", "krdo": "kardo",
    "plz": "please", "pls": "please", "plzz": "please",
    # civic nouns
    "pani": "paani", "panee": "paani", "paanee": "paani",
    "bijlee": "bijli", "bijali": "bijli", "bijly": "bijli",
    "kachara": "kachra", "kachda": "kachra", "kachrah": "kachra", "kachre": "kachra",
    "kooda": "kuda", "kudaa": "kuda", "koodaa": "kuda", "kooda-karkat": "kuda",
    "gaddha": "gaddha", "gadda": "gaddha", "gaddhe": "gaddha", "gadde": "gaddha", "gaddhon": "gaddha",
    "gaddho": "gaddha", "khada": "khadda", "khadde": "khadda", "khaddyan": "khadda", "khaddyanmule": "khadda mule",
    "gatar": "gutar", "gutter": "gutar", "gattar": "gutar", "gutters": "gutar",
    "naala": "nala", "nalla": "nala", "nallah": "nala", "nullah": "nala", "naali": "nali",
    "sarak": "sadak", "sadk": "sadak", "sadke": "sadak",
    "raasta": "rasta", "rastaa": "rasta", "rasta.": "rasta",
    "dhuan": "dhua", "dhuaan": "dhua", "dhuva": "dhua", "dhuwa": "dhua", "dhuan.": "dhua",
    "kuttey": "kutte", "kutton": "kutte", "kuttha": "kutta",
    "macchar": "machhar", "machar": "machhar", "macchhar": "machhar", "machchar": "machhar",
    "awaaz": "aawaz", "awaz": "aawaz", "avaaz": "aawaz", "aavaz": "aawaz",
    "aawara": "awara", "aavara": "awara", "awaara": "awara",
    "deewar": "deewar", "diwar": "deewar", "deewaar": "deewar", "diwaar": "deewar",
    "darar": "daraar", "daraar": "daraar",
    "dawai": "dawa", "davai": "dawa", "dava": "dawa",
    "jhaad": "zhaad", "jhad": "zhaad", "zaad": "zhaad", "zad": "zhaad",
    "kabja": "kabza", "qabza": "kabza", "kabjaa": "kabza",
}

# ---------------------------------------------------------------------------
# 3. Bilingual lexicon: stem -> English gloss
#    Devanagari stems match as token PREFIXES (Marathi/Hindi add suffixes:
#    "कचऱ्याची", "खड्ड्यांमुळे"), romanised stems match whole tokens or prefixes >= 4 chars.
#    Generic place words ("road", "street") deliberately get neutral glosses so they
#    don't drag every complaint into the 'road' category.
# ---------------------------------------------------------------------------
_DEV_LEXICON = [
    # fire
    ("आग", "fire"), ("ज्वाला", "fire flames"), ("लपट", "fire flames"), ("जळ", "burning fire"),
    ("जल रह", "burning fire"), ("जल गय", "burnt fire"), ("जलन", "burning"), ("अग्निशम", "fire brigade"),
    ("फायर", "fire"), ("स्फोट", "explosion blast"), ("विस्फोट", "explosion blast"), ("धूर", "smoke"),
    ("धुआ", "smoke"), ("धुंआ", "smoke"), ("धुँआ", "smoke"),
    # gas
    ("गॅस", "gas leak"), ("गैस", "gas leak"), ("सिलेंडर", "gas cylinder"), ("सिलिंडर", "gas cylinder"),
    ("गळती", "leak"), ("रिसाव", "leak"), ("वास", "smell"), ("गंध", "smell"), ("दुर्गंध", "stench stink"),
    # electric
    ("वीज", "electricity power"), ("बिजली", "electricity power"), ("लाइट", "electricity light"),
    ("लाईट", "electricity light"), ("दिवा", "street light lamp"), ("दिवे", "street light lamp"),
    ("बत्ती", "street light lamp"), ("खांब", "electric pole"), ("खंभ", "electric pole"), ("खम्ब", "electric pole"),
    ("तार", "electric wire"), ("ट्रान्सफॉर्मर", "transformer"), ("ट्रांसफार्मर", "transformer"),
    ("ट्रान्सफार्मर", "transformer"), ("करंट", "electric current shock"), ("शॉक", "electric shock"),
    ("शॉर्ट", "short circuit electric"), ("मीटर", "electric meter"), ("फ्यूज", "fuse electric"),
    ("अंधार", "dark no light"), ("अंधेर", "dark no light"), ("बल्ब", "bulb light"),
    # water
    ("पाणीपुरवठ", "water supply"), ("पाणी", "water"), ("पानी", "water"), ("नळ", "water tap"),
    ("नल", "water tap"), ("पाइपलाइन", "pipeline"), ("पाईपलाईन", "pipeline"), ("पाइप", "pipe"),
    ("पाईप", "pipe"), ("टँकर", "water tanker"), ("टैंकर", "water tanker"), ("टाकी", "water tank"),
    ("टंकी", "water tank"), ("पिण्याच", "drinking water"), ("पीने", "drinking water"),
    ("गढूळ", "muddy contaminated water"), ("पिवळ", "yellow contaminated"), ("पीला", "yellow contaminated"),
    ("पीले", "yellow contaminated"), ("जलापूर्ति", "water supply"), ("जल आपूर्ति", "water supply"),
    # drainage
    ("गटार", "gutter drain sewage"), ("नाला", "drain nala"), ("नाले", "drain nala"), ("नाली", "drain"),
    ("सांडपाणी", "sewage"), ("ड्रेनेज", "drainage sewage"), ("चेंबर", "drain chamber manhole"),
    ("मॅनहोल", "manhole drain"), ("मैनहोल", "manhole drain"), ("सीवर", "sewer"), ("सिवर", "sewer"),
    ("तुंब", "clogged blocked drain"), ("चोक", "choked blocked"), ("ओव्हरफ्लो", "overflow"),
    ("साचल", "stagnant waterlogging"), ("साचले", "stagnant waterlogging"), ("जलभराव", "waterlogging flooding"),
    ("जलजमाव", "waterlogging flooding"), ("ढक्कन", "manhole cover"), ("घाण पाणी", "sewage dirty water"),
    ("गंदा पानी", "dirty water"), ("पूर", "flooding"), ("बाढ़", "flooding"),
    # sanitation
    ("कचर", "garbage trash"), ("कचऱ", "garbage trash"), ("कूड़", "garbage trash"), ("कूड", "garbage trash"),
    ("कुड़", "garbage trash"), ("घंटागाडी", "garbage collection van"), ("कचरापेटी", "dustbin garbage"),
    ("कचराकुंडी", "dustbin garbage"), ("घाण", "filth dirty"), ("गंदगी", "filth dirty"), ("सफाई", "cleaning sweeper"),
    ("स्वच्छता", "cleaning sanitation"), ("झाडू", "sweeping sweeper"), ("दुर्गंधी", "stench stink"),
    ("बदबू", "stench stink"), ("शौचालय", "toilet"), ("मेलेल", "dead animal carcass"), ("मरा हुआ", "dead animal carcass"),
    ("ढीग", "heap pile"), ("ढेर", "heap pile"),
    # road
    ("रस्त", "street"), ("सड़क", "street"), ("सडक", "street"), ("खड्ड", "pothole road damage"),
    ("खड्डा", "pothole road damage"), ("गड्ढ", "pothole road damage"), ("गड्ड", "pothole road damage"),
    ("डांबर", "asphalt road surface"), ("उखड", "road surface broken dug"), ("धंस", "road sinkhole"),
    ("स्पीड ब्रेकर", "speed breaker"), ("गतिरोधक", "speed breaker"), ("पूल", "bridge flyover"), ("पुल", "bridge flyover"),
    ("खोदकाम", "road digging"), ("खुदाई", "road digging"),
    # traffic
    ("वाहतूक", "traffic"), ("कोंडी", "traffic jam"), ("ट्रॅफिक", "traffic"), ("ट्रैफिक", "traffic"),
    ("जाम", "jam blocked"), ("सिग्नल", "traffic signal"), ("पार्किंग", "parking"), ("गाड्य", "vehicles"),
    ("गाड़िय", "vehicles"), ("गाडी", "vehicle"), ("गाड़ी", "vehicle"), ("उभ्या", "parked"), ("चौक", "junction"),
    ("चौराह", "junction"), ("वाहन", "vehicles"),
    # noise
    ("आवाज", "noise loud"), ("ध्वनी", "noise"), ("ध्वनि", "noise"), ("डीजे", "dj loud music"),
    ("लाउडस्पीकर", "loudspeaker noise"), ("लाऊडस्पीकर", "loudspeaker noise"), ("भोंग", "loudspeaker noise"),
    ("बैंड", "band music noise"), ("गाणी", "music songs"), ("गाने", "music songs"), ("वाजत", "playing music"),
    ("बज रह", "playing music"), ("बजा", "playing music"), ("शोर", "noise"), ("गोंगाट", "noise"),
    # housing
    ("इमारत", "building"), ("भिंत", "wall"), ("दीवार", "wall"), ("दिवार", "wall"), ("छत", "ceiling roof"),
    ("स्लॅब", "slab ceiling"), ("तडे", "cracks"), ("दरार", "cracks"), ("प्लास्टर", "plaster"),
    ("जिना", "staircase building"), ("जिन्या", "staircase building"), ("वाडा", "old building"), ("वाड्य", "old building"),
    ("कोसळ", "collapse"), ("छज्ज", "balcony ledge"), ("मकान", "house building"), ("सोसायटी", "society building"),
    ("धोकादायक इमारत", "dangerous building"), ("जर्जर", "dilapidated building"),
    # environment
    ("झाडू", "sweeping sweeper"),  # must precede the tree stem (longest match wins anyway)
    ("झाड़िय", "bushes overgrown"), ("झाड", "tree"), ("पेड़", "tree"), ("पेड", "tree"), ("वृक्ष", "tree"),
    ("फांदी", "tree branch"), ("फांद्य", "tree branch"), ("डाली", "tree branch"), ("टहनी", "tree branch"),
    ("बाग", "garden park"), ("बगीच", "garden park"), ("उद्यान", "garden park"), ("पार्क", "park"),
    ("घास", "grass"), ("गवत", "grass"), ("छाटणी", "tree pruning"), ("छंटाई", "tree pruning"),
    ("तलाव", "lake"), ("तालाब", "lake"),
    # pollution
    ("प्रदूषण", "pollution"), ("प्रदुषण", "pollution"), ("विषारी", "toxic"), ("जहरील", "toxic"),
    ("ज़हरील", "toxic"), ("रसायन", "chemical"), ("केमिकल", "chemical"), ("कारखान", "factory"),
    ("फैक्ट्री", "factory"), ("फॅक्टरी", "factory"), ("चिमनी", "chimney"), ("धूळ", "dust"), ("धूल", "dust"),
    ("नदी", "river"), ("नदीत", "river"),
    # animals
    ("कुत्र", "dog stray dogs"), ("कुत्त", "dog stray dogs"), ("भटक", "stray"), ("आवारा", "stray"),
    ("गाय", "cow cattle"), ("गायी", "cow cattle"), ("गुरे", "cattle"), ("जनावर", "animal cattle"),
    ("बैल", "bull cattle"), ("सांड", "bull cattle"), ("म्हैस", "buffalo"), ("भैंस", "buffalo"),
    ("बंदर", "monkey"), ("माकड", "monkey"), ("साप", "snake"), ("सांप", "snake"), ("डुक्कर", "pig"),
    ("सुअर", "pig"), ("कबूतर", "pigeon"), ("चाव", "animal bite"), ("रेबीज", "rabies"),
    # public transport
    ("बस", "bus"), ("एसटी", "state transport bus"), ("मेट्रो", "metro"), ("रेल्वे", "railway train"),
    ("रेलवे", "railway train"), ("लोकल", "local train"), ("स्टेशन", "station"), ("रिक्षा", "rickshaw"),
    ("रिक्शा", "rickshaw"), ("ऑटो", "auto rickshaw"), ("थांब", "bus stop"), ("टिकट", "ticket"),
    ("तिकीट", "ticket"), ("कंडक्टर", "conductor"), ("भाड", "fare"), ("किराय", "fare"),
    # encroachment
    ("अतिक्रमण", "encroachment"), ("अनधिकृत", "unauthorized illegal construction"),
    ("अवैध", "illegal unauthorized"), ("बेकायदा", "illegal unauthorized"), ("कब्ज", "illegal occupation encroachment"),
    ("फेरीवाल", "hawkers vendors"), ("ठेल", "hawker cart vendors"), ("हातगाड", "hawker cart vendors"),
    ("स्टॉल", "stall vendors"), ("शेड", "shed structure"), ("टपरी", "stall vendors"), ("घेर", "occupying"),
    ("फुटपाथ", "footpath"), ("फूटपाथ", "footpath"),
    # public safety
    ("चोरी", "theft"), ("चोर", "thief theft"), ("घरफोड", "burglary theft"), ("दरोड", "robbery"),
    ("डकैती", "robbery"), ("लूट", "robbery"), ("छेड", "harassment"), ("छीन", "snatching theft"),
    ("हिसका", "snatching theft"), ("मारामारी", "fight violence"), ("मारपीट", "fight violence"),
    ("गुंड", "goons crime"), ("नशे", "drunk drugs"), ("नशा", "drunk drugs"), ("दारुड", "drunk"),
    ("शराबी", "drunk"), ("पोलीस", "police"), ("पुलिस", "police"), ("असुरक्षित", "unsafe"),
    ("सीसीटीव्ही", "cctv"), ("गुन्हेगार", "crime"), ("अपराध", "crime"),
    # health
    ("डेंग्यू", "dengue"), ("डेंगू", "dengue"), ("मलेरिया", "malaria"), ("डास", "mosquito"),
    ("मच्छर", "mosquito"), ("ताप", "fever"), ("बुखार", "fever"), ("रुग्ण", "patients disease"),
    ("मरीज", "patients disease"), ("दवाखान", "clinic hospital"), ("रुग्णालय", "hospital"),
    ("अस्पताल", "hospital"), ("डॉक्टर", "doctor"), ("औषध", "medicine"), ("दवा", "medicine"),
    ("फवारणी", "fogging spraying"), ("छिड़काव", "fogging spraying"), ("फॉगिंग", "fogging"),
    ("उलटी", "vomiting disease"), ("उल्टी", "vomiting disease"), ("दस्त", "diarrhea disease"),
    ("जुलाब", "diarrhea disease"), ("साथीच", "epidemic outbreak"), ("आरोग्य", "health"),
    ("स्वास्थ्य", "health"), ("बीमार", "disease"), ("आजार", "disease"), ("रुग्णवाहिका", "ambulance"),
    # severity / urgency words (no category signal, but useful for severity)
    ("तातडी", "urgent"), ("तुरंत", "urgent"), ("धोकादायक", "dangerous"), ("खतर", "danger"),
    ("जखमी", "injured"), ("घायल", "injured"), ("अपघात", "accident"), ("दुर्घटना", "accident"),
]

_ROMAN_LEXICON = [
    # fire
    ("aag", "fire"), ("lapat", "fire flames"), ("lapte", "fire flames"), ("lapten", "fire flames"),
    ("jal raha", "burning fire"), ("jal rahi", "burning fire"), ("jal gaya", "burnt fire"),
    ("jal gayi", "burnt fire"), ("agnishaman", "fire brigade"), ("dhua", "smoke"), ("dhur", "smoke"),
    ("visfot", "explosion blast"),
    # gas
    ("galti", "leak"), ("galati", "leak"), ("risav", "leak"), ("risaav", "leak"), ("silender", "gas cylinder"),
    ("badboo", "stench stink"), ("badbu", "stench stink"), ("vaas", "smell stench"), ("smell", "smell"),
    # electric
    ("bijli", "electricity power"), ("vij", "electricity power"), ("veej", "electricity power"),
    ("light gayi", "electricity power cut"), ("light nahi", "electricity power cut"),
    ("light band", "street light not working"), ("batti", "street light lamp"),
    ("khamba", "electric pole"), ("khambha", "electric pole"), ("khamb", "electric pole"),
    ("taar", "electric wire"), ("current", "electric current"), ("short circuit", "short circuit electric sparking"),
    ("shortcircuit", "short circuit electric sparking"), ("sparking", "electric sparking"), ("andhera", "dark no light"),
    ("andhar", "dark no light"),
    # water
    ("paani", "water"), ("nal", "water tap"), ("nalka", "water tap"), ("tanki", "water tank"),
    ("taaki", "water tank"), ("peene", "drinking"), ("pine", "drinking"), ("supply", "supply"),
    ("paani nahi", "no water supply"), ("pani yet nahi", "no water supply"),
    # drainage
    ("gutar", "gutter drain sewage"), ("nala", "drain nala"), ("nali", "drain"), ("sewer", "sewer"),
    ("chamber", "drain chamber manhole"), ("tumbla", "clogged blocked drain"), ("tumbale", "clogged blocked drain"),
    ("tumbli", "clogged blocked drain"), ("jalbharav", "waterlogging flooding"), ("paani bhar", "waterlogging flooding"),
    ("paani bhara", "waterlogging flooding"), ("ghutne tak", "waterlogging flooding knee deep"),
    ("kamar tak", "waterlogging flooding"), ("saandpaani", "sewage"), ("sandpani", "sewage"),
    # sanitation
    ("kachra", "garbage trash"), ("kuda", "garbage trash"), ("gandagi", "filth dirty"), ("gandgi", "filth dirty"),
    ("ghaan", "filth dirty"), ("safai", "cleaning sweeper"), ("ghantagadi", "garbage collection van"),
    ("ghanta gadi", "garbage collection van"), ("dher", "heap pile"), ("dhig", "heap pile"),
    ("uchalla nahi", "not collected"), ("uthaya nahi", "not collected"),
    # road
    ("sadak", "street"), ("rasta", "street"), ("rastya", "street"), ("khadda", "pothole road damage"),
    ("gaddha", "pothole road damage"), ("dambar", "asphalt road surface"), ("pul", "bridge flyover"),
    ("toota road", "broken road"), ("tooti sadak", "broken road"),
    # traffic
    ("jam", "jam blocked"), ("kondi", "traffic jam"), ("gaadi", "vehicle"), ("gaadiyan", "vehicles"),
    ("gadi", "vehicle"), ("gadya", "vehicles"), ("chowk", "junction"), ("chauraha", "junction"),
    ("atki", "stuck blocked"), ("atke", "stuck blocked"),
    # noise
    ("aawaz", "noise loud"), ("shor", "noise"), ("gaane", "music songs"), ("gane", "music songs"),
    ("bajate", "playing music"), ("baja rahe", "playing music"), ("bhonga", "loudspeaker noise"),
    ("speaker", "loudspeaker noise"),
    # housing
    ("deewar", "wall"), ("bhint", "wall"), ("chhat", "ceiling roof"), ("daraar", "cracks"),
    ("tade", "cracks"), ("jina", "staircase building"), ("wada", "old building"), ("chajja", "balcony ledge"),
    ("makaan", "house building"), ("makan", "house building"), ("kosalla", "collapse"), ("girne", "falling"),
    # environment
    ("zhaad", "tree"), ("ped", "tree"), ("phandi", "tree branch"), ("fandi", "tree branch"),
    ("dali", "tree branch"), ("tehni", "tree branch"), ("baag", "garden park"), ("bagicha", "garden park"),
    ("ghaas", "grass"), ("jhadiyan", "bushes overgrown"), ("jhadiya", "bushes overgrown"), ("aandhi", "storm"),
    # pollution
    ("pradushan", "pollution"), ("pradooshan", "pollution"), ("kemikal", "chemical"), ("karkhana", "factory"),
    ("karkhane", "factory"), ("dhool", "dust"), ("dhul", "dust"), ("zehreela", "toxic"), ("zahreela", "toxic"),
    ("zehrili", "toxic"),
    # animals
    ("kutta", "dog stray dogs"), ("kutte", "dog stray dogs"), ("kutre", "dog stray dogs"),
    ("awara", "stray"), ("bhatke", "stray"), ("bhatakne", "stray"), ("gaay", "cow cattle"),
    ("saand", "bull cattle"), ("bandar", "monkey"), ("makad", "monkey"), ("saanp", "snake"), ("saap", "snake"),
    ("suar", "pig"),
    # public transport
    ("local train", "local train"), ("riksha", "rickshaw"), ("rikshaw", "rickshaw"), ("thamba", "bus stop"),
    ("tikat", "ticket"), ("kiraya", "fare"), ("bhada", "fare"),
    # encroachment
    ("atikraman", "encroachment"), ("anadhikrut", "unauthorized illegal construction"),
    ("avaidh", "illegal unauthorized"), ("awaidh", "illegal unauthorized"), ("kabza", "illegal occupation encroachment"),
    ("feriwale", "hawkers vendors"), ("pheriwale", "hawkers vendors"), ("thele", "hawker cart vendors"),
    ("thela", "hawker cart vendors"), ("tapri", "stall vendors"), ("dukaandaar", "shopkeeper"),
    ("dukandar", "shopkeeper"), ("gher", "occupying"),
    # public safety
    ("chori", "theft"), ("chor", "thief theft"), ("chheen", "snatching theft"), ("cheen", "snatching theft"),
    ("chhed", "harassment"), ("chhedkhani", "harassment"), ("pareshan karte", "harassment"),
    ("nashedi", "drunk drugs"), ("nasha", "drunk drugs"), ("sharabi", "drunk"), ("daaru", "drunk"),
    ("loot", "robbery"), ("gunde", "goons crime"), ("goonde", "goons crime"), ("marpeet", "fight violence"),
    ("maar peet", "fight violence"), ("ghar fodi", "burglary theft"),
    # health
    ("machhar", "mosquito"), ("bukhar", "fever"), ("mariz", "patients disease"), ("mareez", "patients disease"),
    ("dawakhana", "clinic hospital"), ("davakhana", "clinic hospital"), ("aspatal", "hospital"),
    ("dawa", "medicine"), ("ulti", "vomiting disease"), ("dast", "diarrhea disease"), ("bimari", "disease"),
    ("beemari", "disease"),
    # urgency
    ("jaldi", "urgent"), ("turant", "urgent"), ("khatra", "danger"), ("khatarnak", "dangerous"),
]

# Longest stems first so "झाडू" (broom) wins over "झाड" (tree), "पाणीपुरवठ" over "पाणी".
_DEV_LEXICON.sort(key=lambda x: -len(x[0]))
_ROMAN_LEXICON.sort(key=lambda x: -len(x[0]))

# ---------------------------------------------------------------------------
# 4. Language detection markers
# ---------------------------------------------------------------------------
_MR_DEV_MARKERS = {"आहे", "आहेत", "नाही", "झाले", "झाला", "झाली", "मध्ये", "आमच्या", "येत", "करा",
                   "होते", "आणि", "पण", "खूप", "गेले", "आली", "केले", "रोज", "सगळीकडे", "असतात"}
_HI_DEV_MARKERS = {"है", "हैं", "नहीं", "में", "की", "का", "के", "रहा", "रही", "रहे", "गया", "गई",
                   "हो", "से", "और", "बहुत", "पर", "कर", "करो", "था", "थी"}
_HINGLISH_MARKERS = {"hai", "nahi", "ka", "ki", "ke", "ko", "se", "me", "raha", "rahi", "rahe", "gaya",
                     "gayi", "ho", "kar", "karo", "bahut", "hua", "hui", "wala", "wale", "kya", "aur",
                     "pe", "par", "tak", "bhi", "ye", "yeh", "woh", "hum", "hamari", "hamare", "kab", "abhi"}
_MR_LATN_MARKERS = {"aahe", "ahe", "aahet", "nahi", "zala", "zale", "zali", "jhala", "madhe", "madhye",
                    "khup", "yet", "yetoy", "ghari", "kara", "divas", "aamchya", "amchya", "tumhi", "kay",
                    "lagli", "gela", "geli", "hota", "hoti", "uchalla", "pan", "ani", "yetay", "yete",
                    "rastyavar", "zhala", "zhali", "nahiye", "aahot", "majha", "maza", "amhala", "lavkar"}

# ---------------------------------------------------------------------------
# 5. Causal markers.  direction="after": cause follows marker  ("Y due to X")
#                     direction="before": cause precedes marker ("X ki wajah se Y", "X मुळे Y")
# ---------------------------------------------------------------------------
_CAUSAL_MARKERS = [
    # English
    (r"\bdue to\b", "after"), (r"\bbecause of\b", "after"), (r"\bbecause\b", "after"),
    (r"\bcaused by\b", "after"), (r"\bas a result of\b", "after"), (r"\bowing to\b", "after"),
    (r"\bresulting from\b", "after"), (r"\bthanks to\b", "after"),
    (r"\bso\b", "before"), (r"\btherefore\b", "before"), (r"\bhence\b", "before"),
    (r"\bwhich (?:is )?causing\b", "before"), (r"\bleading to\b", "before"), (r"\bresulting in\b", "before"),
    # Hinglish / romanised Marathi
    (r"\b(?:ki|ke|kee) (?:wajah|vajah|wajeh|vajeh) se\b", "before"), (r"\b(?:ke|ki) (?:karan|kaaran)\b", "before"),
    (r"\bkyunki\b", "after"), (r"\bkyonki\b", "after"), (r"\bkyuki\b", "after"),
    (r"\bisliye\b", "before"), (r"\bis liye\b", "before"), (r"\bis wajah se\b", "before"),
    (r"\b\w+mule\b", "before_incl"), (r"\bmule\b", "before"), (r"\btyamule\b", "before"),
    # Devanagari (Hindi + Marathi)
    (r"की वजह से", "before"), (r"के कारण", "before"), (r"की वजह", "before"), (r"क्योंकि", "after"),
    (r"इसलिए", "before"), (r"इस वजह से", "before"), (r"त्यामुळे", "before"), (r"कारणाने", "before"),
    (r"[ऀ-ॿ]+मुळे", "before_incl"), (r"मुळे", "before"), (r"मूळे", "before"),
]
_CAUSAL_RE = [(re.compile(p), d) for p, d in _CAUSAL_MARKERS]
_MULE_SUFFIX_DEV = re.compile(r"([ऀ-ॿ]+?)(?:ल्या|ल्यां|्यां|ां|ा|े)?मुळे")


def _canonical_tokens(text):
    out = []
    for t in tokenize(text):
        t = re.sub(r"([a-z])\1{2,}", r"\1\1", t)            # "bahuttt" -> "bahutt"
        out.append(_SPELLING.get(t, t))
    return out


def normalize(text):
    """Lower-case, NFC normalise, canonicalise Hinglish spellings; keeps Devanagari intact."""
    text = unicodedata.normalize("NFC", text or "").replace("\u200b", " ")
    return " ".join(_canonical_tokens(text))


def _normalize_keep_punct(text):
    """Like normalize() but keeps commas/full stops so clauses can be split."""
    text = unicodedata.normalize("NFC", text or "").replace("\u200b", " ").lower()

    def fix(m):
        t = re.sub(r"([a-z])\1{2,}", r"\1\1", m.group(0))
        return _SPELLING.get(t, t)
    text = _TOKEN_RE.sub(fix, text)
    text = re.sub(r"[^0-9a-z\u0900-\u097F\u200c\u200d_,.;।| ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()

def detect_language(text):
    """Returns one of: 'en', 'hinglish', 'mr', 'hi', 'mr-latn', 'mixed', 'unknown'."""
    norm = normalize(text)
    toks = norm.split()
    if not toks:
        return "unknown"
    dev = len(_DEVANAGARI_RE.findall(norm))
    lat = len(_LATIN_RE.findall(norm))
    if dev and dev >= lat:
        mr = sum(t in _MR_DEV_MARKERS for t in toks) + sum(t.endswith(("च्या", "ला", "मुळे", "ाचा", "ाची", "ाचे")) for t in toks) * 0.5
        hi = sum(t in _HI_DEV_MARKERS for t in toks)
        if lat > 0.3 * dev:
            return "mixed"
        return "mr" if mr >= hi and mr > 0 else ("hi" if hi > 0 else "mr")
    hing = sum(t in _HINGLISH_MARKERS for t in toks)
    mrl = sum(t in _MR_LATN_MARKERS for t in toks)
    if dev:
        return "mixed"
    if mrl >= 2 and mrl > hing:
        return "mr-latn"
    if hing >= 2 or (hing >= 1 and len(toks) <= 5):
        return "hinglish"
    if mrl >= 2 or (mrl >= 1 and hing == 0 and any(t in ("aahe", "ahe", "aahet") for t in toks)):
        return "mr-latn"
    return "en"


def english_gloss(text):
    """English keywords for the Devanagari / Hinglish / Marathi words found in `text`."""
    norm = normalize(text)
    toks = norm.split()
    padded = f" {norm} "
    glosses = []
    used = set()
    # multi-word romanised phrases first
    for stem, gloss in _ROMAN_LEXICON:
        if " " in stem and f" {stem}" in padded:
            glosses.append(gloss)
            used.update(stem.split())
    for stem, gloss in _DEV_LEXICON:
        if " " in stem and stem in norm:
            glosses.append(gloss)
    for i, t in enumerate(toks):
        if _DEVANAGARI_RE.search(t):
            for stem, gloss in _DEV_LEXICON:
                if " " not in stem and t.startswith(stem):
                    glosses.append(gloss)
                    break
        elif t not in used:
            for stem, gloss in _ROMAN_LEXICON:
                if " " in stem:
                    continue
                if t == stem or (len(stem) >= 4 and t.startswith(stem)):
                    glosses.append(gloss)
                    break
    # de-duplicate while preserving order
    seen, out = set(), []
    for g in glosses:
        if g not in seen:
            seen.add(g)
            out.append(g)
    return " ".join(out)


def augment_for_model(text):
    """What the classifiers actually see: normalised original + English gloss."""
    norm = normalize(text)
    gloss = english_gloss(text)
    return f"{norm} {gloss}".strip() if gloss else norm


def split_cause_effect(text):
    """Split a complaint into (cause_clause, effect_clause, marker) using causal markers.
    Returns (None, None, None) when no causal marker is present."""
    norm = _normalize_keep_punct(text)
    best = None
    for rx, direction in _CAUSAL_RE:
        m = rx.search(norm)
        if m and (best is None or m.start() < best[0].start()):
            best = (m, direction)
    if best is None:
        return None, None, None
    m, direction = best
    before, after = norm[:m.start()].strip(" ,.;"), norm[m.end():].strip(" ,.;")
    marker = m.group(0)

    if direction == "before_incl":
        # e.g. "गटार तुंबल्यामुळे रस्त्यावर पाणी" -> cause is "गटार तुंबल्या" (word incl. stem)
        stem = re.sub(r"(मुळे|mule)$", "", marker)
        stem = re.sub(r"(ल्या|ल्यां|्यां|ां)$", "", stem)
        cause = f"{before} {stem}".strip()
        effect = after
    elif direction == "after":
        if not before:
            # "Because of X, Y" -> cause is up to the first comma
            parts = re.split(r"[,;।|]", after, maxsplit=1)
            cause, effect = parts[0].strip(), (parts[1].strip() if len(parts) > 1 else "")
        else:
            # "Y due to X, Z" -> cause stops at a comma
            cause = re.split(r"[,;।|]", after, maxsplit=1)[0].strip()
            effect = before
    else:  # before
        cause, effect = before, after
    cause, effect = normalize(cause), normalize(effect)
    if not cause or len(cause) < 3:
        return None, None, None
    return cause, effect, marker


if __name__ == "__main__":
    for s in ["गटार तुंबल्यामुळे रस्त्यावर पाणी साचले आहे",
              "nala band hone ki wajah se sadak pe paani bhar gaya",
              "road is flooded because the storm drain is choked",
              "Because of the broken signal, traffic jam everywhere",
              "kachra uchalla nahi khup vaas yetoy",
              "पाइपलाइन से गैस निकल रही है"]:
        print(detect_language(s), "|", augment_for_model(s), "|", split_cause_effect(s))
