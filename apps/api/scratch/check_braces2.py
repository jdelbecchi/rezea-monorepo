import re

def check_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # We want to scan the file character by character
    # States:
    # 'NORMAL'
    # 'IN_STRING_SINGLE' ( ' )
    # 'IN_STRING_DOUBLE' ( " )
    # 'IN_STRING_BACKTICK' ( ` )
    # 'IN_LINE_COMMENT' ( // )
    # 'IN_BLOCK_COMMENT' ( /* )
    # 'IN_REGEX' ( / )
    
    state = 'NORMAL'
    stack = []
    
    line = 1
    col = 1
    
    escaped = False
    
    i = 0
    n = len(content)
    
    # Track nesting
    pairs = {'}': '{', ')': '(', ']': '['}
    
    while i < n:
        char = content[i]
        
        # Track line/col
        if char == '\n':
            line += 1
            col = 1
        else:
            col += 1
            
        if escaped:
            escaped = False
            i += 1
            continue
            
        if char == '\\':
            escaped = True
            i += 1
            continue
            
        # Line comments
        if state == 'IN_LINE_COMMENT':
            if char == '\n':
                state = 'NORMAL'
            i += 1
            continue
            
        # Block comments
        if state == 'IN_BLOCK_COMMENT':
            if char == '/' and content[i-1] == '*':
                state = 'NORMAL'
            i += 1
            continue
            
        # Single line strings
        if state == 'IN_STRING_SINGLE':
            if char == "'":
                state = 'NORMAL'
            i += 1
            continue
            
        if state == 'IN_STRING_DOUBLE':
            if char == '"':
                state = 'NORMAL'
            i += 1
            continue
            
        # Template literal strings
        if state == 'IN_STRING_BACKTICK':
            # Check for interpolation start ${
            if char == '$' and i + 1 < n and content[i+1] == '{':
                # We push the backtick state, enter normal state to parse the interpolation
                stack.append(('BACKTICK_INTERPOLATION', line, col))
                state = 'NORMAL'
                i += 2
                col += 1
                continue
            if char == '`':
                state = 'NORMAL'
            i += 1
            continue
            
        # Normal code parsing
        if state == 'NORMAL':
            # Check comment start
            if char == '/' and i + 1 < n and content[i+1] == '/':
                state = 'IN_LINE_COMMENT'
                i += 2
                col += 1
                continue
            if char == '/' and i + 1 < n and content[i+1] == '*':
                state = 'IN_BLOCK_COMMENT'
                i += 2
                col += 1
                continue
                
            # Check string start
            if char == "'":
                state = 'IN_STRING_SINGLE'
                i += 1
                continue
            if char == '"':
                state = 'IN_STRING_DOUBLE'
                i += 1
                continue
            if char == '`':
                state = 'IN_STRING_BACKTICK'
                i += 1
                continue
                
            # Brackets
            if char in ('{', '(', '['):
                stack.append((char, line, col))
            elif char in ('}', ')', ']'):
                expected = pairs[char]
                if not stack:
                    print(f"Error: Unmatched closing '{char}' at line {line}, col {col}")
                else:
                    top, l, c = stack.pop()
                    if top == 'BACKTICK_INTERPOLATION' and char == '}':
                        # Closed the interpolation, resume backtick string state
                        state = 'IN_STRING_BACKTICK'
                    elif top != expected:
                        print(f"Error: Mismatched closing '{char}' at line {line}, col {col} (expected '{top}' from line {l}, col {c})")
            i += 1
            
    # Check what remains in stack
    for opened, l, c in stack:
        print(f"Error: Unmatched opening '{opened}' from line {l}, col {c}")

check_file('apps/web/src/app/[slug]/admin/emails/page.tsx')
print("Check complete!")
