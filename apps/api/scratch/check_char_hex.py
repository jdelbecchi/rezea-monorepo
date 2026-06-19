base_file = r"apps/web/src/app/[slug]/admin/emails/page.tsx"
with open(base_file, 'r', encoding='utf-8') as f:
    code = f.read()

lines = code.split('\n')
line_76 = lines[75]
for char in line_76:
    print(f"{char} -> {ord(char)} (hex: {hex(ord(char))})")
