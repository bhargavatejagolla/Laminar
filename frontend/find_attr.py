import os, re
import json

found_strings = set()

for root, dirs, files in list(os.walk('app')) + list(os.walk('components')):
    for file in files:
        if file.endswith('.tsx'):
            with open(os.path.join(root, file), 'r', encoding='utf-8') as f:
                content = f.read()
            matches = re.findall(r'(?:placeholder|title|label)=\"([a-zA-Z][^\"]*)\"', content)
            if matches:
                for m in matches:
                    if '{' not in m and '}' not in m:
                        print(f'{file}: {m}')
                        found_strings.add(m)

print(f"Total found: {len(found_strings)}")
