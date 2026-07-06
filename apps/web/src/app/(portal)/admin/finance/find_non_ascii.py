with open(r'c:\Users\jdemo\rezea-monorepo\apps\web\src\app\[slug]\admin\finance\page.tsx', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        for char in line:
            if ord(char) > 127:
                print(f"Non-ascii character {char} at line {i+1}")
