import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import type { ProblemMeta, TestCase } from '../src/types';
import type { RunnerConfig } from '../src/core/runner';

jest.mock('child_process');

import * as cp from 'child_process';
import { runTests } from '../src/core/runner';

const mockSpawn = cp.spawn as jest.MockedFunction<typeof cp.spawn>;

// ─── Process factories ────────────────────────────────────────────────────────

function notFoundProcess() {
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdin = { write: jest.fn(), end: jest.fn(), on: jest.fn() };
    proc.kill = jest.fn();
    setImmediate(() => {
        proc.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
    });
    return proc;
}

function successProcess(stdout = '') {
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdin = { write: jest.fn(), end: jest.fn(), on: jest.fn() };
    proc.kill = jest.fn();
    setImmediate(() => {
        if (stdout) { proc.stdout.emit('data', Buffer.from(stdout)); }
        proc.emit('close', 0);
    });
    return proc;
}

function errorProcess(stderr: string) {
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdin = { write: jest.fn(), end: jest.fn(), on: jest.fn() };
    proc.kill = jest.fn();
    setImmediate(() => {
        proc.stderr.emit('data', Buffer.from(stderr));
        proc.emit('close', 1);
    });
    return proc;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const problemDir = path.join(os.tmpdir(), 'cp-test-problem');

const config: RunnerConfig = {
    cppCompiler: 'g++',
    cppFlags: ['-std=c++17', '-O2'],
    pythonExecutable: 'python3',
    javaCompiler: 'javac',
    javaRuntime: 'java',
    timeLimitBufferMs: 1000,
};

const testCases: TestCase[] = [
    { index: 1, input: '1\n', expected: '1\n' },
    { index: 2, input: '2\n', expected: '2\n' },
];

function makeMeta(language: 'cpp' | 'python' | 'java'): ProblemMeta {
    return {
        platform: 'codeforces', contestId: '1', problemId: 'A',
        title: 'Test', url: 'https://codeforces.com/contest/1/problem/A',
        timeLimitMs: 2000, memoryLimitMb: 256, language,
    };
}

beforeEach(() => mockSpawn.mockReset());

// ─── C++ compiler not found ───────────────────────────────────────────────────

describe('C++ compiler not found (ENOENT at compile time)', () => {
    const solutionFile = path.join(problemDir, 'solution.cpp');

    test('all test cases get error status', async () => {
        mockSpawn.mockReturnValue(notFoundProcess() as any);
        const results = await runTests(solutionFile, makeMeta('cpp'), testCases, config);
        expect(results).toHaveLength(2);
        expect(results.every(r => r.status === 'error')).toBe(true);
    });

    test('error message names the compiler and the setting', async () => {
        mockSpawn.mockReturnValue(notFoundProcess() as any);
        const results = await runTests(solutionFile, makeMeta('cpp'), testCases, config);
        expect(results[0].stderr).toContain('g++');
        expect(results[0].stderr).toContain('cpSidekick.cpp.compiler');
    });

    test('raw compile error (not ENOENT) passes stderr through unchanged', async () => {
        mockSpawn.mockReturnValue(errorProcess('undefined reference to `main`') as any);
        const results = await runTests(solutionFile, makeMeta('cpp'), testCases, config);
        expect(results[0].stderr).toContain('undefined reference');
        expect(results[0].stderr).not.toContain('cpSidekick');
    });
});

// ─── Java compiler (javac) not found ─────────────────────────────────────────

describe('Java compiler not found (ENOENT at compile time)', () => {
    const solutionFile = path.join(problemDir, 'Main.java');

    test('all test cases get error status', async () => {
        mockSpawn.mockReturnValue(notFoundProcess() as any);
        const results = await runTests(solutionFile, makeMeta('java'), testCases, config);
        expect(results.every(r => r.status === 'error')).toBe(true);
    });

    test('error message names javac and the setting', async () => {
        mockSpawn.mockReturnValue(notFoundProcess() as any);
        const results = await runTests(solutionFile, makeMeta('java'), testCases, config);
        expect(results[0].stderr).toContain('javac');
        expect(results[0].stderr).toContain('cpSidekick.java.compiler');
    });
});

// ─── Java runtime (java) not found ───────────────────────────────────────────

describe('Java runtime not found (ENOENT at run time)', () => {
    const solutionFile = path.join(problemDir, 'Main.java');

    test('all test cases get error status', async () => {
        // javac succeeds; java runtime is missing
        mockSpawn
            .mockReturnValueOnce(successProcess() as any)
            .mockReturnValue(notFoundProcess() as any);
        const results = await runTests(solutionFile, makeMeta('java'), testCases, config);
        expect(results.every(r => r.status === 'error')).toBe(true);
    });

    test('error message names java runtime and the setting', async () => {
        mockSpawn
            .mockReturnValueOnce(successProcess() as any)
            .mockReturnValue(notFoundProcess() as any);
        const results = await runTests(solutionFile, makeMeta('java'), testCases, config);
        expect(results[0].stderr).toContain('java');
        expect(results[0].stderr).toContain('cpSidekick.java.runtime');
    });

    test('remaining test cases are all filled without extra spawn calls', async () => {
        mockSpawn
            .mockReturnValueOnce(successProcess() as any)   // javac
            .mockReturnValueOnce(notFoundProcess() as any); // first java run
        const results = await runTests(solutionFile, makeMeta('java'), testCases, config);
        // both test cases should be present even though only one spawn happened at run time
        expect(results).toHaveLength(2);
        // spawn was called exactly twice: javac + one java run
        expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
});

// ─── Python interpreter not found ────────────────────────────────────────────

describe('Python interpreter not found (ENOENT at run time)', () => {
    const solutionFile = path.join(problemDir, 'solution.py');

    test('all test cases get error status', async () => {
        mockSpawn.mockReturnValue(notFoundProcess() as any);
        const results = await runTests(solutionFile, makeMeta('python'), testCases, config);
        expect(results.every(r => r.status === 'error')).toBe(true);
    });

    test('error message names python3 and the setting', async () => {
        mockSpawn.mockReturnValue(notFoundProcess() as any);
        const results = await runTests(solutionFile, makeMeta('python'), testCases, config);
        expect(results[0].stderr).toContain('python3');
        expect(results[0].stderr).toContain('cpSidekick.python.executable');
    });

    test('remaining test cases are all filled without extra spawn calls', async () => {
        mockSpawn.mockReturnValueOnce(notFoundProcess() as any);
        const results = await runTests(solutionFile, makeMeta('python'), testCases, config);
        expect(results).toHaveLength(2);
        // python has no compile step — spawn called exactly once
        expect(mockSpawn).toHaveBeenCalledTimes(1);
    });
});
