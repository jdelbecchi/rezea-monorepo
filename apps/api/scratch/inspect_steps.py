import json
import os

log_path = r"C:\Users\jdemo\.gemini\antigravity\brain\24f182fe-1f6b-4f45-bd22-43287e5ee0a9\.system_generated\logs\transcript.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            step_index = data.get("step_index")
            if 2080 <= step_index <= 2140:
                print(f"Step {step_index} | Type: {data.get('type')} | Source: {data.get('source')}")
                tool_calls = data.get("tool_calls", [])
                if tool_calls:
                    for tc in tool_calls:
                        name = tc.get("name")
                        args = tc.get("arguments", {})
                        target = args.get("TargetFile") or args.get("AbsolutePath") or args.get("CommandLine")
                        print(f"  Tool: {name} | Target: {target}")
                
        except Exception as e:
            pass
