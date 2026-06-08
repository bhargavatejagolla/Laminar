import json
import os
import sys
from deep_translator import GoogleTranslator

# Set stdout encoding
sys.stdout.reconfigure(encoding='utf-8')

i18n_dir = r'c:\Users\bharg\OneDrive\Documents\ztest\laminar\frontend\src\i18n'
langs = {'hi': 'hi', 'te': 'te', 'gu': 'gu', 'ta': 'ta'}

updates = {
    'language': {'selectLocale': 'Select Locale'},
    'dashboard': {
        'globalOperationsNetwork': 'Global Operations Network',
        'liveSync': 'Live Sync'
    },
    'cameras': {'awaitingVisionStream': 'Awaiting Vision Stream...'},
    'surge': {'divergentCrowdDetected': 'Divergent Crowd Detected'},
    'smartCity': {'injectMedia': 'Inject Media'}
}

for code, gcode in langs.items():
    file_path = os.path.join(i18n_dir, f'{code}.json')
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        translator = GoogleTranslator(source='en', target=gcode)
        
        for namespace, keys in updates.items():
            if namespace not in data:
                data[namespace] = {}
            for k, text_en in keys.items():
                try:
                    translated = translator.translate(text_en)
                    data[namespace][k] = translated
                except Exception as e:
                    data[namespace][k] = text_en
                    
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f'Updated {code}.json')
