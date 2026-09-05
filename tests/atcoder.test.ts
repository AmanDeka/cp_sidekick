import { detectAtCoderUrl, defaultLanguageId, AtCoderClient } from '../src/platforms/atcoder';

jest.mock('../src/platforms/http', () => ({
    makeClient: jest.fn(),
}));

import { makeClient } from '../src/platforms/http';
const mockMakeClient = makeClient as jest.MockedFunction<typeof makeClient>;

// ─── detectAtCoderUrl ─────────────────────────────────────────────────────────

describe('detectAtCoderUrl', () => {
    test('returns true for atcoder.jp URLs', () => {
        expect(detectAtCoderUrl('https://atcoder.jp/contests/abc300/tasks/abc300_a')).toBe(true);
    });

    test('returns false for non-atcoder URLs', () => {
        expect(detectAtCoderUrl('https://codeforces.com/contest/1/problem/A')).toBe(false);
        expect(detectAtCoderUrl('https://example.com')).toBe(false);
    });
});

// ─── defaultLanguageId ────────────────────────────────────────────────────────

describe('defaultLanguageId', () => {
    test('returns IDs for all three languages', () => {
        const ids = defaultLanguageId();
        expect(ids).toHaveProperty('cpp');
        expect(ids).toHaveProperty('python');
        expect(ids).toHaveProperty('java');
    });

    test('returns string IDs', () => {
        const ids = defaultLanguageId();
        expect(typeof ids.cpp).toBe('string');
        expect(typeof ids.python).toBe('string');
        expect(typeof ids.java).toBe('string');
    });
});

// ─── AtCoderClient.fetchProblem ───────────────────────────────────────────────

const simpleHtml = `
<html><head><title>A - Two Sum - AtCoder Beginner Contest 300</title></head>
<body>
  <span class="h2">A - Two Sum</span>
  <div id="task-statement">
    <span class="lang-en">
      <p>Time Limit: 2 sec / Memory Limit: 256 MB</p>
      <div class="part"><section>
        <h3>Sample Input 1</h3>
        <pre>3 5</pre>
        <h3>Sample Output 1</h3>
        <pre>8</pre>
      </section></div>
      <div class="part"><section>
        <h3>Sample Input 2</h3>
        <pre>0 0</pre>
        <h3>Sample Output 2</h3>
        <pre>0</pre>
      </section></div>
    </span>
  </div>
  <form><input type="hidden" name="csrf_token" value="tok123"></form>
</body></html>
`;

const bilingualHtml = `
<html><body>
  <span class="h2">B - Array Sum</span>
  <div id="task-statement">
    <span class="lang-ja">
      <div class="part"><section>
        <h3>入力例 1</h3>
        <pre>SHOULD NOT APPEAR</pre>
        <h3>出力例 1</h3>
        <pre>SHOULD NOT APPEAR</pre>
      </section></div>
    </span>
    <span class="lang-en">
      <p>Time Limit: 3 sec / Memory Limit: 512 MB</p>
      <div class="part"><section>
        <h3>Sample Input 1</h3>
        <pre>3
1 2 3</pre>
        <h3>Sample Output 1</h3>
        <pre>6</pre>
      </section></div>
    </span>
  </div>
</body></html>
`;

const noLangEnHtml = `
<html><body>
  <span class="h2">C - Simple</span>
  <div id="task-statement">
    <p>Time Limit: 1 sec / Memory Limit: 128 MB</p>
    <div class="part"><section>
      <h3>Sample Input 1</h3>
      <pre>42</pre>
      <h3>Sample Output 1</h3>
      <pre>Yes</pre>
    </section></div>
  </div>
</body></html>
`;

