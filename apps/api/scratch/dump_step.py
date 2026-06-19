import json

log_path = r"C:\Users\jdemo\.gemini\antigravity\brain\8d2d10ad-919b-4597-bd59-76061cc61f6b\.system_generated\logs\transcript_full.jsonl"

def dump_step(target_step):
    with open(log_path, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                data = json.loads(line)
                step_index = data.get("step_index")
                if step_index == target_step:
                    with open(f"apps/api/scratch/step_dump_{target_step}.json", "w", encoding="utf-8") as out:
                        json.dump(data, out, indent=2, ensure_ascii=False)
                    print(f"Dumped step {target_step} successfully!")
            except Exception as e:
                print("Error:", e)

dump_step(230)
dump_step(286)
