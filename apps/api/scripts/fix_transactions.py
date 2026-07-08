import os
import re

files_to_fix = [
    os.path.join("app", "api", "bookings.py"),
    os.path.join("app", "services", "orders.py"),
    os.path.join("app", "services", "tasks.py"),
]

def add_strict_transactions(filepath):
    if not os.path.exists(filepath):
        print(f"Skipping {filepath}")
        return
        
    with open(filepath, "r", encoding="utf-8") as f:
        lines = f.readlines()
        
    new_lines = []
    for line in lines:
        match = re.match(r'^(\s*)await db\.commit\(\)\s*$', line)
        if match:
            indent = match.group(1)
            new_lines.append(f"{indent}try:\n")
            new_lines.append(f"{indent}    await db.commit()\n")
            new_lines.append(f"{indent}except Exception:\n")
            new_lines.append(f"{indent}    await db.rollback()\n")
            new_lines.append(f"{indent}    raise\n")
        else:
            new_lines.append(line)
            
    with open(filepath, "w", encoding="utf-8") as f:
        f.writelines(new_lines)
    print(f"Updated {filepath}")

for path in files_to_fix:
    add_strict_transactions(path)
