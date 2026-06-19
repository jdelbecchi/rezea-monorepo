import os

orders_path = r"c:\Users\jdemo\rezea-monorepo\apps\web\src\app\[slug]\admin\shop\orders\page.tsx"

with open(orders_path, "rb") as f:
    prog_bytes = f.read()

prog_lf = prog_bytes.replace(b"\r", b"").decode("utf-8")

old_line = "import { api, User, OrderItem, InstallmentItem } from \"@/lib/api\";"
new_line = "import { api, User, OrderItem, InstallmentItem, Tenant } from \"@/lib/api\";"

if old_line in prog_lf:
    prog_lf = prog_lf.replace(old_line, new_line)
    prog_bytes_updated = prog_lf.replace("\n", "\r\n").encode("utf-8")
    with open(orders_path, "wb") as f:
        f.write(prog_bytes_updated)
    print("Successfully fixed Tenant import in shop/orders/page.tsx!")
else:
    print("Error: import line in shop/orders/page.tsx not found!")
