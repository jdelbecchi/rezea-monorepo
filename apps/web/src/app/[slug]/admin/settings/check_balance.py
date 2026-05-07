
import sys

def check_balance(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    stack = []
    pairs = {'(': ')', '{': '}', '[': ']'}
    
    for i, char in enumerate(content):
        if char in pairs:
            stack.append((char, i))
        elif char in pairs.values():
            if not stack:
                print(f"Unexpected closing {char} at index {i}")
                # Print context
                start = max(0, i - 40)
                end = min(len(content), i + 40)
                print(f"Context: {content[start:end]}")
                return False
            opening, pos = stack.pop()
            if pairs[opening] != char:
                print(f"Mismatched {opening} and {char} at index {i}")
                # Print context
                start = max(0, pos - 40)
                end = min(len(content), i + 40)
                print(f"Context: {content[start:end]}")
                return False
                
    if stack:
        char, pos = stack.pop()
        print(f"Unclosed {char} at index {pos}")
        # Print context
        start = max(0, pos - 40)
        end = min(len(content), pos + 40)
        print(f"Context: {content[start:end]}")
        return False
        
    print("Balanced!")
    return True

if __name__ == "__main__":
    check_balance(sys.argv[1])
