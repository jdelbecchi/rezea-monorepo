import json
import os

log_path = r"C:\Users\jdemo\.gemini\antigravity\brain\24f182fe-1f6b-4f45-bd22-43287e5ee0a9\.system_generated\logs\transcript.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            content = data.get("content", "")
            step_index = data.get("step_index")
            step_type = data.get("type")
            
            # Look at tool calls as well
            tc_str = json.dumps(data.get("tool_calls", []))
            
            if len(content) > 15000 or len(tc_str) > 15000:
                print(f"Step {step_index} ({step_type}) | content length={len(content)} | tool_calls length={len(tc_str)}")
        except Exception as e:
            pass
