
import sys

def check_braces(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    stack = []
    braces = {'(': ')', '{': '}', '[': ']'}
    
    for i, char in enumerate(content):
        if char in braces.keys():
            stack.append((char, i))
        elif char in braces.values():
            if not stack:
                print(f"Extra closing brace '{char}' at index {i}")
                # Print context
                start = max(0, i - 50)
                end = min(len(content), i + 50)
                print(f"Context: ...{content[start:end]}...")
                return False
            top, pos = stack.pop()
            if braces[top] != char:
                print(f"Mismatched brace '{char}' at index {i}, expected '{braces[top]}' to match '{top}' at index {pos}")
                # Print context
                start = max(0, i - 50)
                end = min(len(content), i + 50)
                print(f"Context: ...{content[start:end]}...")
                return False
    
    if stack:
        for char, pos in stack:
            print(f"Unclosed brace '{char}' at index {pos}")
            # Find line number
            line_no = content.count('\n', 0, pos) + 1
            print(f"Line number: {line_no}")
            # Print context
            start = max(0, pos - 50)
            end = min(len(content), pos + 50)
            print(f"Context: ...{content[start:end]}...")
        return False
    
    print("All braces are balanced!")
    return True

if __name__ == "__main__":
    check_braces(r"c:\Users\jdemo\rezea-monorepo\apps\web\src\app\[slug]\admin\finance\page.tsx")
