import { detectCodeforcesUrl, defaultLanguageId, CodeforcesClient } from '../src/platforms/codeforces';

// Mock the http module so no real network calls happen
jest.mock('../src/platforms/http', () => ({
    makeClient: jest.fn(),
}));

import { makeClient } from '../src/platforms/http';
const mockMakeClient = makeClient as jest.MockedFunction<typeof makeClient>;

// ─── detectCodeforcesUrl ──────────────────────────────────────────────────────

describe('detectCodeforcesUrl', () => {
    test('returns true for codeforces.com URLs', () => {
        expect(detectCodeforcesUrl('https://codeforces.com/contest/1/problem/A')).toBe(true);
        expect(detectCodeforcesUrl('https://codeforces.com/problemset/problem/1/A')).toBe(true);
    });

    test('returns false for non-codeforces URLs', () => {
        expect(detectCodeforcesUrl('https://atcoder.jp/contests/abc300/tasks/abc300_a')).toBe(false);
        expect(detectCodeforcesUrl('https://example.com')).toBe(false);
    });
});

// ─── defaultLanguageId ────────────────────────────────────────────────────────

describe('defaultLanguageId', () => {
    test('returns language IDs for all three languages', () => {
        const ids = defaultLanguageId();
        expect(ids).toHaveProperty('cpp');
        expect(ids).toHaveProperty('python');
        expect(ids).toHaveProperty('java');
    });

    test('returns string IDs (not numbers)', () => {
        const ids = defaultLanguageId();
        expect(typeof ids.cpp).toBe('string');
        expect(typeof ids.python).toBe('string');
        expect(typeof ids.java).toBe('string');
    });
});

// ─── CodeforcesClient.fetchProblem ────────────────────────────────────────────

const simpleHtml = `
<html><body>
  <div class="header">
    <div class="title">A. Two Sum</div>
    <div class="time-limit">time limit per test2 seconds</div>
    <div class="memory-limit">memory limit per test256 megabytes</div>
  </div>
  <div class="sample-test">
    <div class="input"><pre>3 5</pre></div>
    <div class="output"><pre>8</pre></div>
    <div class="input"><pre>0 0</pre></div>
    <div class="output"><pre>0</pre></div>
  </div>
  <form><input type="hidden" name="csrf_token" value="tok123"></form>
</body></html>
`;

const divChildHtml = `
<html><body>
  <div class="header">
    <div class="title">B. Array</div>
    <div class="time-limit">time limit per test1 second</div>
    <div class="memory-limit">memory limit per test512 megabytes</div>
  </div>
  <div class="sample-test">
    <div class="input"><pre><div>3</div><div>1 2 3</div></pre></div>
    <div class="output"><pre><div>6</div></pre></div>
  </div>
</body></html>
`;

describe('CodeforcesClient.fetchProblem', () => {
    let client: CodeforcesClient;
    let mockGet: jest.Mock;

    beforeEach(() => {
        mockGet = jest.fn();
        mockMakeClient.mockReturnValue({ get: mockGet, post: jest.fn() } as any);
        client = new CodeforcesClient();
    });

    test('parses title, time limit, and memory limit from HTML', async () => {
        mockGet.mockResolvedValue({ data: simpleHtml });
        const { meta } = await client.fetchProblem('https://codeforces.com/contest/1/problem/A');
        expect(meta.title).toBe('Two Sum');
        expect(meta.timeLimitMs).toBe(2000);
        expect(meta.memoryLimitMb).toBe(256);
    });

    test('extracts contestId and problemId from /contest/ URL', async () => {
        mockGet.mockResolvedValue({ data: simpleHtml });
        const { meta } = await client.fetchProblem('https://codeforces.com/contest/1234/problem/B');
        expect(meta.contestId).toBe('1234');
        expect(meta.problemId).toBe('B');
    });

    test('extracts contestId and problemId from /problemset/ URL', async () => {
        mockGet.mockResolvedValue({ data: simpleHtml });
        const { meta } = await client.fetchProblem('https://codeforces.com/problemset/problem/1/A');
        expect(meta.contestId).toBe('1');
        expect(meta.problemId).toBe('A');
    });

    test('parses two sample test cases', async () => {
        mockGet.mockResolvedValue({ data: simpleHtml });
        const { testCases } = await client.fetchProblem('https://codeforces.com/contest/1/problem/A');
        expect(testCases).toHaveLength(2);
        expect(testCases[0]).toEqual({ index: 1, input: '3 5', expected: '8' });
        expect(testCases[1]).toEqual({ index: 2, input: '0 0', expected: '0' });
    });

    test('parses multi-line input wrapped in <div> children inside <pre>', async () => {
        mockGet.mockResolvedValue({ data: divChildHtml });
        const { testCases } = await client.fetchProblem('https://codeforces.com/contest/2/problem/B');
        expect(testCases).toHaveLength(1);
        expect(testCases[0].input).toBe('3\n1 2 3');
        expect(testCases[0].expected).toBe('6');
    });

    test('sets platform to codeforces', async () => {
        mockGet.mockResolvedValue({ data: simpleHtml });
        const { meta } = await client.fetchProblem('https://codeforces.com/contest/1/problem/A');
        expect(meta.platform).toBe('codeforces');
    });

    test('throws on unparseable URL', async () => {
        mockGet.mockResolvedValue({ data: simpleHtml });
        await expect(
            client.fetchProblem('https://codeforces.com/gym/12345')
        ).rejects.toThrow('Cannot parse contest/problem');
    });

    test('uses 2000ms as fallback when time limit is absent', async () => {
        const noLimitHtml = simpleHtml.replace(/time limit per test.*?seconds?/i, '');
        mockGet.mockResolvedValue({ data: noLimitHtml });
        const { meta } = await client.fetchProblem('https://codeforces.com/contest/1/problem/A');
        expect(meta.timeLimitMs).toBe(2000);
    });
});
