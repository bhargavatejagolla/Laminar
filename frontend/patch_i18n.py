import json
import os

updates = {
    "en": {
        "domains": {
            "people": "People Intelligence",
            "parking": "Smart Parking",
            "traffic": "Traffic Intelligence",
            "incident": "Incident Response",
            "systemConsole": "System Console"
        },
        "nav": {
            "systemsHub": "Systems Hub",
            "smartParking": "Smart Parking",
            "trafficControl": "Traffic Control",
            "incidentResponse": "Incident Response",
            "support": "Support",
            "liveMap": "Live Map"
        },
        "venues": {
            "slotAvailability": "Slot Availability",
            "vehicleDensity": "Vehicle Density"
        }
    },
    "te": {
        "domains": {
            "people": "పీపుల్ ఇంటెలిజెన్స్ (People Intelligence)",
            "parking": "స్మార్ట్ పార్కింగ్",
            "traffic": "ట్రాఫిక్ ఇంటెలిజెన్స్",
            "incident": "సంఘటన ప్రతిస్పందన",
            "systemConsole": "సిస్టమ్ కన్సోల్"
        },
        "nav": {
            "systemsHub": "సిస్టమ్స్ హబ్",
            "smartParking": "స్మార్ట్ పార్కింగ్",
            "trafficControl": "ట్రాఫిక్ నియంత్రణ",
            "incidentResponse": "సంఘటన ప్రతిస్పందన",
            "support": "మద్దతు",
            "liveMap": "లైవ్ మ్యాప్"
        },
        "venues": {
            "slotAvailability": "స్లాట్ లభ్యత",
            "vehicleDensity": "వాహనాల సాంద్రత"
        }
    },
    "hi": {
        "domains": {
            "people": "पीपल इंटेलिजेंस",
            "parking": "स्मार्ट पार्किंग",
            "traffic": "ट्रैफिक इंटेलिजेंस",
            "incident": "घटना प्रतिक्रिया",
            "systemConsole": "सिस्टम कंसोल"
        },
        "nav": {
            "systemsHub": "सिस्टम हब",
            "smartParking": "स्मार्ट पार्किंग",
            "trafficControl": "यातायात नियंत्रण",
            "incidentResponse": "घटना प्रतिक्रिया",
            "support": "समर्थन",
            "liveMap": "लाइव मैप"
        },
        "venues": {
            "slotAvailability": "स्लॉट उपलब्धता",
            "vehicleDensity": "वाहन घनत्व"
        }
    },
    "gu": {
        "domains": {
            "people": "પીપલ ઇન્ટેલિજન્સ",
            "parking": "સ્માર્ટ પાર્કિંગ",
            "traffic": "ટ્રાફિક ઇન્ટેલિજન્સ",
            "incident": "ઘટના પ્રતિભાવ",
            "systemConsole": "સિસ્ટમ કન્સોલ"
        },
        "nav": {
            "systemsHub": "સિસ્ટમ્સ હબ",
            "smartParking": "સ્માર્ટ પાર્કિંગ",
            "trafficControl": "ટ્રાફિક નિયંત્રણ",
            "incidentResponse": "ઘટના પ્રતિભાવ",
            "support": "આધાર",
            "liveMap": "લાઇવ મેપ"
        },
        "venues": {
            "slotAvailability": "સ્લોટ ઉપલબ્ધતા",
            "vehicleDensity": "વાહન ઘનતા"
        }
    },
    "ta": {
        "domains": {
            "people": "மக்கள் நுண்ணறிவு",
            "parking": "ஸ்மார்ட் பார்க்கிங்",
            "traffic": "போக்குவரத்து நுண்ணறிவு",
            "incident": "சம்பவ பதில்",
            "systemConsole": "கணினி கன்சோல்"
        },
        "nav": {
            "systemsHub": "சிஸ்டம்ஸ் ஹப்",
            "smartParking": "ஸ்மார்ட் பார்க்கிங்",
            "trafficControl": "போக்குவரத்து கட்டுப்பாடு",
            "incidentResponse": "சம்பவ பதில்",
            "support": "ஆதரவு",
            "liveMap": "நேரடி வரைபடம்"
        },
        "venues": {
            "slotAvailability": "ஸ்லாட் கிடைக்கும் தன்மை",
            "vehicleDensity": "வாகன அடர்த்தி"
        }
    }
}

i18n_dir = r"c:\Users\bharg\OneDrive\Documents\ztest\laminar\frontend\src\i18n"
for lang, data in updates.items():
    file_path = os.path.join(i18n_dir, f"{lang}.json")
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            content = json.load(f)
            
        for top_level, keys in data.items():
            if top_level not in content:
                content[top_level] = {}
            for k, v in keys.items():
                content[top_level][k] = v
                
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(content, f, ensure_ascii=False, indent=2)
        print(f"Patched {lang}.json")

