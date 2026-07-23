export type Platform = 'codeforces' | 'atcoder';

export type Language = 'cpp' | 'python' | 'java';

export type RunStatus = 'pass' | 'fail' | 'tle' | 'error';

export interface ProblemMeta {
  platform: Platform;
  contestId: string;
  problemId: string;
  title: string;
  url: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  language: Language;
}

export interface TestCase {
  index: number;
  input: string;
  expected: string;
}

export interface RunResult {
  testCase: TestCase;
  status: RunStatus;
  actual: string;
  stderr: string;
  runtimeMs: number;
}

export interface AuthSession {
  platform: Platform;
  handle: string;
  cookieJarJson: string;
}
