
import sys

def hex_dump_lines(filename, start_line, end_line):
    with open(filename, 'rb') as f:
        lines = f.readlines()
    
    for i in range(start_line - 1, end_line):
        if i < len(lines):
            print(f"Line {i+1}: {lines[i].hex(' ')}")
            print(f"Line {i+1} (repr): {repr(lines[i])}")

if __name__ == "__main__":
    hex_dump_lines(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]))
