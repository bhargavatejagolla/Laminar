"""
Laminar - Translation Service
-----------------------------
Provides lightweight multi-language translation for notifications (SMS & Email).
Languages supported: English (en), Hindi (hi), Telugu (te), Gujarati (gu), Tamil (ta).
"""

TRANSLATIONS = {
    "en": {
        "critical_alert": "CRITICAL CROWD ALERT",
        "surge_alert": "CROWD SURGE DETECTED",
        "venue": "Venue",
        "location": "Location",
        "severity": "Severity",
        "escalation_risk": "Escalation Risk",
        "time": "TIME",
        "action_required": "ACTION REQUIRED - Check dashboard immediately.",
        "email_subject_prefix": "Laminar Alert",
        "email_header": "Laminar Intelligence Alert",
        "system_brief": "System Generated Brief",
        "prediction_intel": "Prediction Intelligence",
        "predicted_level": "Predicted Level",
        "predicted_score": "Predicted Risk Score",
        "calculating": "CALCULATING",
        "view_dashboard": "View Dashboard"
    },
    "hi": {
        "critical_alert": "गंभीर भीड़ चेतावनी (CRITICAL ALERT)",
        "surge_alert": "भीड़ बढ़ने का पता चला (SURGE DETECTED)",
        "venue": "स्थान (Venue)",
        "location": "जगह (Location)",
        "severity": "गंभीरता (Severity)",
        "escalation_risk": "बढ़ने का जोखिम",
        "time": "समय",
        "action_required": "कार्रवाई आवश्यक - तुरंत डैशबोर्ड जांचें।",
        "email_subject_prefix": "लैमিনার अलर्ट",
        "email_header": "लैमিনার इंटेलिजेंस अलर्ट",
        "system_brief": "सिस्टम जनरेटेड ब्रीफ",
        "prediction_intel": "प्रेडिक्शन इंटेलिजेंस",
        "predicted_level": "अनुमानित स्तर",
        "predicted_score": "अनुमानित जोखिम स्कोर",
        "calculating": "गणना हो रही है",
        "view_dashboard": "डैशबोर्ड देखें"
    },
    "te": {
        "critical_alert": "తీవ్రమైన రద్దీ హెచ్చరిక (CRITICAL ALERT)",
        "surge_alert": "రద్దీ ఉప్పెన గుర్తింపు (SURGE DETECTED)",
        "venue": "వేదిక (Venue)",
        "location": "ప్రాంతం (Location)",
        "severity": "తీవ్రత (Severity)",
        "escalation_risk": "పెరిగే ప్రమాదం",
        "time": "సమయం",
        "action_required": "చర్య అవసరం - వెంటనే డాష్‌బోర్డ్‌ని తనిఖీ చేయండి.",
        "email_subject_prefix": "లామినార్ అలర్ట్",
        "email_header": "లామినార్ ఇంటెలిజెన్స్ అలర్ట్",
        "system_brief": "సిస్టమ్ రూపొందించిన సారాంశం",
        "prediction_intel": "ప్రిడిక్షన్ ఇంటెలిజెన్స్",
        "predicted_level": "ఊహించిన స్థాయి",
        "predicted_score": "ఊహించిన ప్రమాద స్కోర్",
        "calculating": "లెక్కిస్తోంది",
        "view_dashboard": "డాష్‌బోర్డ్ చూడండి"
    },
    "gu": {
        "critical_alert": "ગંભીર ભીડ ચેતવણી (CRITICAL ALERT)",
        "surge_alert": "ભીડ વધારો જોવા મળ્યો (SURGE DETECTED)",
        "venue": "સ્થળ (Venue)",
        "location": "જગ્યા (Location)",
        "severity": "ગંભીરતા (Severity)",
        "escalation_risk": "વધવાનું જોખમ",
        "time": "સમય",
        "action_required": "કાર્યવાહી જરૂરી - તરત જ ડેશબોર્ડ તપાસો.",
        "email_subject_prefix": "લેમિનાર એલર્ટ",
        "email_header": "લેમિનાર ઇન્ટેલિજન્સ એલર્ટ",
        "system_brief": "સિસ્ટમ જનરેટ કરેલ સંક્ષિપ્ત",
        "prediction_intel": "અનુમાનિત ઇન્ટેલિજન્સ",
        "predicted_level": "અનુમાનિત સ્તર",
        "predicted_score": "અનુમાનિત જોખમ સ્કોર",
        "calculating": "ગણતરી ચાલુ છે",
        "view_dashboard": "ડેશબોર્ડ જુઓ"
    },
    "ta": {
        "critical_alert": "முக்கியமான கூட்ட எச்சரிக்கை (CRITICAL ALERT)",
        "surge_alert": "கூட்டம் அதிகரிப்பு கண்டறியப்பட்டது (SURGE DETECTED)",
        "venue": "இடம் (Venue)",
        "location": "அமைவிடம் (Location)",
        "severity": "தீவிரம் (Severity)",
        "escalation_risk": "அதிகரிக்கும் அபாயம்",
        "time": "நேரம்",
        "action_required": "நடவடிக்கை தேவை - உடனடியாக டாஷ்போர்டை சரிபார்க்கவும்.",
        "email_subject_prefix": "லாமினார் எச்சரிக்கை",
        "email_header": "லாமினார் நுண்ணறிவு எச்சரிக்கை",
        "system_brief": "கணினி உருவாக்கிய சுருக்கம்",
        "prediction_intel": "கணிப்பு நுண்ணறிவு",
        "predicted_level": "கணிக்கப்பட்ட நிலை",
        "predicted_score": "கணிக்கப்பட்ட அபாய மதிப்பெண்",
        "calculating": "கணக்கிடப்படுகிறது",
        "view_dashboard": "டாஷ்போர்டைக் காண்க"
    }
}

class TranslationService:
    @staticmethod
    def t(lang: str, key: str, default: str = None) -> str:
        """Translate a key to the target language, falling back to English."""
        # Clean language code (e.g., "en-US" -> "en")
        base_lang = (lang or "en").split("-")[0].lower()
        
        # Fallback to English if language not supported
        if base_lang not in TRANSLATIONS:
            base_lang = "en"
            
        return TRANSLATIONS[base_lang].get(key, TRANSLATIONS["en"].get(key, default or key))
