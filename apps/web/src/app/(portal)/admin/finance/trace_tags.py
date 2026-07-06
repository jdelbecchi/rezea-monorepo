import sys

def trace_balance(path):
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    braces = 0
    parens = 0
    jsx_tags = []
    
    for i, line in enumerate(lines):
        ln = i + 1
        for j, char in enumerate(line):
            if char == '{': braces += 1
            elif char == '}': braces -= 1
            elif char == '(': parens += 1
            elif char == ')': parens -= 1
            
            if braces < 0:
                print(f"L{ln}C{j+1}: Extra closing brace")
                return
            if parens < 0:
                print(f"L{ln}C{j+1}: Extra closing parenthesis")
                return
        
        # Very crude JSX tag tracker
        # (This is hard to do perfectly with regex, but let's try to find obvious mismatches)
        import re
        tags = re.findall(r'<([a-zA-Z0-9]+)|</([a-zA-Z0-9]+)>', line)
        for open_tag, close_tag in tags:
            if open_tag:
                if open_tag not in ['img', 'input', 'br', 'hr']: # self-closing
                    jsx_tags.append((open_tag, ln))
            elif close_tag:
                if not jsx_tags:
                    print(f"L{ln}: Extra closing tag </{close_tag}>")
                    return
                last_tag, start_ln = jsx_tags.pop()
                if last_tag != close_tag:
                    print(f"L{ln}: Mismatched closing tag </{close_tag}> for <{last_tag}> (from L{start_ln})")
                    return

    if braces != 0: print(f"Unbalanced braces: {braces}")
    if parens != 0: print(f"Unbalanced parentheses: {parens}")
    if jsx_tags:
        for tag, ln in jsx_tags:
            print(f"Unclosed tag <{tag}> from L{ln}")

trace_balance(r'c:\Users\jdemo\rezea-monorepo\apps\web\src\app\[slug]\admin\finance\page.tsx')
