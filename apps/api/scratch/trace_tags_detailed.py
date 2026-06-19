
import re

with open('apps/web/src/app/[slug]/admin/planning/agenda/page.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

stack = []
for i, line in enumerate(lines):
    line_content = re.sub(r'//.*', '', line)
    # Find all <div or </div>
    matches = re.finditer(r'<(div\b|/div\b)', line_content)
    for match in matches:
        tag = match.group(1)
        if tag == 'div':
            stack.append(i + 1)
        else:
            if stack:
                start_line = stack.pop()
                if i + 1 >= 710 and i + 1 <= 730:
                    print(f"Line {i+1}: </div> closes <div> from line {start_line}")
            else:
                print(f"Orphaned </div> at line {i + 1}")

if stack:
    print(f"Unclosed divs: {stack}")
