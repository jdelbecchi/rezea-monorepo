import json
import os
import re

base_file = r"apps/web/src/app/[slug]/admin/emails/page.tsx"
output_file = r"apps/web/src/app/[slug]/admin/emails/page.tsx" # write directly back to page.tsx

steps = [
    222, 226, 230, 286, 307, 311, 315, 329, 335, 422, 557, 561, 591, 600, 706, 712, 723, 727, 731, 753, 823, 871, 877, 881, 958, 962
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
    
    try:
        pattern = re.compile(escaped_target)
    except Exception as e:
        print(f"ERROR: failed to compile pattern {repr(escaped_target)}: {e}")
        return content
    
    matches = list(pattern.finditer(content_norm))
    if len(matches) == 0:
        # Try finding by literal exact string replace instead of regex
        if target in content_norm:
            return content_norm.replace(target, replacement, 1)
        
        print(f"WARNING: TargetContent not found in step {step_id}, chunk {chunk_idx}!")
        print(f"Original target prefix: {repr(target[:100])}")
        return content
    elif len(matches) > 1:
        print(f"WARNING: TargetContent matches {len(matches)} times in step {step_id}, chunk {chunk_idx}. Using line-range matching...")
        start_line = chunk.get("StartLine")
        end_line = chunk.get("EndLine")
        lines = content_norm.split('\n')
        sub_content = '\n'.join(lines[start_line-1:end_line])
        sub_matches = list(pattern.finditer(sub_content))
        if len(sub_matches) == 1:
            m = sub_matches[0]
            replaced_sub = sub_content[:m.start()] + replacement + sub_content[m.end():]
            lines[start_line-1:end_line] = replaced_sub.split('\n')
            return '\n'.join(lines)
        else:
            # Try literal replacement on sub_content
            if target in sub_content:
                replaced_sub = sub_content.replace(target, replacement, 1)
                lines[start_line-1:end_line] = replaced_sub.split('\n')
                return '\n'.join(lines)
            print(f"ERROR: Found {len(sub_matches)} matches in line range [{start_line}, {end_line}]")
            return content
    else:
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

# Write rebuilt content back with CRLF
with open(output_file, 'w', encoding='utf-8', newline='\r\n') as f:
    f.write(code)

print(f"Successfully rebuilt page at {output_file}!")
