import os, re

dirs = ['app', 'components']
changed = 0

for d in dirs:
    for root, _, files in os.walk(d):
        for f in files:
            if f.endswith('.tsx') or f.endswith('.ts'):
                path = os.path.join(root, f)
                with open(path, 'r', encoding='utf-8') as file:
                    content = file.read()
                
                # Replace exact match
                new_content = content.replace('import {\nimport { useTranslation } from "react-i18next";', 'import { useTranslation } from "react-i18next";\nimport {')
                
                # In case there's a space after {
                new_content = re.sub(r'import\s*\{\s*\n\s*import\s*\{\s*useTranslation\s*\}\s*from\s*"react-i18next";', 'import { useTranslation } from "react-i18next";\nimport {', new_content)
                
                if new_content != content:
                    with open(path, 'w', encoding='utf-8') as file:
                        file.write(new_content)
                    changed += 1

print(f'Fixed import syntax in {changed} files.')
