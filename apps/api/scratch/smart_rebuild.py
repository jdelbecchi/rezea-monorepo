import json
import re
import sys

base_file = r"apps/web/src/app/[slug]/admin/emails/page.tsx"
log_path = r"C:\Users\jdemo\.gemini\antigravity\brain\8d2d10ad-919b-4597-bd59-76061cc61f6b\.system_generated\logs\transcript_full.jsonl"

with open(base_file, 'r', encoding='utf-8') as f:
    code = f.read()

# Load all tool calls targeting admin/emails/page.tsx
tool_calls_found = []
with open(log_path, 'r', encoding='utf-8') as f:
    for line_idx, line in enumerate(f):
        try:
            data = json.loads(line)
            step_index = data.get("step_index", line_idx)
            tcs = data.get("tool_calls", [])
            for tc in tcs:
                name = tc.get("name")
                args = tc.get("args", {})
                target = args.get("TargetFile") or args.get("AbsolutePath") or ""
                if "admin/emails/page.tsx" in target.replace('\\', '/') and name in ["replace_file_content", "multi_replace_file_content"]:
                    tool_calls_found.append({
                        "step_index": step_index,
                        "name": name,
                        "args": args
                    })
        except Exception as e:
            pass

print(f"Found {len(tool_calls_found)} tool calls targeting page.tsx")

def fix_french_accents(s):
    if not s:
        return ""
    # Only replace specific words containing replacement char \ufffd or corrupted sequences
    replacements = {
        "L'\ufffdquipe": "L'équipe",
        "L'quipe": "L'équipe",
        "Aper\ufffdu": "Aperçu",
        "Aperu": "Aperçu",
        "\ufffdtablissement": "établissement",
        "tablissement": "établissement",
        "enqu\ufffdte": "enquête",
        "enqute": "enquête",
        "enqu\ufffdtes": "enquêtes",
        "enqutes": "enquêtes",
        "pr\ufffdvisualisation": "prévisualisation",
        "prvisualisation": "prévisualisation",
        "pr\ufffdvisualiser": "prévisualiser",
        "prvisualiser": "prévisualiser",
        "Cr\ufffdateur": "Créateur",
        "Crateur": "Créateur",
        "d'\ufffdenqu\ufffdtes": "d'enquêtes",
        "d'enqutes": "d'enquêtes",
        "\ufffd la fois": "à la fois",
        " la fois": "à la fois",
        "\ufffd vos c\ufffdt\ufffds": "à vos côtés",
        " vos cts": "à vos côtés",
        "c\ufffdt\ufffds": "côtés",
        "cts": "côtés"
    }
    for k, v in replacements.items():
        s = s.replace(k, v)
    return s

def strip_non_ascii(s):
    # Remove \ufffd and any non-ascii characters
    return re.sub(r'[^\x00-\x7F]', '', s)

def normalize_whitespace(s):
    lines = [line.rstrip() for line in s.split('\n')]
    return '\n'.join(lines)

def search_and_replace_flexible(content, target, replacement):
    # Fix accents first
    target = fix_french_accents(target)
    replacement = fix_french_accents(replacement)

    # Try exact match first
    if target in content:
        return content.replace(target, replacement, 1)

    # Try literal match after normalising whitespace and newlines
    content_norm = normalize_whitespace(content)
    target_norm = normalize_whitespace(target)
    replacement_norm = normalize_whitespace(replacement)

    if target_norm in content_norm:
        return content_norm.replace(target_norm, replacement_norm, 1)

    # Line-by-line flexible matching (ignoring indentation changes and non-ascii differences)
    content_lines = content.split('\n')
    target_lines = [strip_non_ascii(line.strip()) for line in target.split('\n') if line.strip()]
    
    if not target_lines:
        return content

    # Find the starting line in content
    for i in range(len(content_lines) - len(target_lines) + 1):
        match = True
        for j in range(len(target_lines)):
            if strip_non_ascii(content_lines[i + j].strip()) != target_lines[j]:
                match = False
                break
        if match:
            # We found the block! Replace lines i to i+len(target_lines) with the replacement
            rep_lines = replacement.split('\n')
            new_lines = content_lines[:i] + rep_lines + content_lines[i + len(target_lines):]
            return '\n'.join(new_lines)

    return None

def apply_chunk(content, chunk, step_id, chunk_idx):
    target = chunk.get("TargetContent")
    replacement = chunk.get("ReplacementContent")
    
    res = search_and_replace_flexible(content, target, replacement)
    if res is not None:
        return res
        
    print(f"CRITICAL ERROR: Could not apply step {step_id}, chunk {chunk_idx}")
    print(f"Target Content: {repr(target[:150])}")
    return content

for idx, tc in enumerate(tool_calls_found):
    step_id = tc["step_index"]
    name = tc["name"]
    args = tc["args"]
    desc = args.get("Description") or args.get("Instruction") or ""
    print(f"Applying edit [{idx}] step {step_id} - {desc[:60]}...")
    
    if name == "replace_file_content":
        chunk = {
            "TargetContent": args.get("TargetContent"),
            "ReplacementContent": args.get("ReplacementContent"),
            "StartLine": args.get("StartLine"),
            "EndLine": args.get("EndLine")
        }
        code = apply_chunk(code, chunk, step_id, 0)
    elif name == "multi_replace_file_content":
        chunks = args.get("ReplacementChunks")
        if isinstance(chunks, str):
            chunks = json.loads(chunks, strict=False)
        for chunk_idx, chunk in enumerate(chunks):
            code = apply_chunk(code, chunk, step_id, chunk_idx)

# Write output file
with open(base_file, 'w', encoding='utf-8', newline='\r\n') as f:
    f.write(code)

print("\nSmart rebuild of page.tsx completed!")
