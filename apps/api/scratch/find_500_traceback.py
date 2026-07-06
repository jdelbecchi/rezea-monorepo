import subprocess

def main():
    print("Searching docker logs for 500 error at /api/admin/orders...")
    res = subprocess.run(["docker", "logs", "rezea_api"], capture_output=True, text=True, errors="ignore")
    logs = res.stdout + res.stderr
    
    lines = logs.splitlines()
    print(f"Total lines: {len(lines)}")
    
    # Let's search backwards for the first 500 error line with /api/admin/orders
    idx = -1
    for i in range(len(lines) - 1, -1, -1):
        if "500 Internal Server Error" in lines[i] and "/api/admin/orders" in lines[i]:
            idx = i
            break
            
    if idx == -1:
        # search for any 500 error
        for i in range(len(lines) - 1, -1, -1):
            if "500" in lines[i] and "admin/orders" in lines[i]:
                idx = i
                break
                
    if idx == -1:
        print("No 500 error found for admin orders.")
        return
        
    print(f"Found 500 error at line {idx}: {lines[idx]}")
    # Print 50 lines before the error to show the traceback
    start = max(0, idx - 40)
    end = min(len(lines), idx + 2)
    print("\n--- Traceback ---")
    for j in range(start, end):
        print(f"{j}: {lines[j]}")

if __name__ == "__main__":
    main()
