"""Held-out evaluation for the multilingual + root-cause classifier.

None of these sentences (or their exact phrases) appear in train.py, keywords.py or
text_normalizer.py. They were written separately to measure generalisation, so do not
copy them into the training corpus. Run:  python test_language_rootcause.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import analyze_text  # noqa: E402

# (text, expected_root_cause_category, language_tag)
UNSEEN = [
    # fire
    ("godown ke andar se lapte nikal rahi hai jaldi aao", "fire", "hinglish"),
    ("आमच्या सोसायटीच्या मीटर रूमला आग लागली आहे", "fire", "mr"),
    ("पुराने बाजार की दुकान जल रही है लोग फंसे हैं", "fire", "hi"),
    ("kitchen madhe aag lagli aahe dhur khup aahe", "fire", "mr-latn"),
    # gas
    ("pure building me gas ki smell aa rahi hai saans lene me dikkat", "gas", "hinglish"),
    ("हॉटेलच्या मागे गॅसचा वास येत आहे", "gas", "mr"),
    ("पाइपलाइन से गैस निकल रही है बहुत खतरा है", "gas", "hi"),
    # electric
    ("hamari gali me kal raat se light gayi hui hai", "electric", "hinglish"),
    ("खांबावरील दिवा गेले आठ दिवस बंद आहे", "electric", "mr"),
    ("बिजली का खंभा झुक गया है तार नीचे लटक रहे हैं", "electric", "hi"),
    ("rastyavarchi light band aahe andhar aahe", "electric", "mr-latn"),
    # water
    ("nal me teen din se ek boond paani nahi aaya", "water", "hinglish"),
    ("आमच्या भागात पाणीपुरवठा अनियमित झाला आहे", "water", "mr"),
    ("नल से पीला पानी आ रहा है पीने लायक नहीं", "water", "hi"),
    ("ghari pani yet nahi teen divas zale", "water", "mr-latn"),
    # drainage
    ("baarish ke baad poori colony me ghutne tak paani bhara hai", "drainage", "hinglish"),
    ("चेंबर फुटून घाण पाणी रस्त्यावर वाहत आहे", "drainage", "mr"),
    ("सीवर का ढक्कन टूटा है गंदा पानी बाहर आ रहा है", "drainage", "hi"),
    # sanitation
    ("gali ke kone pe kooda ka dher lag gaya hai", "sanitation", "hinglish"),
    ("घंटागाडी आठवडाभर आली नाही सगळीकडे कचरा", "sanitation", "mr"),
    ("मोहल्ले में सफाई कर्मचारी नहीं आते गंदगी फैली है", "sanitation", "hi"),
    ("kachra uchalla nahi khup vaas yetoy", "sanitation", "mr-latn"),
    # road
    ("highway pe bade bade gaddhe hain gaadi kharab ho rahi hai", "road", "hinglish"),
    ("पुलावरचा डांबरी रस्ता पूर्ण उखडला आहे", "road", "mr"),
    ("सड़क में गहरे गड्ढे हैं स्कूटर वाले गिर रहे हैं", "road", "hi"),
    # traffic
    ("chowk pe signal band hai gaadiyan atki hui hai", "traffic", "hinglish"),
    ("शाळेसमोर रोज गाड्या उभ्या करतात रस्ता अडतो", "traffic", "mr"),
    ("चौराहे पर घंटों से जाम लगा है", "traffic", "hi"),
    # noise
    ("padosi raat bhar tez gaane bajate hain sona mushkil", "noise", "hinglish"),
    ("मंडळाचा डीजे रात्री दोन वाजेपर्यंत वाजत होता", "noise", "mr"),
    ("शादी में देर रात तक बैंड बज रहा है", "noise", "hi"),
    # housing
    ("purani building ki deewar me daraar aa gayi hai", "housing", "hinglish"),
    ("जुन्या वाड्याचा जिना कोसळण्याच्या स्थितीत आहे", "housing", "mr"),
    ("मकान का छज्जा कभी भी गिर सकता है", "housing", "hi"),
    # environment
    ("aandhi me bada ped bijli ke taar pe gira nahi, sadak pe gira hai", "environment", "hinglish"),
    ("बागेतील झाडांची छाटणी झालेली नाही", "environment", "mr"),
    ("पार्क में घास और झाड़ियां बहुत बढ़ गई हैं", "environment", "hi"),
    # pollution
    ("factory ki chimney se kaala dhuan nikalta hai din bhar", "pollution", "hinglish"),
    ("नदीत रसायनमिश्रित पाणी सोडले जात आहे", "pollution", "mr"),
    ("कारखाने का केमिकल नाले में छोड़ा जा रहा है", "pollution", "hi"),
    # animals
    ("society me awaara kutton ka jhund ghoomta hai", "animals", "hinglish"),
    ("रस्त्यावर गायी बसलेल्या असतात अपघात होतात", "animals", "mr"),
    ("गली में बंदर घरों में घुसकर सामान ले जाते हैं", "animals", "hi"),
    # public transport
    ("route 45 ki bus ghanta bhar late aati hai roz", "public_transport", "hinglish"),
    ("एसटी बस थांब्यावर थांबतच नाही", "public_transport", "mr"),
    ("मेट्रो की टिकट मशीन खराब पड़ी है", "public_transport", "hi"),
    # encroachment
    ("dukaandaar ne footpath par apna saamaan rakh diya hai", "encroachment", "hinglish"),
    ("सार्वजनिक मैदानावर अनधिकृत शेड उभारले आहे", "encroachment", "mr"),
    ("ठेले वालों ने पूरी सड़क घेर रखी है", "encroachment", "hi"),
    # public safety
    ("raat ko gali me nashedi log ladkiyon ko pareshan karte hain", "public_safety", "hinglish"),
    ("आमच्या भागात रात्री घरफोड्या वाढल्या आहेत", "public_safety", "mr"),
    ("बाइक सवार ने महिला का पर्स छीन लिया", "public_safety", "hi"),
    # health
    ("mohalle me kai logo ko dengue ho gaya hai fogging nahi hui", "health", "hinglish"),
    ("सरकारी दवाखान्यात डॉक्टर उपलब्ध नाहीत", "health", "mr"),
    ("इलाके में उल्टी दस्त के मरीज बढ़ रहे हैं", "health", "hi"),
]

# Root-cause cases: the visible symptom belongs to one department, the cause to another.
# (text, expected_root_cause, expected_symptom_or_None, language)
ROOT_CAUSE = [
    ("road is flooded because the storm drain is choked", "drainage", None, "en"),
    ("there was an accident on the main road due to a deep pothole", "road", None, "en"),
    ("nala band hone ki wajah se sadak pe paani bhar gaya", "drainage", None, "hinglish"),
    ("गटार तुंबल्यामुळे रस्त्यावर पाणी साचले आहे", "drainage", None, "mr"),
    ("खड्ड्यांमुळे रोज वाहतूक कोंडी होते", "road", "traffic", "mr"),
    ("gaddhon ki wajah se roz traffic jam lagta hai", "road", "traffic", "hinglish"),
    ("short circuit ki wajah se dukaan me aag lag gayi", "electric", "fire", "hinglish"),
    ("massive traffic jam because the signal is not working", "traffic", None, "en"),
    ("जमा कचरे के कारण नाली जाम हो गई है", "sanitation", "drainage", "hi"),
    ("mosquitoes everywhere because of stagnant gutter water", "drainage", "health", "en"),
    ("hawkers ne footpath gher liya isliye log road pe chal rahe hain", "encroachment", None, "hinglish"),
    ("झाड पडल्यामुळे रस्ता बंद झाला आहे", "environment", None, "mr"),
    ("street is dark because the street lights are broken, chain snatching is happening", "electric", None, "en"),
]


def run():
    ok, by_lang = 0, {}
    print("=" * 70)
    print("UNSEEN multilingual sentences")
    print("=" * 70)
    for text, exp, lang in UNSEEN:
        r = analyze_text(text)
        hit = r["category"] == exp
        ok += hit
        c, t = by_lang.get(lang, (0, 0))
        by_lang[lang] = (c + hit, t + 1)
        if not hit:
            print(f"[MISS] {lang:<9} exp={exp:<17} got={r['category']:<17} conf={r['confidence']:.2f} | {text}")
    acc = ok / len(UNSEEN)
    print(f"\nUnseen accuracy: {acc:.1%} ({ok}/{len(UNSEEN)})")
    for lang, (c, t) in sorted(by_lang.items()):
        print(f"  {lang:<9} {c}/{t}  ({c / t:.0%})")

    print("\n" + "=" * 70)
    print("ROOT-CAUSE cases")
    print("=" * 70)
    rc_ok = 0
    for text, exp, sym, lang in ROOT_CAUSE:
        r = analyze_text(text)
        hit = r["root_cause_category"] == exp
        rc_ok += hit
        mark = "PASS" if hit else "MISS"
        print(f"[{mark}] root={r['root_cause_category']:<14} symptom={str(r['symptom_category']):<14} "
              f"exp={exp:<14} | {text}")
    rc_acc = rc_ok / len(ROOT_CAUSE)
    print(f"\nRoot-cause accuracy: {rc_acc:.1%} ({rc_ok}/{len(ROOT_CAUSE)})")
    return acc, rc_acc


if __name__ == "__main__":
    acc, rc_acc = run()
    assert acc >= 0.75, f"Unseen multilingual accuracy {acc:.1%} below 75%"
    assert rc_acc >= 0.75, f"Root-cause accuracy {rc_acc:.1%} below 75%"
    print("\nPASSED")
