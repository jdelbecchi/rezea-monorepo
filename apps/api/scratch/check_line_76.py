base_file = r"apps/web/src/app/[slug]/admin/emails/page.tsx"
with open(base_file, 'r', encoding='utf-8') as f:
    code = f.read()

lines = code.split('\n')
print("Line 76:", repr(lines[75]))
print("Line 75:", repr(lines[74]))
print("Line 77:", repr(lines[76]))
