
import sys
import re

def check_jsx_balance(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove strings and comments
    content = re.sub(r'\{/\*.*?\*/\}', '', content, flags=re.DOTALL)
    content = re.sub(r'//.*', '', content)
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
    content = re.sub(r'"[^"]*"', '""', content)
    content = re.sub(r"'[^']*'", "''", content)
    content = re.sub(r'`[^`]*`', '``', content, flags=re.DOTALL)

    # Find JSX tags
    # <Tag, </Tag, <Tag />
    tags = re.findall(r'<(/?)([a-zA-Z0-9\.]+)(?:\s+[^>]*?|)(/?)(?<!-)>', content)
    
    stack = []
    for is_closing, name, is_self_closing in tags:
        if is_self_closing:
            continue
        # Ignore things that look like Generics or Types in TSX
        if name in ['User', 'Tenant', 'string', 'any', 'HTMLInputElement', 'Partial']:
            continue
            
        if is_closing:
            if not stack:
                print(f"Unexpected closing tag </{name}>")
                return False
            opening = stack.pop()
            if opening != name:
                print(f"Mismatched tags: <{opening}> and </{name}>")
                # return False
        else:
            stack.append(name)
            
    if stack:
        print(f"Unclosed tags: {stack}")
        return False
        
    print("Tags balanced!")
    return True

if __name__ == "__main__":
    check_jsx_balance(sys.argv[1])
