import os

bookings_path = r"c:\Users\jdemo\rezea-monorepo\apps\web\src\app\[slug]\admin\planning\bookings\page.tsx"

with open(bookings_path, "rb") as f:
    prog_bytes = f.read()

prog_lf = prog_bytes.replace(b"\r", b"").decode("utf-8")

old_block = """                                <button 
                                    onClick={() => handleDelete(deleteConfirmId)}"""

new_block = """                                <button 
                                    onClick={() => handleDelete()}"""

if old_block in prog_lf:
    prog_lf = prog_lf.replace(old_block, new_block)
    prog_bytes_updated = prog_lf.replace("\n", "\r\n").encode("utf-8")
    with open(bookings_path, "wb") as f:
        f.write(prog_bytes_updated)
    print("Successfully fixed handleDelete argument type error in bookings/page.tsx!")
else:
    print("Error: handleDelete button block not found!")
