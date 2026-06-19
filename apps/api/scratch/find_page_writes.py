import json
import os

log_path = r"C:\Users\jdemo\.gemini\antigravity\brain\24f182fe-1f6b-4f45-bd22-43287e5ee0a9\.system_generated\logs\transcript.jsonl"

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
