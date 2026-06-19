file_path = r"c:\Users\jdemo\rezea-monorepo\apps\web\src\app\[slug]\admin\emails\page.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "Idées d" in line:
        print(f"Line {i+1}: {repr(line)}")
    if "Astuces et" in line:
        print(f"Line {i+1}: {repr(line)}")
