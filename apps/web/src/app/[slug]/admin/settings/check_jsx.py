import sys

def check_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Very simple check for balanced braces and parentheses
    braces = 0
    parens = 0
    for i, char in enumerate(content):
        if char == '{': braces += 1
        elif char == '}': braces -= 1
        elif char == '(': parens += 1
        elif char == ')': parens -= 1
        
        if braces < 0:
            print(f"Error: Extra closing brace at index {i}")
            return False
        if parens < 0:
            print(f"Error: Extra closing parenthesis at index {i}")
            return False
            
    if braces != 0:
        print(f"Error: Unbalanced braces: {braces}")
        return False
    if parens != 0:
        print(f"Error: Unbalanced parentheses: {parens}")
        return False
        
    print(f"Success: {path} seems balanced.")
    return True

check_file(r'c:\Users\jdemo\rezea-monorepo\apps\web\src\app\[slug]\admin\finance\page.tsx')
check_file(r'c:\Users\jdemo\rezea-monorepo\apps\web\src\app\[slug]\admin\settings\page.tsx')
