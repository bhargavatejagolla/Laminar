import os
import glob

def replace_in_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        if 'CrowdAlert' not in content and 'crowd_alert' not in content:
            return
            
        new_content = content.replace('CrowdAlert', 'SystemAlert')
        new_content = new_content.replace('crowd_alert', 'system_alert')
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

# Walk through backend/app directory
backend_dir = r"c:\Users\bharg\OneDrive\Documents\ztest\laminar\backend\app"
for root, _, files in os.walk(backend_dir):
    for file in files:
        if file.endswith('.py'):
            filepath = os.path.join(root, file)
            replace_in_file(filepath)
            
print("Done replacing.")
