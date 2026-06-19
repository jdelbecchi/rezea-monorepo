with open("apps/web/src/app/[slug]/admin/emails/page.tsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

print("Line 145 repr:", repr(lines[144]))
print("Line 336 repr:", repr(lines[335]))
