import os

offers_path = r"c:\Users\jdemo\rezea-monorepo\apps\web\src\app\[slug]\admin\shop\offers\page.tsx"

with open(offers_path, "rb") as f:
    prog_bytes = f.read()

prog_lf = prog_bytes.replace(b"\r", b"").decode("utf-8")

old_line = '    validity_unit: "months" as "days" | "months",'
new_line = '    validity_unit: "months" as "days" | "weeks" | "months",'

if old_line in prog_lf:
    prog_lf = prog_lf.replace(old_line, new_line)
    prog_bytes_updated = prog_lf.replace("\n", "\r\n").encode("utf-8")
    with open(offers_path, "wb") as f:
        f.write(prog_bytes_updated)
    print("Successfully fixed validity_unit type overlap in shop/offers/page.tsx!")
else:
    print("Error: emptyForm validity_unit type line not found!")
