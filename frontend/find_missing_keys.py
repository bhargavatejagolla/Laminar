import os, re, json

i18n_dir = r'c:\Users\bharg\OneDrive\Documents\ztest\laminar\frontend\src\i18n'
with open(os.path.join(i18n_dir, 'en.json'), 'r', encoding='utf-8') as f:
    en_dict = json.load(f)

def get_all_keys(d, prefix=''):
    keys = set()
    for k, v in d.items():
        if isinstance(v, dict):
            keys.update(get_all_keys(v, prefix + k + '.'))
        else:
            keys.add(prefix + k)
    return keys

en_keys = get_all_keys(en_dict)

ts_files = []
for root, dirs, files in list(os.walk('app')) + list(os.walk('components')):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            ts_files.append(os.path.join(root, file))

used_keys = set()
pattern = re.compile(r't\(\s*[\"\'\`]([a-zA-Z0-9_\.]+)[\"\'\`]')

for path in ts_files:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    matches = pattern.findall(content)
    for m in matches:
        used_keys.add(m)

missing = used_keys - en_keys
print('Missing keys from codebase that are not in en.json:')
for k in sorted(missing):
    print(' - ' + k)
