import json
import sys
import os

def update_lang(lang_code, new_data):
    file_path = f"c:/Users/bharg/OneDrive/Documents/ztest/laminar/frontend/src/i18n/{lang_code}.json"
    if not os.path.exists(file_path):
        return
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Simple deep merge
    def merge(dict1, dict2):
        for k, v in dict2.items():
            if k in dict1 and isinstance(dict1[k], dict) and isinstance(v, dict):
                merge(dict1[k], v)
            else:
                dict1[k] = v
                
    merge(data, new_data)
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        updates = json.load(f)
    for lang, data in updates.items():
        update_lang(lang, data)
    print("Languages updated!")
