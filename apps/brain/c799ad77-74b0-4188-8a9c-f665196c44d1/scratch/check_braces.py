
import sys

def check_braces(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    stack = []
    lines = content.split('\n')
    for i, line in enumerate(lines):
        for j, char in enumerate(line):
            if char == '{':
                stack.append((i + 1, j + 1))
            elif char == '}':
                if not stack:
                    print(f"Extra closing brace at line {i+1}, col {j+1}")
                    return
                stack.pop()
    
    if stack:
        for line, col in stack:
            print(f"Unclosed opening brace at line {line}, col {col}")
    else:
        print("No brace mismatch found")

if __name__ == "__main__":
    check_braces(sys.argv[1])
