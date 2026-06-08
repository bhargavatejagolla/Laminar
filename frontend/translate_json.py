import json
import time
import sys
from deep_translator import GoogleTranslator

sys.stdout.reconfigure(encoding='utf-8')

langs = {'hi': 'hi', 'te': 'te', 'gu': 'gu', 'ta': 'ta'}

dict_files = {}
en_dict = {}

try:
    with open('src/i18n/en.json', 'r', encoding='utf-8') as f:
        en_dict = json.load(f)
except Exception as e:
    print(f"Failed to read en.json: {e}")
    exit(1)

auto_strings = en_dict.get('auto', {})
if not auto_strings:
    print("No auto strings found in en.json")
    exit(0)

keys = list(auto_strings.keys())
texts = [auto_strings[k] for k in keys]

print(f"Found {len(keys)} auto-translated UI items.")

for code, gcode in langs.items():
    print(f"Translating for {code}...")
    try:
        with open(f'src/i18n/{code}.json', 'r', encoding='utf-8') as f:
            target_dict = json.load(f)
    except:
        target_dict = {}

    if 'auto' not in target_dict:
        target_dict['auto'] = {}

    to_translate_keys = []
    to_translate_texts = []
    
    # Check if they are already translated (not just copied over as equal in English unless identical in target config)
    for k, text in auto_strings.items():
        existing = target_dict['auto'].get(k, None)
        # If the key doesn't exist OR the existing value is EXACTLY the english text (which means previous script fallback was applied and we want real translation)
        # We only do this if it contains alphabets to avoid re-translating numbers 
        if not existing or (existing == text and any(c.isalpha() for c in text.replace('Laminar', ''))):
            to_translate_keys.append(k)
            to_translate_texts.append(text)
            
    if not to_translate_keys:
        print(f"No missing translations for {code}.")
        continue

    print(f"Missing {len(to_translate_keys)} translations for {code}.")
    translator = GoogleTranslator(source='en', target=gcode)
    
    # batch translation to avoid timeouts
    batch_size = 50
    for i in range(0, len(to_translate_texts), batch_size):
        b_keys = to_translate_keys[i:i+batch_size]
        b_texts = to_translate_texts[i:i+batch_size]
        
        try:
            results = translator.translate_batch(b_texts)
            for j, res in enumerate(results):
                # if deep-translator didn't fail, update it
                target_dict['auto'][b_keys[j]] = res if res else b_texts[j]
        except Exception as e:
            print(f"GoogleTranslator error: {e}")
            # fallback to manual chunking if batch errors out
            for k, txt in zip(b_keys, b_texts):
                try:
                    res = translator.translate(txt)
                    target_dict['auto'][k] = res if res else txt
                except Exception as inner_e:
                    target_dict['auto'][k] = txt

        time.sleep(0.2)

    with open(f'src/i18n/{code}.json', 'w', encoding='utf-8') as f:
        json.dump(target_dict, f, indent=2, ensure_ascii=False)

print("Done translating dictionary.")
