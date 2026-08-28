import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findProblemJson, readTestCases, addTestCase, scaffoldProblem } from '../src/core/workspaceManager';
import type { ProblemMeta } from '../src/types';

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-sidekick-'));
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── findProblemJson ──────────────────────────────────────────────────────────

describe('findProblemJson', () => {
    test('finds problem.json in the given directory', () => {
        const jsonPath = path.join(tmpDir, 'problem.json');
        fs.writeFileSync(jsonPath, '{}');
        expect(findProblemJson(tmpDir)).toBe(jsonPath);
    });

    test('finds problem.json by walking up from a nested directory', () => {
        const nested = path.join(tmpDir, 'a', 'b', 'c');
        fs.mkdirSync(nested, { recursive: true });
        const jsonPath = path.join(tmpDir, 'problem.json');
        fs.writeFileSync(jsonPath, '{}');
        expect(findProblemJson(nested)).toBe(jsonPath);
    });

    test('finds problem.json when given a file path instead of a directory', () => {
        const jsonPath = path.join(tmpDir, 'problem.json');
        fs.writeFileSync(jsonPath, '{}');
        const solutionFile = path.join(tmpDir, 'solution.cpp');
        fs.writeFileSync(solutionFile, '');
        expect(findProblemJson(solutionFile)).toBe(jsonPath);
    });

    test('returns undefined when problem.json does not exist up the tree', () => {
        // Use a deep dir inside tmpDir; tmpDir itself has no problem.json.
        // findProblemJson will walk past tmpDir up to the filesystem root,
        // so this test only asserts it doesn't throw and returns undefined
        // when no file is found anywhere.
        const deep = path.join(tmpDir, 'x', 'y');
        fs.mkdirSync(deep, { recursive: true });
        // No problem.json anywhere under tmpDir
        const result = findProblemJson(deep);
        expect(result).toBeUndefined();
    });
});

// ─── readTestCases ────────────────────────────────────────────────────────────

describe('readTestCases', () => {
    test('returns empty array when tests/ directory does not exist', () => {
        expect(readTestCases(tmpDir)).toEqual([]);
    });

    test('reads and returns sorted test cases', () => {
        const testsDir = path.join(tmpDir, 'tests');
        fs.mkdirSync(testsDir);
        fs.writeFileSync(path.join(testsDir, '2.in'), 'b');
        fs.writeFileSync(path.join(testsDir, '2.out'), 'B');
        fs.writeFileSync(path.join(testsDir, '1.in'), 'a');
        fs.writeFileSync(path.join(testsDir, '1.out'), 'A');

        const cases = readTestCases(tmpDir);
        expect(cases).toHaveLength(2);
        expect(cases[0]).toEqual({ index: 1, input: 'a', expected: 'A' });
        expect(cases[1]).toEqual({ index: 2, input: 'b', expected: 'B' });
    });

    test('uses empty string for expected when .out file is missing', () => {
        const testsDir = path.join(tmpDir, 'tests');
        fs.mkdirSync(testsDir);
        fs.writeFileSync(path.join(testsDir, '1.in'), 'hello');

        const cases = readTestCases(tmpDir);
        expect(cases).toHaveLength(1);
        expect(cases[0].expected).toBe('');
    });

    test('ignores files that are not numbered .in files', () => {
        const testsDir = path.join(tmpDir, 'tests');
        fs.mkdirSync(testsDir);
        fs.writeFileSync(path.join(testsDir, '1.in'), 'ok');
        fs.writeFileSync(path.join(testsDir, '1.out'), 'ok');
        fs.writeFileSync(path.join(testsDir, 'README.txt'), 'ignore me');
        fs.writeFileSync(path.join(testsDir, 'foo.in'), 'ignore me');

        expect(readTestCases(tmpDir)).toHaveLength(1);
    });
});

// ─── addTestCase ──────────────────────────────────────────────────────────────

describe('addTestCase', () => {
    test('creates tests/ directory and first test case at index 1', () => {
        const { inPath, outPath } = addTestCase(tmpDir);
        expect(inPath).toBe(path.join(tmpDir, 'tests', '1.in'));
        expect(outPath).toBe(path.join(tmpDir, 'tests', '1.out'));
        expect(fs.existsSync(inPath)).toBe(true);
        expect(fs.existsSync(outPath)).toBe(true);
    });

    test('increments past the highest existing index', () => {
        const testsDir = path.join(tmpDir, 'tests');
        fs.mkdirSync(testsDir);
        fs.writeFileSync(path.join(testsDir, '1.in'), '');
        fs.writeFileSync(path.join(testsDir, '3.in'), '');

        const { inPath } = addTestCase(tmpDir);
        expect(path.basename(inPath)).toBe('4.in');
    });

    test('creates empty files', () => {
        const { inPath, outPath } = addTestCase(tmpDir);
        expect(fs.readFileSync(inPath, 'utf8')).toBe('');
        expect(fs.readFileSync(outPath, 'utf8')).toBe('');
    });
});

// ─── scaffoldProblem ──────────────────────────────────────────────────────────

describe('scaffoldProblem', () => {
    const meta: ProblemMeta = {
        platform: 'codeforces',
        contestId: '1',
        problemId: 'A',
        title: 'Test',
        url: 'https://codeforces.com/contest/1/problem/A',
        timeLimitMs: 2000,
        memoryLimitMb: 256,
        language: 'cpp',
    };

    test('creates problem directory, writes problem.json, copies template, and writes test files', async () => {
        // Set up a fake extensionPath with a template
        const extPath = path.join(tmpDir, 'ext');
        const templateDir = path.join(extPath, 'out', 'templates');
        fs.mkdirSync(templateDir, { recursive: true });
        fs.writeFileSync(path.join(templateDir, 'template.cpp'), '#include <bits/stdc++.h>');

        const workspaceRoot = path.join(tmpDir, 'ws');
        const testCases = [
            { index: 1, input: '3 5\n', expected: '8\n' },
            { index: 2, input: '1 2\n', expected: '3\n' },
        ];

        const solutionFile = await scaffoldProblem(meta, workspaceRoot, testCases, extPath);

        const problemDir = path.join(workspaceRoot, 'codeforces', '1', 'A');
        expect(solutionFile).toBe(path.join(problemDir, 'solution.cpp'));
        expect(fs.existsSync(solutionFile)).toBe(true);

        const saved = JSON.parse(fs.readFileSync(path.join(problemDir, 'problem.json'), 'utf8'));
        expect(saved.contestId).toBe('1');
        expect(saved.problemId).toBe('A');

        expect(fs.readFileSync(path.join(problemDir, 'tests', '1.in'), 'utf8')).toBe('3 5\n');
        expect(fs.readFileSync(path.join(problemDir, 'tests', '2.out'), 'utf8')).toBe('3\n');
    });
});
