import * as cp from 'child_process';
import * as os from 'os';
import * as path from 'path';
import type { Language, ProblemMeta, RunResult, RunStatus, TestCase } from '../types';

export interface RunnerConfig {
  cppCompiler: string;
  cppFlags: string[];
  pythonExecutable: string;
  javaCompiler: string;
  javaRuntime: string;
  timeLimitBufferMs: number;
}

interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  notFound: boolean;
}

export function normalizeOutput(s: string): string {
  return s
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trimEnd();
}

function runProcess(
  cmd: string,
  args: string[],
  cwd: string,
  stdin: string,
  timeoutMs: number
): Promise<ProcessResult> {
  return new Promise(resolve => {
    const proc = cp.spawn(cmd, args, { cwd });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let notFound = false;

    const finish = (exitCode: number, timedOut: boolean) => {
      if (settled) { return; }
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode, timedOut, notFound });
    };

    const timer = setTimeout(() => {
      proc.kill();
      finish(1, true);
    }, timeoutMs);

    proc.on('error', (err: NodeJS.ErrnoException) => {
      stderr = err.message;
      notFound = err.code === 'ENOENT';
      finish(1, false);
    });
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.stdin.on('error', () => {});
    proc.stdin.write(stdin);
    proc.stdin.end();
    proc.on('close', code => finish(code ?? 1, false));
  });
}

interface CompileResult {
  runCmd: string;
  runArgs: string[];
  error: string | null;
}

async function compile(
  language: Language,
  solutionFile: string,
  problemDir: string,
  config: RunnerConfig
): Promise<CompileResult> {
  if (language === 'python') {
    return { runCmd: config.pythonExecutable, runArgs: [solutionFile], error: null };
  }

  if (language === 'cpp') {
    const ext = os.platform() === 'win32' ? '.exe' : '';
    const binary = path.join(problemDir, `solution${ext}`);
    const result = await runProcess(
      config.cppCompiler,
      [...config.cppFlags, '-o', binary, solutionFile],
      problemDir,
      '',
      30_000
    );
    if (result.exitCode !== 0) {
      const error = result.notFound
        ? `C++ compiler "${config.cppCompiler}" was not found. ` +
          `Check your PATH or update the cpSidekick.cpp.compiler setting.`
        : result.stderr || 'Compilation failed';
      return { runCmd: '', runArgs: [], error };
    }
    return { runCmd: binary, runArgs: [], error: null };
  }

  // java
  const result = await runProcess(
    config.javaCompiler,
    [path.basename(solutionFile)],
    problemDir,
    '',
    30_000
  );
  if (result.exitCode !== 0) {
    const error = result.notFound
      ? `Java compiler "${config.javaCompiler}" was not found. ` +
        `Check your PATH or update the cpSidekick.java.compiler setting.`
      : result.stderr || 'Compilation failed';
    return { runCmd: '', runArgs: [], error };
  }
  return { runCmd: config.javaRuntime, runArgs: ['Main'], error: null };
}

export async function runTests(
  solutionFile: string,
  meta: ProblemMeta,
  testCases: TestCase[],
  config: RunnerConfig
): Promise<RunResult[]> {
  const problemDir = path.dirname(solutionFile);
  const timeoutMs = meta.timeLimitMs + config.timeLimitBufferMs;

  const { runCmd, runArgs, error } = await compile(meta.language, solutionFile, problemDir, config);

  if (error !== null) {
    return testCases.map(tc => ({
      testCase: tc,
      status: 'error' as RunStatus,
      actual: '',
      stderr: error,
      runtimeMs: 0,
    }));
  }

  const results: RunResult[] = [];

  for (const tc of testCases) {
    const start = Date.now();
    const proc = await runProcess(runCmd, runArgs, problemDir, tc.input, timeoutMs);
    const runtimeMs = Date.now() - start;

    let status: RunStatus;
    if (proc.timedOut) {
      status = 'tle';
    } else if (proc.exitCode !== 0) {
      status = 'error';
    } else if (normalizeOutput(proc.stdout) === normalizeOutput(tc.expected)) {
      status = 'pass';
    } else {
      status = 'fail';
    }

    results.push({ testCase: tc, status, actual: proc.stdout, stderr: proc.stderr, runtimeMs });
  }

  return results;
}
