import json
import re

log_path = r"C:\Users\jdemo\.gemini\antigravity\brain\8d2d10ad-919b-4597-bd59-76061cc61f6b\.system_generated\logs\transcript_full.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            step_index = data.get("step_index")
            if step_index == 286:
                print(f"Step {step_index}")
                tcs = data.get("tool_calls", [])
                for tc in tcs:
                    args = tc.get("args", {})
                    chunks = args.get("ReplacementChunks")
                    if isinstance(chunks, str):
                        chunks = json.loads(chunks)
                    for i, chunk in enumerate(chunks):
                        print(f"Chunk {i}:")
                        print("  TargetContent:", repr(chunk.get("TargetContent")))
                        print("  ReplacementContent:", repr(chunk.get("ReplacementContent")))
        except Exception as e:
            print("Error:", e)
