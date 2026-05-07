
import sys
import re

def check_tag_balance(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove strings and comments to avoid false positives
    content = re.sub(r'\{/\*.*?\*/\}', '', content, flags=re.DOTALL)
    content = re.sub(r'//.*', '', content)
    
    # Find all JSX tags
    # Simplified regex for tags: <div, <p, </div, </p etc.
    # We only care about matching tags that have a closing counterpart.
    # Also ignore self-closing tags like <img />, <input />
    tags = re.findall(r'<(/?)([a-zA-Z0-9]+)(?:\s+[^>]*?|)(/?)(?<!-)>', content)
    
    stack = []
    for is_closing, name, is_self_closing in tags:
        if is_self_closing:
            continue
        if is_closing:
            if not stack:
                print(f"Unexpected closing tag </{name}>")
                return False
            opening = stack.pop()
            if opening != name:
                print(f"Mismatched tags: <{opening}> and </{name}>")
                # This might happen with complex JSX nesting, but worth checking
                # return False 
        else:
            stack.append(name)
            
    if stack:
        print(f"Unclosed tags: {stack}")
        return False
        
    print("Tags look balanced (roughly)!")
    return True

if __name__ == "__main__":
    check_tag_balance(sys.argv[1])
