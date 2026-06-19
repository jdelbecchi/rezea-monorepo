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

def apply_chunk(content, chunk):
    target = clean_and_normalize(chunk.get("TargetContent"))
    replacement = clean_and_normalize(chunk.get("ReplacementContent"))
    content_norm = clean_and_normalize(content)
    if target in content_norm:
        return content_norm.replace(target, replacement, 1)
    return content_norm

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
        code = apply_chunk(code, chunk)

lines = code.split('\n')
for idx, line in enumerate(lines):
    if "isSavingSettings" in line:
        print(f"Line {idx+1}: {line}")
        # print 5 lines before and after
        for sub_idx in range(max(0, idx-5), min(len(lines), idx+10)):
            print(f"  {sub_idx+1}: {lines[sub_idx]}")
        print("---")
