import os, re, json

i18n_dir = r'c:\Users\bharg\OneDrive\Documents\ztest\laminar\frontend\src\i18n'
langs = ['en', 'hi', 'te', 'gu', 'ta']

dicts = {}
for code in langs:
    with open(os.path.join(i18n_dir, f'{code}.json'), 'r', encoding='utf-8') as f:
        dicts[code] = json.load(f)
    if 'auto' not in dicts[code]:
        dicts[code]['auto'] = {}

pattern = re.compile(r't\(\"auto\.([a-zA-Z0-9_]+)\"\)\s*\|\|\s*\"([^\"]+)\"')

found = {}
for root, dirs, files in list(os.walk('app')) + list(os.walk('components')):
    for file in files:
        if file.endswith('.tsx'):
            with open(os.path.join(root, file), 'r', encoding='utf-8') as f:
                content = f.read()
            matches = pattern.findall(content)
            for k, v in matches:
                found[k] = v

print(f'Found {len(found)} auto strings in codebase.')

for code in langs:
    for k, v in found.items():
        if k not in dicts[code]['auto']:
            dicts[code]['auto'][k] = v

for code in langs:
    with open(os.path.join(i18n_dir, f'{code}.json'), 'w', encoding='utf-8') as f:
        json.dump(dicts[code], f, ensure_ascii=False, indent=2)

print('Updated JSONs with english fallbacks.')
