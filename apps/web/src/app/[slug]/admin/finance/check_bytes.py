with open(r'c:\Users\jdemo\rezea-monorepo\apps\web\src\app\[slug]\admin\finance\page.tsx', 'rb') as f:
    lines = f.readlines()
    line_202 = lines[201]
    print(f"Line 202 bytes: {line_202}")
