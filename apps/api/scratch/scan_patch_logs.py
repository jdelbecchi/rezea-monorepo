import subprocess

def main():
    print("Printing all logs containing PATCH...")
    res = subprocess.run(["docker", "logs", "rezea_api"], capture_output=True, text=True, errors="ignore")
    logs = res.stdout + res.stderr
    
    for line in logs.splitlines():
        if "PATCH" in line:
            print(line)

if __name__ == "__main__":
    main()
