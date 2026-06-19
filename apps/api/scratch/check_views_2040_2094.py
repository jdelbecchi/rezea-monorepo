import json
import os

log_path = r"C:\Users\jdemo\.gemini\antigravity\brain\24f182fe-1f6b-4f45-bd22-43287e5ee0a9\.system_generated\logs\transcript.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            step_index = data.get("step_index")
            if 2040 <= step_index <= 2094:
                tool_calls = data.get("tool_calls", [])
                if tool_calls:
                    for tc in tool_calls:
                        name = tc.get("name")
                        args = tc.get("args", {})
                        if name == "view_file" and "page.tsx" in (args.get("AbsolutePath") or ""):
                            print(f"Step {step_index} | View page.tsx | Start={args.get('StartLine')} | End={args.get('EndLine')}")
                if data.get("type") == "VIEW_FILE" and "page.tsx" in data.get("content", ""):
                    content = data.get("content", "")
                    print(f"Step {step_index} (VIEW_FILE response) | content length={len(content)}")
        except Exception as e:
            pass
