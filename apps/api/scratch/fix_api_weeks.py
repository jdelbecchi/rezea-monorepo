import os

api_path = r"c:\Users\jdemo\rezea-monorepo\apps\web\src\lib\api.ts"

with open(api_path, "rb") as f:
    prog_bytes = f.read()

prog_lf = prog_bytes.replace(b"\r", b"").decode("utf-8")

old_line = "  validity_unit: 'days' | 'months';"
new_line = "  validity_unit: 'days' | 'weeks' | 'months';"

if old_line in prog_lf:
    prog_lf = prog_lf.replace(old_line, new_line)
    prog_bytes_updated = prog_lf.replace("\n", "\r\n").encode("utf-8")
    with open(api_path, "wb") as f:
        f.write(prog_bytes_updated)
    print("Successfully fixed validity_unit type in api.ts!")
else:
    print("Error: validity_unit line in api.ts not found!")
