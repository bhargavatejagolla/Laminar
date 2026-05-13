import re
import os

files = [
    "app/ai-search/page.tsx",
    "app/cameras/health/page.tsx",
    "app/dashboard/page.tsx",
    "app/page.tsx",
    "app/prediction/page.tsx",
    "app/register/page.tsx",
    "app/settings/page.tsx",
    "app/verify-email/page.tsx",
    "components/landing/sections.tsx",
    "components/map/IntelligenceMap.tsx",
    "components/Onboarding/RandyAssistant.tsx",
    "components/SurveyScene3D.tsx"
]

def inject_hook(content):
    # Find all component functions. Let's look for functions returning JSX.
    # A heuristic: look for `function ComponentName` or `const ComponentName =` that starts with an uppercase letter.
    
    # Pass 1: export default function X() {
    def replacer(match):
        sig = match.group(0)
        # if t is already in signature or block, skip?
        if 'const { t } = useTranslation' in sig:
            return sig
        return sig + '\n  const { t } = useTranslation();'

    # Match `export default function X(...) {` or `export function X(...) {` or `function X(...) {` for Uppercase X
    pattern1 = re.compile(r'(?:export\s+default\s+)?(?:export\s+)?function\s+[A-Z][a-zA-Z0-9_]*\s*\([^)]*\)\s*\{')
    c2 = pattern1.sub(replacer, content)

    # Pass 2: export const X = (...) => {
    pattern2 = re.compile(r'(?:export\s+)?const\s+[A-Z][a-zA-Z0-9_]*\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{')
    c3 = pattern2.sub(replacer, c2)
    
    # Let's ensure useTranslation is imported at the top
    if 'from "react-i18next"' not in c3 and 'from \'react-i18next\'' not in c3:
        if 'import' in c3:
            c3 = re.sub(r'(import [^\n]+\n)', r'\1import { useTranslation } from "react-i18next";\n', c3, count=1)
        else:
            c3 = 'import { useTranslation } from "react-i18next";\n' + c3

    return c3

for fb in files:
    if not os.path.exists(fb):
        continue
    with open(fb, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = inject_hook(content)
    
    with open(fb, 'w', encoding='utf-8') as f:
        f.write(new_content)
        
print("Hooks injected into targets.")
