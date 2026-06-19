import json
import os

log_path = r"C:\Users\jdemo\.gemini\antigravity\brain\8d2d10ad-919b-4597-bd59-76061cc61f6b\.system_generated\logs\transcript.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            step_index = data.get("step_index")
            tool_calls = data.get("tool_calls", [])
            for tc in tool_calls:
                name = tc.get("name")
                args = tc.get("args", {})
                target = args.get("TargetFile") or args.get("AbsolutePath") or ""
                if "page.tsx" in target and name in ["write_to_file", "replace_file_content", "multi_replace_file_content"]:
                    print(f"Step {step_index} | Tool: {name} | Description: {args.get('Description') or args.get('Instruction')}")
        except Exception as e:
            pass
