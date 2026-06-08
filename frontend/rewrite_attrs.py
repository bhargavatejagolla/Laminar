import os, re, json, time, sys
from deep_translator import GoogleTranslator

sys.stdout.reconfigure(encoding='utf-8')

ts_files = []
for root, dirs, files in list(os.walk('app')) + list(os.walk('components')):
    for file in files:
        if file.endswith('.tsx'):
            ts_files.append(os.path.join(root, file))

skip_files = ['layout.tsx', 'globals.css', 'config.ts', 'tmp_update_i18n.py', 'find_strings.py', 'i18n-provider.tsx', 'language-switcher.tsx']

attr_pattern = re.compile(r'\b(placeholder|title|label)=\"([a-zA-Z][^\"]*)\"')

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

    matches = attr_pattern.findall(text)
    valid_matches = []
    for attr_name, val in matches:
        if '{' not in val and '}' not in val and len(val) > 1:
            valid_matches.append((attr_name, val))

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
    
    for attr_name, val in valid_matches:
        key = make_key(val)
        auto_dict[key] = val
        old_str = f'{attr_name}="{val}"'
        new_str = f'{attr_name}={{t("auto.{key}") || "{val}"}}'
        text = text.replace(old_str, new_str)
    
    if text != original_text:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
        changed_files += 1

print(f"Modified {changed_files} TSX files.")
print(f"Collected {len(auto_dict)} unique attributes for translation.")

langs = {'en': 'en', 'hi': 'hi', 'te': 'te', 'gu': 'gu', 'ta': 'ta'}
dict_files = {}

for l in langs.keys():
    try:
        with open(f'src/i18n/{l}.json', 'r', encoding='utf-8') as f:
            dict_files[l] = json.load(f)
    except:
        dict_files[l] = {}
    if 'auto' not in dict_files[l]:
        dict_files[l]['auto'] = {}

for code, gcode in langs.items():
    if code == 'en':
        for k, txt in auto_dict.items():
            dict_files[code]['auto'][k] = txt
        continue
        
    print(f"Translating for {code}...")
    translator = GoogleTranslator(source='en', target=gcode)
    
    missing = [k for k in auto_dict.keys() if k not in dict_files[code]['auto']]
    if not missing:
        continue
        
    texts_to_do = [auto_dict[k] for k in missing]
    try:
        results = translator.translate_batch(texts_to_do)
        for k, res in zip(missing, results):
            dict_files[code]['auto'][k] = res if res else auto_dict[k]
    except Exception as e:
        print(f"Error: {e}")
        for k, txt in zip(missing, texts_to_do):
            dict_files[code]['auto'][k] = txt

for code in langs.keys():
    with open(f'src/i18n/{code}.json', 'w', encoding='utf-8') as f:
        json.dump(dict_files[code], f, indent=2, ensure_ascii=False)
        
print("Updated all language JSON files with attributes.")
