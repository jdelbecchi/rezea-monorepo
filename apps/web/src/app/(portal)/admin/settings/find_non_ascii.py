
import sys

def find_non_ascii(filename):
    with open(filename, 'rb') as f:
        content = f.read()
    
    for i, byte in enumerate(content):
        if byte > 127:
            # Found non-ascii
            # Print line number
            line_no = content[:i].count(b'\n') + 1
            char = content[i:i+1].decode('latin-1')
            print(f"Non-ASCII at line {line_no}, index {i}: '{char}' (byte {byte})")

if __name__ == "__main__":
    find_non_ascii(sys.argv[1])
