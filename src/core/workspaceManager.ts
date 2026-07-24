import * as fs from 'fs';
import * as path from 'path';
import type { ProblemMeta, TestCase } from '../types';

const SOLUTION_FILENAME: Record<string, string> = {
    cpp: 'solution.cpp',
    python: 'solution.py',
    java: 'Main.java',
};

const TEMPLATE_FILENAME: Record<string, string> = {
    cpp: 'template.cpp',
    python: 'template.py',
    java: 'Main.java',
};

function writeTestCaseFiles(testsDir: string, index: number, input: string, expected: string): void {
    fs.mkdirSync(testsDir, { recursive: true });
    fs.writeFileSync(path.join(testsDir, `${index}.in`), input);
    fs.writeFileSync(path.join(testsDir, `${index}.out`), expected);
}

export function scaffoldProblem(
    meta: ProblemMeta,
    workspaceRoot: string,
    testCases: TestCase[],
    extensionPath: string
): Promise<string> {
    const problemDir = path.join(workspaceRoot, meta.platform, meta.contestId, meta.problemId);
    fs.mkdirSync(problemDir, { recursive: true });

    const templateSrc = path.join(extensionPath, 'out', 'templates', TEMPLATE_FILENAME[meta.language]);
    const solutionFile = path.join(problemDir, SOLUTION_FILENAME[meta.language]);
    fs.copyFileSync(templateSrc, solutionFile);

    fs.writeFileSync(path.join(problemDir, 'problem.json'), JSON.stringify(meta, null, 2));

    const testsDir = path.join(problemDir, 'tests');
    for (const tc of testCases) {
        writeTestCaseFiles(testsDir, tc.index, tc.input, tc.expected);
    }

    return Promise.resolve(solutionFile);
}

export function findProblemJson(startPath: string): string | undefined {
    let dir = fs.statSync(startPath).isDirectory() ? startPath : path.dirname(startPath);
    const { root } = path.parse(dir);
    while (true) {
        const candidate = path.join(dir, 'problem.json');
        if (fs.existsSync(candidate)) {
            return candidate;
        }
        if (dir === root) {
            return undefined;
        }
        dir = path.dirname(dir);
    }
}

export function readTestCases(problemDir: string): TestCase[] {
    const testsDir = path.join(problemDir, 'tests');
    if (!fs.existsSync(testsDir)) {
        return [];
    }
    const indices = fs.readdirSync(testsDir)
        .filter(f => f.endsWith('.in'))
        .map(f => parseInt(f.replace('.in', ''), 10))
        .filter(n => !isNaN(n))
        .sort((a, b) => a - b);

    return indices.map(index => {
        const input = fs.readFileSync(path.join(testsDir, `${index}.in`), 'utf8');
        const outPath = path.join(testsDir, `${index}.out`);
        const expected = fs.existsSync(outPath)
            ? fs.readFileSync(outPath, 'utf8')
            : '';
        return { index, input, expected };
    });
}

export function addTestCase(problemDir: string): { inPath: string; outPath: string } {
    const testsDir = path.join(problemDir, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });

    const existing = fs.readdirSync(testsDir)
        .filter(f => f.endsWith('.in'))
        .map(f => parseInt(f.replace('.in', ''), 10))
        .filter(n => !isNaN(n));

    const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
    writeTestCaseFiles(testsDir, next, '', '');

    return {
        inPath: path.join(testsDir, `${next}.in`),
        outPath: path.join(testsDir, `${next}.out`),
    };
}
