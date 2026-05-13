import os
import re

ts_files = []
for root, dirs, files in os.walk('app'):
    for file in files:
        if file.endswith('.tsx'):
            ts_files.append(os.path.join(root, file))
            
for root, dirs, files in os.walk('components'):
    for file in files:
        if file.endswith('.tsx'):
            ts_files.append(os.path.join(root, file))

strings = set()
# regex to find standard JSX text > Text < ignoring nodes that have {} inside or are just spaces
# also find literal text in quotes for buttons like label="Some Text"
tag_content_pattern = re.compile(r'>\s*([A-Za-z][A-Za-z0-9\s,\.\?!&;:-]+[A-Za-z0-9\.?!])\s*<')

for path in ts_files:
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()
        matches = tag_content_pattern.findall(text)
        for m in matches:
            clean = m.strip()
            # simple exclusion of standard variables or i18n
            if '{' not in clean and '}' not in clean and clean != 'Laminar':
                strings.add((clean, path))

with open('hardcoded_strings.txt', 'w', encoding='utf-8') as f:
    for s, path in sorted(strings):
        f.write(f"{s}  ||  {path}\n")

print(f"Found {len(strings)} strings")
