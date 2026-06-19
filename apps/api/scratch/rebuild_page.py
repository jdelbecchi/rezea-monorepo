import json
import os
import re

base_file = r"apps/web/src/app/[slug]/admin/emails/page.tsx"
output_file = r"apps/api/scratch/rebuilt_page.tsx"

steps = [
    1855, 1861, 1867, 1873, 1879, 1915, 1921, 1925, 1931, 1935, 1939, 1943, 2043, 2094, 2100
]

with open(base_file, 'r', encoding='utf-8') as f:
    code = f.read()

def clean_and_normalize(s):
    if not s:
        return ""
    return s.replace('\r\n', '\n')

def apply_chunk(content, chunk, step_id, chunk_idx):
    target = clean_and_normalize(chunk.get("TargetContent"))
    replacement = clean_and_normalize(chunk.get("ReplacementContent"))
    content_norm = clean_and_normalize(content)
    
    if not target:
        print(f"WARNING: TargetContent is empty in step {step_id}, chunk {chunk_idx}")
        return content
    
    # Escape target for regex
    escaped_target = re.escape(target)
    # Replace non-ascii chars (like \ufffd or other artifacts) with . (wildcard)
    escaped_target = re.sub(r'[^\x00-\x7F]', '.', escaped_target)
    
    # We compile the pattern
    try:
        pattern = re.compile(escaped_target)
    except Exception as e:
        print(f"ERROR: failed to compile pattern {repr(escaped_target)}: {e}")
        return content
    
    # Find all matches
    matches = list(pattern.finditer(content_norm))
    if len(matches) == 0:
        print(f"WARNING: TargetContent not found in step {step_id}, chunk {chunk_idx}!")
        print(f"Target pattern: {repr(escaped_target[:100])}")
        print(f"Original target: {repr(target[:100])}")
        return content
    elif len(matches) > 1:
        print(f"WARNING: TargetContent matches {len(matches)} times in step {step_id}, chunk {chunk_idx}. Using line-range matching...")
        start_line = chunk.get("StartLine")
        end_line = chunk.get("EndLine")
        lines = content_norm.split('\n')
        # Range is 1-indexed and inclusive
        sub_content = '\n'.join(lines[start_line-1:end_line])
        sub_matches = list(pattern.finditer(sub_content))
        if len(sub_matches) == 1:
            m = sub_matches[0]
            replaced_sub = sub_content[:m.start()] + replacement + sub_content[m.end():]
            lines[start_line-1:end_line] = replaced_sub.split('\n')
            return '\n'.join(lines)
        else:
            print(f"ERROR: Found {len(sub_matches)} matches in line range [{start_line}, {end_line}]")
            return content
    else:
        # Unique match
        m = matches[0]
        return content_norm[:m.start()] + replacement + content_norm[m.end():]

for step in steps:
    import glob
    matches = glob.glob(f"apps/api/scratch/step_{step}_tc_*.json")
    if not matches:
        print(f"No match for step {step}")
        continue
    
    filename = matches[0]
    print(f"Applying {filename}...")
    with open(filename, 'r', encoding='utf-8') as f:
        tc = json.load(f)
    
    args = tc.get("args", {})
    name = tc.get("name")
    
    if name == "replace_file_content":
        chunk = {
            "TargetContent": args.get("TargetContent"),
            "ReplacementContent": args.get("ReplacementContent"),
            "StartLine": args.get("StartLine"),
            "EndLine": args.get("EndLine")
        }
        code = apply_chunk(code, chunk, step, 0)
    elif name == "multi_replace_file_content":
        chunks = args.get("ReplacementChunks")
        if isinstance(chunks, str):
            chunks = json.loads(chunks, strict=False)
        for idx, chunk in enumerate(chunks):
            code = apply_chunk(code, chunk, step, idx)

with open(output_file, 'w', encoding='utf-8') as f:
    f.write(code)

print(f"Rebuilt page written to {output_file}")
