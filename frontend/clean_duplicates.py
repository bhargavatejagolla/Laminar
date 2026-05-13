import os, glob, re

files = glob.glob('app/**/*.tsx', recursive=True) + glob.glob('components/**/*.tsx', recursive=True)

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # 1. Clean up duplicated 'const { t } = useTranslation();' 
    # Match 2 or more of these lines consecutive, accounting for spaces/newlines
    # Using a robust regex
    pattern = r'(?:[ \t]*const \{\s*t\s*\} = useTranslation\(\);\s*){2,}'
    
    new_content = re.sub(pattern, '  const { t } = useTranslation();\n', content)
    
    if new_content != content:
        with open(f, 'w', encoding='utf-8') as file:
            file.write(new_content)
        print(f"Cleaned duplicates in {f}")
