import re

def replace_button(match):
    attrs = match.group(1) or ""
    url = match.group(2)
    text = match.group(3)
    align = "center"
    if "align-right" in attrs or "text-align: right" in attrs:
        align = "right"
    elif "align-left" in attrs or "text-align: left" in attrs:
        align = "left"
    return f"[BUTTON: align={align} url={url} text={text}]"

buttons = [
    '<p><a href="http://example.com">texte</a></p>',
    '<p><a href="http://example.com" target="_blank">texte</a></p>',
    '<p><a href="http://example.com" target="_blank" rel="noopener noreferrer">texte</a></p>',
    '<p class="ql-align-center"><a href="http://example.com">texte</a></p>',
    '<p><a target="_blank" href="http://example.com">texte</a></p>',
    '<p class="ql-align-right"><a target="_blank" rel="noopener" href="http://example.com">texte</a></p>'
]

improved_button_re = re.compile(r'<p([^>]*)>\s*<a\s+(?:[^>]*?\s+)?href="([^"]+)"[^>]*?>\s*([^<]+?)\s*</a>\s*</p>', re.IGNORECASE)

print("--- BUTTON CAPTURE GROUPS TESTS ---")
for b in buttons:
    match = improved_button_re.search(b)
    if match:
        print(f"Input: {b:<90}\nResult: {replace_button(match)}\n")
    else:
        print(f"Input: {b:<90}\nResult: NO MATCH\n")
