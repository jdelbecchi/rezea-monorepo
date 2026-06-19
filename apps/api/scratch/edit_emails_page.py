import subprocess
import sys

sys.stdout.reconfigure(encoding='utf-8')

def check_diff():
    res = subprocess.run(
        ["git", "diff", "apps/web/src/app/[slug]/admin/emails/page.tsx"],
        capture_output=True,
        text=True,
        encoding="utf-8"
    )
    diff_lines = res.stdout.splitlines()
    print(f"Total lines in diff: {len(diff_lines)}")
    
    for i, line in enumerate(diff_lines):
        if (line.startswith("+") or line.startswith("-")) and not line.startswith("+++") and not line.startswith("---"):
            if any(w in line.lower() for w in ["google", "avis", "tab", "review"]):
                print(f"Line {i}: {line}")

if __name__ == "__main__":
    check_diff()
