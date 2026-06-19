import json

log_path = r"C:\Users\jdemo\.gemini\antigravity\brain\8d2d10ad-919b-4597-bd59-76061cc61f6b\.system_generated\logs\transcript_full.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            step_index = data.get("step_index")
            if step_index == 311:
                print("Step 311 found!")
                for tc in data.get("tool_calls", []):
                    args = tc.get("args", {})
                    target = args.get("TargetContent")
                    print("TargetContent:", repr(target))
                    for char in target:
                        print(f"  {char} -> {ord(char)} (hex: {hex(ord(char))})")
        except Exception as e:
            pass
