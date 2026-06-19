import json

log_path = r"C:\Users\jdemo\.gemini\antigravity\brain\8d2d10ad-919b-4597-bd59-76061cc61f6b\.system_generated\logs\transcript_full.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for line_idx, line in enumerate(f):
        try:
            data = json.loads(line)
            step_index = data.get("step_index", line_idx)
            if step_index == 962:
                print(json.dumps(data, indent=2, ensure_ascii=False))
        except Exception as e:
            pass
