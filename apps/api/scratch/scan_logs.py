import subprocess

def main():
    print("Printing last 150 lines of docker logs...")
    res = subprocess.run(["docker", "logs", "rezea_api"], capture_output=True, text=True, errors="ignore")
    logs = res.stdout + res.stderr
    
    lines = logs.splitlines()
    print(f"Total lines: {len(lines)}")
    for line in lines[-150:]:
        print(line)

if __name__ == "__main__":
    main()
