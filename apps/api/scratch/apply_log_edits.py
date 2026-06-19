import json
import os
import re
import sys

base_file = r"apps/web/src/app/[slug]/admin/emails/page.tsx"
log_path = r"C:\Users\jdemo\.gemini\antigravity\brain\8d2d10ad-919b-4597-bd59-76061cc61f6b\.system_generated\logs\transcript_full.jsonl"

# Set console output to UTF-8
if sys.platform.startswith('win'):
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

with open(base_file, 'r', encoding='utf-8') as f:
    code = f.read()

tool_calls_found = []

with open(log_path, 'r', encoding='utf-8') as f:
    for line_idx, line in enumerate(f):
        try:
            data = json.loads(line)
            step_index = data.get("step_index", line_idx)
            tcs = data.get("tool_calls", [])
            for tc in tcs:
                name = tc.get("name")
                args = tc.get("args", {})
                target = args.get("TargetFile") or args.get("AbsolutePath") or ""
                if "admin/emails/page.tsx" in target.replace('\\', '/') and name in ["replace_file_content", "multi_replace_file_content"]:
                    tool_calls_found.append({
                        "step_index": step_index,
                        "name": name,
                        "args": args
                    })
        except Exception as e:
            pass

print(f"Found {len(tool_calls_found)} tool calls targeting admin/emails/page.tsx")

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
    
    # Try direct literal search and replace
    if target in content_norm:
        return content_norm.replace(target, replacement, 1)
        
    # Regex fallback if literal match fails (e.g. whitespace differences or wildcard chars)
    escaped_target = re.escape(target)
    escaped_target = re.sub(r'[^\x00-\x7F]', '.', escaped_target) # wildcard non-ascii
    
    try:
        pattern = re.compile(escaped_target)
    except Exception as e:
        print(f"ERROR: failed to compile pattern for step {step_id}: {e}")
        return content
        
    matches = list(pattern.finditer(content_norm))
    if len(matches) == 1:
        m = matches[0]
        return content_norm[:m.start()] + replacement + content_norm[m.end():]
    elif len(matches) > 1:
        start_line = chunk.get("StartLine")
        end_line = chunk.get("EndLine")
        lines = content_norm.split('\n')
        sub_content = '\n'.join(lines[start_line-1:end_line])
        if target in sub_content:
            replaced_sub = sub_content.replace(target, replacement, 1)
            lines[start_line-1:end_line] = replaced_sub.split('\n')
            return '\n'.join(lines)
        sub_matches = list(pattern.finditer(sub_content))
        if len(sub_matches) == 1:
            m = sub_matches[0]
            replaced_sub = sub_content[:m.start()] + replacement + sub_content[m.end():]
            lines[start_line-1:end_line] = replaced_sub.split('\n')
            return '\n'.join(lines)
            
    print(f"CRITICAL: Could not find TargetContent for step {step_id}, chunk {chunk_idx}!")
    print(f"Target excerpt: {repr(target[:100])}")
    return content

for idx, tc in enumerate(tool_calls_found):
    step_id = tc["step_index"]
    name = tc["name"]
    args = tc["args"]
    desc = args.get("Description") or args.get("Instruction") or ""
    print(f"Applying edit [{idx}] step {step_id} - {desc[:80]}...")
    
    if name == "replace_file_content":
        chunk = {
            "TargetContent": args.get("TargetContent"),
            "ReplacementContent": args.get("ReplacementContent"),
            "StartLine": args.get("StartLine"),
            "EndLine": args.get("EndLine")
        }
        code = apply_chunk(code, chunk, step_id, 0)
    elif name == "multi_replace_file_content":
        chunks = args.get("ReplacementChunks")
        if isinstance(chunks, str):
            chunks = json.loads(chunks, strict=False)
        for chunk_idx, chunk in enumerate(chunks):
            code = apply_chunk(code, chunk, step_id, chunk_idx)

# Write output file
with open(base_file, 'w', encoding='utf-8', newline='\r\n') as f:
    f.write(code)

print("Rebuild of page.tsx completed successfully!")
