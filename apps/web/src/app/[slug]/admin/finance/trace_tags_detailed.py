import sys
import re

def trace_balance(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove strings and comments
    content = re.sub(r'//.*', '', content)
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
    
    lines = content.splitlines()
    braces = 0
    parens = 0
    jsx_tags = []
    
    for i, line in enumerate(lines):
        ln = i + 1
        
        for char in line:
            if char == '{': braces += 1
            elif char == '}': braces -= 1
            elif char == '(': parens += 1
            elif char == ')': parens -= 1
        
        # Find all tokens
        tokens = re.findall(r'<([a-zA-Z0-9]+)|</([a-zA-Z0-9]+)>|(/>)', line)
        for t in tokens:
            open_tag, close_tag, self_close = t
            if open_tag:
                jsx_tags.append((open_tag, ln))
            elif close_tag:
                if not jsx_tags:
                    print(f"L{ln}: Extra closing tag </{close_tag}>")
                    return
                last_tag, start_ln = jsx_tags.pop()
                if last_tag != close_tag:
                    print(f"L{ln}: Mismatched closing tag </{close_tag}> for <{last_tag}> (from L{start_ln})")
                    return
            elif self_close:
                if jsx_tags:
                    jsx_tags.pop()

    if braces != 0: print(f"Unbalanced braces: {braces}")
    if parens != 0: print(f"Unbalanced parentheses: {parens}")
    if jsx_tags:
        for tag, ln in jsx_tags:
            print(f"Unclosed tag <{tag}> from L{ln}")

trace_balance(r'c:\Users\jdemo\rezea-monorepo\apps\web\src\app\[slug]\admin\finance\page.tsx')
