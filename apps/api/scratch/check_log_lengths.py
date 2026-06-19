import json
import os

log_path = r"C:\Users\jdemo\.gemini\antigravity\brain\24f182fe-1f6b-4f45-bd22-43287e5ee0a9\.system_generated\logs\transcript.jsonl"

steps_to_check = [1855, 1861, 1867, 1873, 1879, 1915, 1921, 1925, 1931, 1935, 1939, 1943]

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        for s in steps_to_check:
            if f'"step_index":{s}' in line:
                try:
                    data = json.loads(line)
                    print(f"Step {s} | Length: {len(line)} | Status: {data.get('status')} | Type: {data.get('type')}")
                except Exception as e:
                    print(f"Step {s} in line (failed to parse JSON) | Length: {len(line)} | Error: {e}")
