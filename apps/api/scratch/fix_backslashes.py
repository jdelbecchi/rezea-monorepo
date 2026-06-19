file_path = "apps/web/src/app/[slug]/admin/emails/page.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace escaped backticks with regular backticks
fixed_content = content.replace("\\`", "`")

# Replace escaped template interpolations with regular template interpolations
fixed_content = fixed_content.replace("\\${", "${")

with open(file_path, "w", encoding="utf-8", newline="\r\n") as f:
    f.write(fixed_content)

print("Backslashes cleaned up successfully!")
