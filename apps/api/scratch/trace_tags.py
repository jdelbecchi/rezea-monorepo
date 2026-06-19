
import re

with open('apps/web/src/app/[slug]/admin/planning/agenda/page.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

stack = []
for i, line in enumerate(lines):
    line_content = re.sub(r'//.*', '', line)
    # Find all <div or </div>
    tags = re.findall(r'<(div\b|/div\b)', line_content)
    for tag in tags:
        if tag == 'div':
            stack.append(i + 1)
        else:
            if stack:
                stack.pop()
            else:
                print(f"Orphaned </div> at line {i + 1}")

for line_num in stack:
    print(f"Unclosed <div> started at line {line_num}")
