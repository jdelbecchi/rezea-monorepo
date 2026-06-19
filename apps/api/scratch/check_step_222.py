import json
import re

base_file = r"apps/web/src/app/[slug]/admin/emails/page.tsx"
log_path = r"C:\Users\jdemo\.gemini\antigravity\brain\8d2d10ad-919b-4597-bd59-76061cc61f6b\.system_generated\logs\transcript_full.jsonl"

with open(base_file, 'r', encoding='utf-8') as f:
    code = f.read()

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            step_index = data.get("step_index")
            if step_index == 222:
                print("Step 222 found!")
                for tc in data.get("tool_calls", []):
                    args = tc.get("args", {})
                    target = args.get("TargetContent")
                    print("TargetContent:", repr(target))
                    print("TargetContent in code:", repr(target) in code)
        except Exception as e:
            pass
