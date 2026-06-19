import json
import os

log_path = r"C:\Users\jdemo\.gemini\antigravity\brain\24f182fe-1f6b-4f45-bd22-43287e5ee0a9\.system_generated\logs\transcript.jsonl"

if not os.path.exists(log_path):
    print(f"Log path does not exist: {log_path}")
    exit(1)

print("Searching transcript.jsonl for page.tsx views...")

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            content = data.get("content", "")
            step_index = data.get("step_index")
            step_type = data.get("type")
            
            # Check if this is a VIEW_FILE or contains page.tsx content
            # Let's see if the path is in the content or if it's page.tsx
            if "page.tsx" in content:
                # Let's count occurrences of some specific multi-section editor code, e.g. "sections" or "Section"
                # And check how large the content is
                print(f"Step {step_index} ({step_type}): length={len(content)}")
                if "Total Lines:" in content:
                    lines_line = [l for l in content.split('\n') if "Total Lines:" in l]
                    print(f"  -> {lines_line}")
        except Exception as e:
            pass
