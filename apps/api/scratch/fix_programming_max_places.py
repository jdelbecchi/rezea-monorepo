import os

prog_path = r"c:\Users\jdemo\rezea-monorepo\apps\web\src\app\[slug]\admin\events\programming\page.tsx"

with open(prog_path, "rb") as f:
    prog_bytes = f.read()

prog_lf = prog_bytes.replace(b"\r", b"").decode("utf-8")

old_block = """                                                value={formData.max_places}
                                                onChange={e => setFormData({ ...formData, max_places: parseInt(e.target.value) || 0 })}"""

new_block = """                                                value={formData.max_places}
                                                onChange={e => setFormData({ ...formData, max_places: e.target.value })}"""

if old_block in prog_lf:
    prog_lf = prog_lf.replace(old_block, new_block)
    prog_bytes_updated = prog_lf.replace("\n", "\r\n").encode("utf-8")
    with open(prog_path, "wb") as f:
        f.write(prog_bytes_updated)
    print("Successfully fixed max_places typing issue in programming/page.tsx!")
else:
    print("Error: max_places block not found!")
