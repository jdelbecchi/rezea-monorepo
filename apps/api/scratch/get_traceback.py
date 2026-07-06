import subprocess

def main():
    print("Searching docker logs for admin_orders.py exceptions...")
    res = subprocess.run(["docker", "logs", "rezea_api"], capture_output=True, text=True, errors="ignore")
    logs = res.stdout + res.stderr
    
    lines = logs.splitlines()
    print(f"Total lines: {len(lines)}")
    
    matches = []
    for i, line in enumerate(lines):
        if "admin_orders.py" in line and ("line" in line or "Traceback" in logs[max(0, i-50):i]):
            matches.append(i)
            
    print(f"Found {len(matches)} occurrences.")
    for idx in matches[-5:]: # last 5 occurrences
        print(f"\n--- Match at line {idx}: {lines[idx]} ---")
        start = max(0, idx - 10)
        end = min(len(lines), idx + 20)
        for j in range(start, end):
            prefix = ">> " if j == idx else "   "
            print(f"{j}: {prefix}{lines[j]}")

if __name__ == "__main__":
    main()
