with open('apps/web/src/app/[slug]/admin/emails/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

stack = []
line_no = 1
col_no = 1

pairs = {
    '}': '{',
    ')': '(',
    ']': '['
}

# Simple scanner to skip string literals, regexes, comments
in_string = None # '"', "'", "`"
in_comment = None # '//', '/*'
in_regex = False
escaped = False

for idx, char in enumerate(code):
    if char == '\n':
        line_no += 1
        col_no = 1
    else:
        col_no += 1

    if escaped:
        escaped = False
        continue

    if char == '\\':
        escaped = True
        continue

    # Comment handling
    if in_comment == '//':
        if char == '\n':
            in_comment = None
        continue
    elif in_comment == '/*':
        if char == '/' and code[idx-1] == '*':
            in_comment = None
        continue

    if not in_string and not in_comment:
        if char == '/' and idx + 1 < len(code) and code[idx+1] == '/':
            in_comment = '//'
            continue
        if char == '/' and idx + 1 < len(code) and code[idx+1] == '*':
            in_comment = '/*'
            continue

    # String handling
    if in_string:
        if char == in_string:
            in_string = None
        continue
    else:
        if char in ['"', "'", "`"]:
            in_string = char
            continue

    # Braces matching
    if char in ['{', '(', '[']:
        stack.append((char, line_no, col_no))
    elif char in ['}', ')', ']']:
        expected = pairs[char]
        if not stack:
            print(f"Error: Unmatched closing '{char}' at line {line_no}, col {col_no}")
        else:
            opened, l, c = stack.pop()
            if opened != expected:
                print(f"Error: Mismatched closing '{char}' at line {line_no}, col {col_no} (expected '{opened}' from line {l}, col {c})")

# Print remaining unmatched in stack
for opened, l, c in stack:
    print(f"Error: Unmatched opening '{opened}' from line {l}, col {c}")

print("Verification complete!")