describe('AtCoderClient.fetchProblem', () => {
    let client: AtCoderClient;
    let mockGet: jest.Mock;

    beforeEach(() => {
        mockGet = jest.fn();
        mockMakeClient.mockReturnValue({ get: mockGet, post: jest.fn() } as any);
        client = new AtCoderClient();
    });

    test('parses contestId and problemId from URL', async () => {
        mockGet.mockResolvedValue({ data: simpleHtml });
        const { meta } = await client.fetchProblem('https://atcoder.jp/contests/abc300/tasks/abc300_a');
        expect(meta.contestId).toBe('abc300');
        expect(meta.problemId).toBe('abc300_a');
    });

    test('parses title stripping leading index prefix', async () => {
        mockGet.mockResolvedValue({ data: simpleHtml });
        const { meta } = await client.fetchProblem('https://atcoder.jp/contests/abc300/tasks/abc300_a');
        expect(meta.title).toBe('Two Sum');
    });

    test('parses time and memory limits', async () => {
        mockGet.mockResolvedValue({ data: simpleHtml });
        const { meta } = await client.fetchProblem('https://atcoder.jp/contests/abc300/tasks/abc300_a');
        expect(meta.timeLimitMs).toBe(2000);
        expect(meta.memoryLimitMb).toBe(256);
    });

    test('parses two sample test cases', async () => {
        mockGet.mockResolvedValue({ data: simpleHtml });
        const { testCases } = await client.fetchProblem('https://atcoder.jp/contests/abc300/tasks/abc300_a');
        expect(testCases).toHaveLength(2);
        expect(testCases[0]).toEqual({ index: 1, input: '3 5', expected: '8' });
        expect(testCases[1]).toEqual({ index: 2, input: '0 0', expected: '0' });
    });

    test('parses multi-line input correctly', async () => {
        mockGet.mockResolvedValue({ data: bilingualHtml });
        const { testCases } = await client.fetchProblem('https://atcoder.jp/contests/abc200/tasks/abc200_b');
        expect(testCases[0].input).toBe('3\n1 2 3');
        expect(testCases[0].expected).toBe('6');
    });

    test('uses .lang-en section on bilingual page, ignoring Japanese samples', async () => {
        mockGet.mockResolvedValue({ data: bilingualHtml });
        const { testCases } = await client.fetchProblem('https://atcoder.jp/contests/abc200/tasks/abc200_b');
        expect(testCases).toHaveLength(1);
        expect(testCases[0].input).not.toContain('SHOULD NOT APPEAR');
    });

    test('falls back to #task-statement when no .lang-en present', async () => {
        mockGet.mockResolvedValue({ data: noLangEnHtml });
        const { testCases } = await client.fetchProblem('https://atcoder.jp/contests/abc100/tasks/abc100_c');
        expect(testCases).toHaveLength(1);
        expect(testCases[0]).toEqual({ index: 1, input: '42', expected: 'Yes' });
    });

    test('sets platform to atcoder', async () => {
        mockGet.mockResolvedValue({ data: simpleHtml });
        const { meta } = await client.fetchProblem('https://atcoder.jp/contests/abc300/tasks/abc300_a');
        expect(meta.platform).toBe('atcoder');
    });

    test('uses 2000ms fallback when time limit absent', async () => {
        const noLimitHtml = simpleHtml.replace(/Time Limit:.*?MB/s, '');
        mockGet.mockResolvedValue({ data: noLimitHtml });
        const { meta } = await client.fetchProblem('https://atcoder.jp/contests/abc300/tasks/abc300_a');
        expect(meta.timeLimitMs).toBe(2000);
    });

    test('throws on unparseable URL', async () => {
        mockGet.mockResolvedValue({ data: simpleHtml });
        await expect(
            client.fetchProblem('https://atcoder.jp/home')
        ).rejects.toThrow('Cannot parse contest/problem from AtCoder URL');
    });

    test('reads limits from bilingual page English section', async () => {
        mockGet.mockResolvedValue({ data: bilingualHtml });
        const { meta } = await client.fetchProblem('https://atcoder.jp/contests/abc200/tasks/abc200_b');
        expect(meta.timeLimitMs).toBe(3000);
        expect(meta.memoryLimitMb).toBe(512);
    });
});
