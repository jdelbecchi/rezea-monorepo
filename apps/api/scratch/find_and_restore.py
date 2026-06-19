import json
import os

log_path = r"C:\Users\jdemo\.gemini\antigravity\brain\24f182fe-1f6b-4f45-bd22-43287e5ee0a9\.system_generated\logs\transcript.jsonl"

if not os.path.exists(log_path):
    print(f"Log path does not exist: {log_path}")
    exit(1)

print("Searching transcript.jsonl...")

last_view_content = None

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            # We want to check if this step index or output contains our page.tsx content
            # Let's check for "Total Lines: 2702" or similar signature
            output = data.get("content", "")
            if not output:
                # check tool calls
                tool_calls = data.get("tool_calls", [])
                for tc in tool_calls:
                    if tc.get("name") == "view_file" and "page.tsx" in tc.get("arguments", {}).get("AbsolutePath", ""):
                        pass
            
            # Let's check if the response or content contains the text:
            # "Total Lines: 2702"
            if "Total Lines: 2702" in line or "quill-content-preview" in line:
                # Print the line index or some details
                print(f"Found match in step: {data.get('step_index')} / type: {data.get('type')}")
                # Save the whole line data so we can inspect it
                last_view_content = data
        except Exception as e:
            pass

if last_view_content:
    print("Writing found step content to scratch...")
    with open('apps/api/scratch/matched_step.json', 'w', encoding='utf-8') as out:
        json.dump(last_view_content, out, indent=2, ensure_ascii=False)
    print("Done! Check apps/api/scratch/matched_step.json")
else:
    print("No matches found.")
