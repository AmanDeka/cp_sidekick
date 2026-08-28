import type { ProblemMeta, TestCase, AuthSession } from '../types';

export interface FetchResult {
    meta: ProblemMeta;
    testCases: TestCase[];
}

export interface IPlatform {
    fetchProblem(url: string): Promise<FetchResult>;
    // Returns a URL to the submission status page.
    submit(meta: ProblemMeta, solutionCode: string, session: AuthSession, languageId: string): Promise<string>;
}
