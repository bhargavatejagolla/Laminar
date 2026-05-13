import re

path = 'app/api/v1/endpoints/traffic.py'
content = open(path, encoding='utf-8').read()

# Find and swap: put congestionrate_word BEFORE ai_executive_summary
pattern = r'(    def ai_executive_summary\(\).*?return \"low\"\n)'
match = re.search(pattern, content, re.DOTALL)
if match:
    block = match.group(1)
    # Split into the two functions
    exec_match = re.search(r'(    def ai_executive_summary\(\).*?\n        \)\n)', block, re.DOTALL)
    word_match = re.search(r'(    def congestionrate_word\(r: int\).*?return \"low\"\n)', block, re.DOTALL)
    if exec_match and word_match:
        exec_fn = exec_match.group(1)
        word_fn = word_match.group(1)
        new_block = word_fn + '\n' + exec_fn
        content = content.replace(block, new_block, 1)
        open(path, 'w', encoding='utf-8').write(content)
        print('FIXED: congestionrate_word moved before ai_executive_summary')
    else:
        print('Could not split — exec_match:', bool(exec_match), 'word_match:', bool(word_match))
else:
    print('Pattern not found. Checking function lines:')
    for i, line in enumerate(content.split('\n'), 1):
        if 'def ai_executive_summary' in line or 'def congestionrate_word' in line:
            print(f'  Line {i}: {repr(line)}')
