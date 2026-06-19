import json
import re

base_file = r"apps/web/src/app/[slug]/admin/emails/page.tsx"
log_path = r"C:\Users\jdemo\.gemini\antigravity\brain\8d2d10ad-919b-4597-bd59-76061cc61f6b\.system_generated\logs\transcript_full.jsonl"

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
    
    if target in content_norm:
        return content_norm.replace(target, replacement, 1)
    
    escaped_target = re.escape(target)
    escaped_target = re.sub(r'[^\x00-\x7F]', '.', escaped_target)
    try:
        pattern = re.compile(escaped_target)
    except Exception as e:
        print("Compile err:", e)
        return content
        
    matches = list(pattern.finditer(content_norm))
    if len(matches) == 1:
        m = matches[0]
        return content_norm[:m.start()] + replacement + content_norm[m.end():]
    return None

steps_to_apply = [222, 226, 230]
tool_calls_found = []

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            step_index = data.get("step_index")
            if step_index in steps_to_apply:
                tcs = data.get("tool_calls", [])
                for tc in tcs:
                    tool_calls_found.append(tc)
        except Exception as e:
            pass

for tc in tool_calls_found:
    name = tc.get("name")
    args = tc.get("args")
    if name == "replace_file_content":
        chunk = {
            "TargetContent": args.get("TargetContent"),
            "ReplacementContent": args.get("ReplacementContent"),
        }
        res = apply_chunk(code, chunk, 0, 0)
        if res:
            code = res
            print("Applied replace_file_content")
        else:
            print("Failed replace_file_content")
    elif name == "multi_replace_file_content":
        chunks = args.get("ReplacementChunks")
        if isinstance(chunks, str):
            chunks = json.loads(chunks)
        for i, chunk in enumerate(chunks):
            res = apply_chunk(code, chunk, 0, i)
            if res:
                code = res
                print(f"Applied chunk {i}")
            else:
                print(f"Failed chunk {i}")

# Print occurrences of isSavingSettings
print("\n--- occurrences of isSavingSettings ---")
for line in code.split('\n'):
    if "isSavingSettings" in line or "isSaving" in line:
        print(line)
