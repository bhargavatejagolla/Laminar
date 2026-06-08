import os
import re
import json
import time

try:
    from deep_translator import GoogleTranslator
    has_translator = True
except:
    has_translator = False
    print("No deep_translator")

ts_files = []
for root, dirs, files in list(os.walk('app')) + list(os.walk('components')):
    for file in files:
        if file.endswith('.tsx'):
            ts_files.append(os.path.join(root, file))

skip_files = ['layout.tsx', 'globals.css', 'config.ts', 'tmp_update_i18n.py', 'find_strings.py', 'i18n-provider.tsx', 'language-switcher.tsx']

tag_content_pattern = re.compile(r'>\s*([A-Za-z][A-Za-z0-9\s,\.\?!&;:-]+[A-Za-z0-9\.?!])\s*<')

auto_dict = {}
changed_files = 0

def make_key(s):
    clean = re.sub(r'[^A-Za-z0-9]', '', s)
    return clean[:15] + "_" + str(abs(hash(s)) % 10000)

for path in ts_files:
    if any(skip in path for skip in skip_files):
        continue
        
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()

    matches = tag_content_pattern.findall(text)
    valid_matches = set()
    for m in matches:
        clean = m.strip()
        if '{' not in clean and '}' not in clean and len(clean) > 1 and clean != 'Laminar':
            valid_matches.add(clean)

    if not valid_matches:
        continue

    if 'useTranslation' not in text:
        import_stmt = 'import { useTranslation } from "react-i18next";\n'
        last_import = text.rfind('import ')
        if last_import != -1:
            end_of_line = text.find('\n', last_import)
            text = text[:end_of_line+1] + import_stmt + text[end_of_line+1:]
        else:
            text = import_stmt + text

    # Handle component injection
    if 'const { t } = useTranslation()' not in text:
        func_match = re.search(r'(export default function|export function|function) [A-Z][a-zA-Z0-9_]*\([^)]*\)\s*{', text)
        if func_match:
            insert_pos = func_match.end()
            text = text[:insert_pos] + '\n  const { t } = useTranslation();\n' + text[insert_pos:]
        else:
            func_match2 = re.search(r'const [A-Z][a-zA-Z0-9_]*\s*=\s*\([^)]*\)\s*=>\s*{', text)
            if func_match2:
                insert_pos = func_match2.end()
                text = text[:insert_pos] + '\n  const { t } = useTranslation();\n' + text[insert_pos:]

    if 'const { t } = useTranslation()' not in text:
        continue

    original_text = text
    
    # We create a dictionary of clean -> replacement
    for clean_text in valid_matches:
        key = make_key(clean_text)
        auto_dict[key] = clean_text

    # Provide a function for re.sub to evaluate
    def replacer(match):
        full_match = match.group(0)
        inner_str = match.group(1).strip()
        
        if inner_str in valid_matches:
            key = make_key(inner_str)
            # Find exactly where inner_str is inside the match
            start_idx = full_match.find(inner_str)
            end_idx = start_idx + len(inner_str)
            rep = f'{{t("auto.{key}") || "{inner_str}"}}'
            return full_match[:start_idx] + rep + full_match[end_idx:]
            
        return full_match

    new_text = tag_content_pattern.sub(replacer, text)
    
    if new_text != original_text:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_text)
        changed_files += 1

print(f"Modified {changed_files} TSX files.")
print(f"Collected {len(auto_dict)} unique strings for translation.")

langs = {'en': 'en', 'hi': 'hi', 'te': 'te', 'gu': 'gu', 'ta': 'ta'}
dict_files = {}

for l in langs.keys():
    try:
        with open(f'src/i18n/{l}.json', 'r', encoding='utf-8') as f:
            dict_files[l] = json.load(f)
    except:
        dict_files[l] = {}

for l in langs.keys():
    if 'auto' not in dict_files[l]:
        dict_files[l]['auto'] = {}

texts_to_translate = list(auto_dict.values())
keys_to_translate = list(auto_dict.keys())

for code, gcode in langs.items():
    if code == 'en':
        for k, txt in auto_dict.items():
            dict_files[code]['auto'][k] = txt
        continue
        
    print(f"Translating for {code}...")
    if not has_translator:
        continue
        
    batch_size = 30
    for i in range(0, len(texts_to_translate), batch_size):
        batch_keys = keys_to_translate[i:i+batch_size]
        batch_texts = texts_to_translate[i:i+batch_size]
        
        missing = [k for k in batch_keys if k not in dict_files[code]['auto']]
        if not missing:
            continue
            
        texts_to_do = [auto_dict[k] for k in missing]
        
        try:
            translator_instance = GoogleTranslator(source='en', target=gcode)
            results = translator_instance.translate_batch(texts_to_do)
                
            for k, res in zip(missing, results):
                dict_files[code]['auto'][k] = res if res else auto_dict[k]
            time.sleep(0.5)
        except Exception as e:
            print(f"Translate error for {code} on {texts_to_do}: {e}")
            for k, txt in zip(missing, texts_to_do):
                dict_files[code]['auto'][k] = txt

for code in langs.keys():
    with open(f'src/i18n/{code}.json', 'w', encoding='utf-8') as f:
        json.dump(dict_files[code], f, indent=2, ensure_ascii=False)
        
print("Updated all language JSON files.")
