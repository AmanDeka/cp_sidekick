import type { ProblemMeta, TestCase, AuthSession } from '../types';

export interface FetchResult {
    meta: ProblemMeta;
    testCases: TestCase[];
}

export interface IPlatform {
    fetchProblem(url: string): Promise<FetchResult>;
    login(username: string, password: string): Promise<AuthSession>;
    submit(meta: ProblemMeta, solutionCode: string, session: AuthSession): Promise<string>;
}
