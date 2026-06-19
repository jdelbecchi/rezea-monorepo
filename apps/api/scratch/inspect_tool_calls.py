import json
import os

log_path = r"C:\Users\jdemo\.gemini\antigravity\brain\24f182fe-1f6b-4f45-bd22-43287e5ee0a9\.system_generated\logs\transcript.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            step_index = data.get("step_index")
            if 2090 <= step_index <= 2130:
                print(f"\n--- STEP {step_index} ({data.get('type')}) ---")
                tool_calls = data.get("tool_calls", [])
                for tc in tool_calls:
                    print(f"Tool: {tc.get('name')}")
                    args = tc.get("arguments", {})
                    # Print relevant arguments but not large ones like ReplacementChunks
                    for k, v in args.items():
                        if k == "ReplacementChunks":
                            print(f"  {k}: [list of {len(v)} chunks]")
                            for i, chunk in enumerate(v):
                                print(f"    Chunk {i}: StartLine={chunk.get('StartLine')}, EndLine={chunk.get('EndLine')}")
                                print(f"      TargetContent snippet: {repr(chunk.get('TargetContent')[:60])}")
                                print(f"      ReplacementContent snippet: {repr(chunk.get('ReplacementContent')[:60])}")
                        elif k in ["CodeContent", "content", "ReplacementContent"]:
                            print(f"  {k}: [length {len(v)}]")
                        else:
                            print(f"  {k}: {repr(v)}")
        except Exception as e:
            pass
