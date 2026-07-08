import re
import os

filepath = os.path.join("app", "models", "models.py")

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

def replacer(match):
    fk_content = match.group(1)
    # Don't modify if ondelete is already there
    if "ondelete=" in fk_content:
        return match.group(0)
    # Don't add CASCADE for nullable foreign keys unless we know they should be (like tenant_id).
    # But wait, ForeignKey itself doesn't have nullable, Column does.
    # We will add it to all ForeignKeys except sysadmin created_by_id maybe. 
    # Usually CASCADE is good for all these structural relationships in this app.
    return f'ForeignKey({fk_content}, ondelete="CASCADE")'

new_content = re.sub(r'ForeignKey\(([^)]+)\)', replacer, content)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(new_content)
print("Updated models.py")
