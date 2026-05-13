import glob
import re

files = glob.glob('app/**/*.tsx', recursive=True) + glob.glob('components/**/*.tsx', recursive=True)
issues = []

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # We want to find cases where there's a React component (assuming 'export default function X() {', or 'function X() {')
    # that uses 't(' inside but lacks 'const { t } = useTranslation()' inside its block.
    # A simple proxy: if the file has multiple 'function X' blocks, we can just visually inspect or do a robust check.
    # Actually, a better proxy: just list all files that have `t("auto`
    # and then check if the COUNT of `function ` is greater than 1, and the count of `const { t }` is less than or eq 1.
    if 't("auto' in content:
        func_count = len(re.findall(r'(?:export default )?(?:function|const) [A-Z][a-zA-Z0-9_]*\s*(?:=\s*(?:\([^)]*\)|[^=]*)\s*=>|\([^)]*\))|export default function', content))
        t_count = content.count('const { t } = useTranslation')
        if func_count > t_count:
            issues.append(f)

print("Files with potentially missing useTranslation block contexts:")
for issue in issues:
    print(issue)
