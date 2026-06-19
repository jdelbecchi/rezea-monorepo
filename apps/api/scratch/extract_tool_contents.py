import json
import os

log_path = r"C:\Users\jdemo\.gemini\antigravity\brain\24f182fe-1f6b-4f45-bd22-43287e5ee0a9\.system_generated\logs\transcript.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            step_index = data.get("step_index")
            tool_calls = data.get("tool_calls", [])
            for i, tc in enumerate(tool_calls):
                name = tc.get("name")
                args = tc.get("args", {})
                target = args.get("TargetFile") or ""
                if "page.tsx" in target and name in ["replace_file_content", "multi_replace_file_content", "write_to_file"]:
                    # Save to a file in scratch
                    out_filename = f"apps/api/scratch/step_{step_index}_tc_{i}_{name}.json"
                    with open(out_filename, 'w', encoding='utf-8') as out_f:
                        json.dump(tc, out_f, indent=2, ensure_ascii=False)
                    print(f"Extracted Step {step_index} tool call to {out_filename}")
        except Exception as e:
            pass
