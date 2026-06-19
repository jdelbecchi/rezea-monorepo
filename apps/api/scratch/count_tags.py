
import re

with open('apps/web/src/app/[slug]/admin/planning/agenda/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove comments
content = re.sub(r'//.*', '', content)
content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)

# Count <div and </div>
opens = len(re.findall(r'<div\b', content))
closes = len(re.findall(r'</div\b', content))

print(f"Opens: {opens}")
print(f"Closes: {closes}")

# Also count <main and </main
m_opens = len(re.findall(r'<main\b', content))
m_closes = len(re.findall(r'</main\b', content))
print(f"Main Opens: {m_opens}")
print(f"Main Closes: {m_closes}")
