import subprocess

def main():
    print("Finding the exact traceback of the MissingGreenlet error...")
    res = subprocess.run(["docker", "logs", "rezea_api"], capture_output=True, text=True, errors="ignore")
    logs = res.stdout + res.stderr
    
    lines = logs.splitlines()
    print(f"Total lines: {len(lines)}")
    
    # Find all occurrences of MissingGreenlet
    occurrences = [i for i, line in enumerate(lines) if "MissingGreenlet" in line]
    print(f"Occurrences found: {occurrences}")
    
    if not occurrences:
        print("No 'MissingGreenlet' string found.")
        return
        
    last_idx = occurrences[-1]
    print(f"Last occurrence is at line {last_idx}: {lines[last_idx]}")
    
    # Print 50 lines before and 5 lines after
    start = max(0, last_idx - 50)
    end = min(len(lines), last_idx + 5)
    print("\n--- Traceback ---")
    for j in range(start, end):
        print(f"{j}: {lines[j]}")

if __name__ == "__main__":
    main()
