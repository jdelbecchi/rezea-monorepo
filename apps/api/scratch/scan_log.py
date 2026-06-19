import json
import re

log_path = r"C:\Users\jdemo\.gemini\antigravity\brain\8d2d10ad-919b-4597-bd59-76061cc61f6b\.system_generated\logs\transcript_full.jsonl"

tool_calls_found = []

with open(log_path, 'r', encoding='utf-8') as f:
    for line_idx, line in enumerate(f):
        try:
            data = json.loads(line)
            step_index = data.get("step_index", line_idx)
            
            # The tool calls can be in 'tool_calls' of the record
            tcs = data.get("tool_calls", [])
            
            # If not there, let's check inside 'content' or nested blocks if any
            if not tcs and "content" in data:
                # Sometimes it's a string containing JSON, or structured data
                pass
                
            for tc in tcs:
                name = tc.get("name")
                args = tc.get("args", {})
                target = args.get("TargetFile") or args.get("AbsolutePath") or ""
                if "page.tsx" in target and name in ["replace_file_content", "multi_replace_file_content"]:
                    tool_calls_found.append({
                        "step_index": step_index,
                        "name": name,
                        "args": args
                    })
        except Exception as e:
            pass

print(f"Found {len(tool_calls_found)} tool calls targeting page.tsx:")
for idx, tc in enumerate(tool_calls_found):
    print(f"[{idx}] Step {tc['step_index']} | Tool: {tc['name']} | Description: {tc['args'].get('Description') or tc['args'].get('Instruction')}")
