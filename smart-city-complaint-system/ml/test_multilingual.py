"""Multilingual Evaluation Benchmark for Smart City Complaint NLP Classifier.
Evaluates accuracy on 100+ held-out sentences across English, Hindi (Devanagari), Marathi, and Hinglish.
Reports accuracy with keyword priors and evaluates confidence thresholds.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import classify, severity_for, CLASSES

BENCHMARK_DATASET = [
    # FIRE
    ("Massive fire outbreak in commercial building second floor", "fire", "en"),
    ("मुख्य बाजारातील दुकानाला भीषण आग लागली आहे", "fire", "mr"),
    ("residential apartment me aag lagi h emergency bhejiyega", "fire", "hinglish"),
    ("आग की लपटें दिखाई दे रही हैं तुरंत फायर ब्रिगेड भेजो", "fire", "hi"),
    ("Transformer explosion caught fire near petrol pump", "fire", "en"),
    ("shop me short circuit se aag lag gayi h dhua nikal raha h", "fire", "hinglish"),

    # GAS
    ("LPG cylinder leaking in apartment kitchen heavy smell", "gas", "en"),
    ("गॅस सिलेंडरमधून वास येत आहे गळती झाली असावी", "gas", "mr"),
    ("commercial gas pipe leak ho gaya h cylinder blast ka khatra h", "gas", "hinglish"),
    ("रसोई में गैस सिलेंडर से बहुत तेज रिसाव हो रहा है", "gas", "hi"),
    ("Methane gas fumes coming from underground pipeline", "gas", "en"),
    ("gas regulator kharab h hissing sound aa raha h", "gas", "hinglish"),

    # ELECTRIC
    ("Live electric wire snapped and falling on waterlogged road", "electric", "en"),
    ("वीज गेली आहे ट्रान्सफॉर्मरमधून ठिणग्या पडत आहेत", "electric", "mr"),
    ("bijli ka taar toot gaya h transformer blast hua h blackout", "electric", "hinglish"),
    ("मोहल्ले में पिछले 6 घंटे से बिजली गुल है लाइट नहीं है", "electric", "hi"),
    ("Streetlight pole sparking continuously near school gate", "electric", "en"),
    ("voltage high low ho raha h bulb udd gaya", "electric", "hinglish"),

    # WATER
    ("Main water supply pipeline burst drinking water wasted", "water", "en"),
    ("पिण्याच्या पाण्याचा नळ तीन दिवसांपासून बंद आहे पाणी येत नाही", "water", "mr"),
    ("paani ki pipe toot gayi h drinking water nahi aa raha h", "water", "hinglish"),
    ("पानी की टंकी से गंदा और बदबूदार पानी आ रहा है", "water", "hi"),
    ("Water tanker required immediately in block C", "water", "en"),
    ("dirty muddy paani aa raha h peene ke liye paani nahi h", "water", "hinglish"),

    # DRAINAGE
    ("Open sewage drain overflowing into residential street", "drainage", "en"),
    ("गटार तुंबले आहे रस्त्यावर सांडपाणी साचले आहे", "drainage", "mr"),
    ("gutar overflow ho gaya h nala jam h paani bhar gaya h", "drainage", "hinglish"),
    ("नाली का पानी सड़क पर बह रहा है मच्छर पनप रहे हैं", "drainage", "hi"),
    ("Choked septic tank causing heavy waterlogging in colony", "drainage", "en"),
    ("manhole overflow ho raha h nala block h", "drainage", "hinglish"),

    # SANITATION
    ("Overflowing garbage bin not cleared for past five days", "sanitation", "en"),
    ("कचऱ्याची गाडी आली नाही रस्त्यावर कचरा साचला आहे", "sanitation", "mr"),
    ("kachra gaddi 4 din se nahi aayi h badboo aa rahi h", "sanitation", "hinglish"),
    ("कचरापेटी भरकर बाहर सड़न पैदा कर रही है मक्खियां हो रही हैं", "sanitation", "hi"),
    ("Dead animal carcass lying on main road stinking", "sanitation", "en"),
    ("dustbin overflow ho raha h sadak pe kachra phail gaya h", "sanitation", "hinglish"),

    # ROAD
    ("Dangerous deep pothole on flyover causing accidents", "road", "en"),
    ("रस्त्यावर मोठे खड्डे पडले आहेत वाहन चालवणे कठीण झाले आहे", "road", "mr"),
    ("sadak pe bada khadda h accident ho sakta h footpath kharab h", "road", "hinglish"),
    ("सड़क धंस गई है बड़ा गड्डा हो गया है तुरंत मरम्मत करो", "road", "hi"),
    ("Broken pavement slabs posing hazard to senior citizens", "road", "en"),
    ("pothole ki wajah se bike slip ho gayi h road repair karo", "road", "hinglish"),

    # TRAFFIC
    ("Huge traffic jam due to illegal double parking on main road", "traffic", "en"),
    ("चौकात मोठी वाहतूक कोंडी झाली आहे सिग्नल बंद आहे", "traffic", "mr"),
    ("traffic jam laga h signal kharab h gaadi parking block h", "traffic", "hinglish"),
    ("गाड़ियों की लंबी कतार लगी है कोई ट्रैफिक पुलिस नहीं है", "traffic", "hi"),
    ("Vehicles parked on wrong side blocking hospital entrance", "traffic", "en"),
    ("wrong side driving se traffic block ho gaya h", "traffic", "hinglish"),

    # NOISE
    ("Loud DJ music playing past midnight exceeding decibel limit", "noise", "en"),
    ("रात्री उशिरापर्यंत लाउडस्पीकरचा मोठा आवाज सुरू आहे", "noise", "mr"),
    ("raat ko 1 baje loud speaker dj aawaz ho raha h disturbed", "noise", "hinglish"),
    ("डीजे की तेज आवाज से बुजुर्गों की तबीयत खराब हो रही है", "noise", "hi"),
    ("Commercial construction site drilling noise late night", "noise", "en"),
    ("loudspeaker aawaz band કરાવiye shor mach raha h", "noise", "hinglish"),

    # HOUSING
    ("Structural crack in building balcony ceiling slab loose", "housing", "en"),
    ("इमारतीच्या भिंतीला मोठी तडे गेले आहेत स्लॅब पडत आहे", "housing", "mr"),
    ("deewar me bada crack aa gaya h chhat ka plaster gir raha h", "housing", "hinglish"),
    ("मकान की छत से पानी टपक रहा है प्लास्टर गिर रहा है", "housing", "hi"),
    ("Dilapidated building wall leaning dangerously towards road", "housing", "en"),
    ("building balcony plaster loose ho gaya h unsafe h", "housing", "hinglish"),

    # ENVIRONMENT
    ("Giant tree branch uprooted and blocking neighborhood road", "environment", "en"),
    ("मोठे झाड वादळामुळे रस्त्यावर कोसळले आहे रस्ता बंद झाला", "environment", "mr"),
    ("bada zhaad ped gir gaya h road block ho gaya h", "environment", "hinglish"),
    ("पार्क में सूखा पेड़ गिरने की कगार पर है तुरंत काटो", "environment", "hi"),
    ("Public park bushes overgrown and neglected", "environment", "en"),
    ("park me zhaad ki phandi toot ke giri h green belt maintenance", "environment", "hinglish"),

    # POLLUTION
    ("Industrial chimney emitting dark toxic smoke into residential air", "pollution", "en"),
    ("कारखान्यातून विषारी धूर सोडला जात आहे श्वास घेणे कठीण", "pollution", "mr"),
    ("factory se toxic dhua nikal raha h hawa kharab ho gayi h", "pollution", "hinglish"),
    ("हवा में प्रदूषण बहुत बढ़ गया है सांस लेने में तकलीफ हो रही है", "pollution", "hi"),
    ("Untreated chemical effluent discharged into local stream", "pollution", "en"),
    ("chemical waste se smog aur dhua phail raha h", "pollution", "hinglish"),

    # ANIMALS
    ("Pack of aggressive stray dogs attacking pedestrians near school", "animals", "en"),
    ("भटकणारे कुत्रे लहान मुलांना चावत आहेत धोकादायक परिस्थिति", "animals", "mr"),
    ("bhatakne wale kutte bachhon ko bite kar rahe h rabies khatra", "animals", "hinglish"),
    ("आवारा कुत्ते रास्ते पर लोगों को काट रहे हैं तुरंत पकड़े जाएं", "animals", "hi"),
    ("Dead cattle lying on highway obstructing traffic", "animals", "en"),
    ("stray dog katne laga h kutta rabid lag raha h", "animals", "hinglish"),

    # PUBLIC TRANSPORT
    ("City bus route 302 delayed by over an hour commuters waiting", "public_transport", "en"),
    ("बस स्थानकावर बस वेळेवर येत नाही प्रवासी ताटकळले आहेत", "public_transport", "mr"),
    ("bus timing cancel ho gayi h auto rickshaw wale extra fare maang rahe h", "public_transport", "hinglish"),
    ("मेट्रो स्टेशन पर लिफ्ट और एस्केलेटर काम नहीं कर रहे हैं", "public_transport", "hi"),
    ("Auto rickshaw driver refusing short distance fare and overcharging", "public_transport", "en"),
    ("bus stop par commuter shelter broken h train timing delay", "public_transport", "hinglish"),

    # ENCROACHMENT
    ("Illegal street hawkers occupying entire pedestrian footpath", "encroachment", "en"),
    ("फूटपाथवर अनधिकृत फेरीवाल्यांनी अतिक्रमण केले आहे", "encroachment", "mr"),
    ("footpath par illegal kabza ho gaya h hawker shop chala rahe h", "encroachment", "hinglish"),
    ("सार्वजनिक जमीन पर अवैध कब्जा करके दुकान बना ली गई है", "encroachment", "hi"),
    ("Unauthorized hoarding and banner blocking traffic view", "encroachment", "en"),
    ("illegal construction kar rahe h public land encroach karke", "encroachment", "hinglish"),

    # PUBLIC SAFETY
    ("Chain snatching incident reported near dimly lit alley police patrol needed", "public_safety", "en"),
    ("रात्रीच्या वेळी रस्त्यावर महिलांची छेडछाड आणि चोरीचे प्रकार", "public_safety", "mr"),
    ("chori ho gayi h chain snatching robbery night patrol police", "public_safety", "hinglish"),
    ("अंधेरे मोड़ पर शराबियों का जमावड़ा रहता है लोग असुरक्षित हैं", "public_safety", "hi"),
    ("Drunkards gambling in public park creating unsafe environment", "public_safety", "en"),
    ("thief snatched bag and escaped unsafe area cctv needed", "public_safety", "hinglish"),

    # HEALTH
    ("Mosquito breeding in stagnant water leading to dengue malaria cases", "health", "en"),
    ("डासांचा प्रादुर्भाव वाढला आहे डेंग्यूचे रुग्ण आढळले आहेत औषधफवारणी करा", "health", "mr"),
    ("dengue machhar bohot ho gaye h fogging dawa spray karwao", "health", "hinglish"),
    ("इलाके में मलेरिया फैल रहा है स्वास्थ्य विभाग छिड़काव करे", "health", "hi"),
    ("Primary health clinic doctor absent and no ambulance available", "health", "en"),
    ("mosquito breeding ho rahi h malaria outbreak risk dawa spray", "health", "hinglish"),
]


def run_benchmark():
    print("==========================================================")
    print("MULTILINGUAL COMPLAINT CLASSIFIER EVALUATION BENCHMARK")
    print(f"Total Held-Out Benchmark Cases: {len(BENCHMARK_DATASET)}")
    print("Languages Covered: English (en), Hindi (hi), Marathi (mr), Hinglish (hinglish)")
    print("==========================================================\n")

    correct = 0
    lang_correct = {}
    lang_total = {}

    cat_correct = {}
    cat_total = {}

    low_confidence_count = 0

    for text, target_cat, lang in BENCHMARK_DATASET:
        lang_total[lang] = lang_total.get(lang, 0) + 1
        cat_total[target_cat] = cat_total.get(target_cat, 0) + 1

        pred_cat, conf, top3, needs_review = classify(text)
        sev = severity_for(text, pred_cat if pred_cat != "unclassified" else target_cat)

        if needs_review:
            low_confidence_count += 1

        is_match = (pred_cat == target_cat)
        if is_match:
            correct += 1
            lang_correct[lang] = lang_correct.get(lang, 0) + 1
            cat_correct[target_cat] = cat_correct.get(target_cat, 0) + 1

    overall_acc = (correct / len(BENCHMARK_DATASET)) * 100
    print(f"OVERALL CLASSIFICATION ACCURACY: {overall_acc:.2f}% ({correct}/{len(BENCHMARK_DATASET)})")
    print(f"LOW CONFIDENCE REVIEWS (<0.50): {low_confidence_count} cases\n")

    print("--- ACCURACY BY LANGUAGE ---")
    for lang, tot in lang_total.items():
        c = lang_correct.get(lang, 0)
        acc = (c / tot) * 100
        print(f"  * {lang.upper():<10}: {acc:6.2f}%  ({c}/{tot})")

    print("\n--- ACCURACY BY CATEGORY ---")
    for cat, tot in cat_total.items():
        c = cat_correct.get(cat, 0)
        acc = (c / tot) * 100
        print(f"  * {cat:<18}: {acc:6.2f}%  ({c}/{tot})")

    print("\n==========================================================")
    assert overall_acc >= 75.0, f"Accuracy {overall_acc:.2f}% below required 75.0% threshold"
    print("BENCHMARK PASSED CLEANLY!")
    print("==========================================================")


if __name__ == "__main__":
    run_benchmark()
