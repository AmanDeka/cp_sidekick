import sys
import os
from collections import defaultdict, deque
from itertools import permutations, combinations
from math import gcd, ceil, floor, sqrt, log2
from functools import lru_cache

input = sys.stdin.readline

def pr(*args):
    print(*args)

def re(*args):
    return map(int, input().split()) if len(args) == 0 else [int(input()) for _ in range(args[0])]

import sys
_debug = sys.stderr.write
def debug(*args):
    if os.environ.get('LOCAL'):
        _debug('[DEBUG] ' + ' '.join(map(str, args)) + '\n')

def solve():
    pass


def main():
    if os.environ.get('LOCAL'):
        sys.stdin = open('input.txt', 'r')
        sys.stdout = open('output.txt', 'w')

    t = 1
    # t = int(input())  # uncomment for multiple test cases
    for _ in range(t):
        solve()


if __name__ == '__main__':
    main()
