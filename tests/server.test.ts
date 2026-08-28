import * as http from 'http';
import { CookieJar } from 'tough-cookie';

// vscode is not a real npm package in the test environment
jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({
            get: (_key: string, defaultValue: unknown) => defaultValue,
        }),
        workspaceFolders: [{ uri: { fsPath: '/tmp/ws' } }],
        openTextDocument: jest.fn().mockResolvedValue({}),
    },
    window: {
        showTextDocument: jest.fn().mockResolvedValue(undefined),
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
    },
}), { virtual: true });

jest.mock('../src/core/workspaceManager', () => ({
    scaffoldProblem: jest.fn().mockResolvedValue('/tmp/ws/cp/codeforces/1/A/solution.cpp'),
}));

import { startServer } from '../src/core/server';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function listenAsync(server: http.Server): Promise<void> {
    return new Promise(resolve => server.on('listening', resolve));
}

function closeAsync(server: http.Server): Promise<void> {
    return new Promise(resolve => server.close(() => resolve()));
}

function post(server: http.Server, path: string, body: object): Promise<{ status: number; data: Record<string, unknown> }> {
    return new Promise((resolve, reject) => {
        const addr = server.address() as { port: number };
        const payload = JSON.stringify(body);
        const req = http.request(
            {
                hostname: '127.0.0.1',
                port: addr.port,
                path,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
            },
            res => {
                let raw = '';
                res.on('data', chunk => { raw += chunk; });
                res.on('end', () => resolve({ status: res.statusCode!, data: JSON.parse(raw) }));
            }
        );
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function options(server: http.Server): Promise<{ status: number }> {
    return new Promise((resolve, reject) => {
        const addr = server.address() as { port: number };
        const req = http.request(
            { hostname: '127.0.0.1', port: addr.port, path: '/', method: 'OPTIONS' },
            res => resolve({ status: res.statusCode! })
        );
        req.on('error', reject);
        req.end();
    });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const sampleCookies = [
    { name: 'JSESSIONID', value: 'tok_abc', domain: 'codeforces.com', path: '/', secure: true, httpOnly: true },
    { name: 'X-User-Login', value: 'tourist',  domain: '.codeforces.com', path: '/', secure: false, httpOnly: false },
];

const validProblem = {
    platform: 'codeforces',
    contestId: '1',
    problemId: 'A',
    title: 'Test Problem',
    url: 'https://codeforces.com/contest/1/problem/A',
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    testCases: [],
};

// ─── /session route ───────────────────────────────────────────────────────────

describe('/session route', () => {
    let server: http.Server;
    let onSession: jest.Mock;

    beforeAll(async () => {
        onSession = jest.fn().mockResolvedValue(undefined);
        server = startServer(0, '/fake/ext', onSession);
        await listenAsync(server);
    });

    afterAll(() => closeAsync(server));
    beforeEach(() => onSession.mockClear());

    test('returns 200 and calls onSession for valid cookies', async () => {
        const { status, data } = await post(server, '/session', { platform: 'codeforces', cookies: sampleCookies });
expect(status).toBe(200);
        expect(data.ok).toBe(true);
        expect(onSession).toHaveBeenCalledTimes(1);
    });

    test('calls onSession without the silent flag (notification should show)', async () => {
        await post(server, '/session', { platform: 'codeforces', cookies: sampleCookies });
        const [, , silent] = onSession.mock.calls[0];
        expect(silent).toBeUndefined();
    });

    test('passes codeforces as the platform', async () => {
        await post(server, '/session', { platform: 'codeforces', cookies: sampleCookies });
        const [platform] = onSession.mock.calls[0];
        expect(platform).toBe('codeforces');
    });

    test('defaults platform to codeforces when omitted', async () => {
        await post(server, '/session', { cookies: sampleCookies });
        const [platform] = onSession.mock.calls[0];
        expect(platform).toBe('codeforces');
    });

    test('cookie values are preserved in the jar passed to onSession', async () => {
        await post(server, '/session', { platform: 'codeforces', cookies: sampleCookies });
        const [, cookieJarJson] = onSession.mock.calls[0];
        const jar = CookieJar.deserializeSync(JSON.parse(cookieJarJson));
        const cookies = jar.getCookiesSync('https://codeforces.com/');
        expect(cookies.some(c => c.key === 'JSESSIONID' && c.value === 'tok_abc')).toBe(true);
    });

    test('strips leading dot from cookie domain', async () => {
        await post(server, '/session', { platform: 'codeforces', cookies: sampleCookies });
        const [, cookieJarJson] = onSession.mock.calls[0];
        const jar = CookieJar.deserializeSync(JSON.parse(cookieJarJson));
        const cookies = jar.getCookiesSync('https://codeforces.com/');
        expect(cookies.some(c => c.key === 'X-User-Login')).toBe(true);
    });

    test('returns 400 when cookies field is missing', async () => {
        const { status } = await post(server, '/session', { platform: 'codeforces' });
        expect(status).toBe(400);
        expect(onSession).not.toHaveBeenCalled();
    });

    test('returns 400 when cookies is not an array', async () => {
        const { status } = await post(server, '/session', { platform: 'codeforces', cookies: 'bad' });
        expect(status).toBe(400);
        expect(onSession).not.toHaveBeenCalled();
    });

    test('returns 400 for invalid JSON body', async () => {
        const addr = server.address() as { port: number };
        const { status } = await new Promise<{ status: number }>((resolve, reject) => {
            const req = http.request(
                { hostname: '127.0.0.1', port: addr.port, path: '/session', method: 'POST',
                  headers: { 'Content-Type': 'application/json' } },
                res => resolve({ status: res.statusCode! })
            );
            req.on('error', reject);
            req.write('{not valid json');
            req.end();
        });
        expect(status).toBe(400);
    });

    test('returns 405 for non-POST requests', async () => {
        const addr = server.address() as { port: number };
        const { status } = await new Promise<{ status: number }>((resolve, reject) => {
            const req = http.request(
                { hostname: '127.0.0.1', port: addr.port, path: '/session', method: 'GET' },
                res => resolve({ status: res.statusCode! })
            );
            req.on('error', reject);
            req.end();
        });
        expect(status).toBe(405);
    });

    test('OPTIONS preflight returns 204', async () => {
        const { status } = await options(server);
        expect(status).toBe(204);
    });
});

// ─── Main route — cookie handling alongside problem ───────────────────────────

describe('main route cookie handling', () => {
    let server: http.Server;
    let onSession: jest.Mock;

    beforeAll(async () => {
        onSession = jest.fn().mockResolvedValue(undefined);
        server = startServer(0, '/fake/ext', onSession);
        await listenAsync(server);
    });

    afterAll(() => closeAsync(server));
    beforeEach(() => onSession.mockClear());

    test('calls onSession silently when cookies are included with the problem', async () => {
        const { status } = await post(server, '/', { ...validProblem, cookies: sampleCookies });
        expect(status).toBe(200);
        expect(onSession).toHaveBeenCalledTimes(1);
        const [, , silent] = onSession.mock.calls[0];
        expect(silent).toBe(true);
    });

    test('does not call onSession when no cookies are in the problem payload', async () => {
        await post(server, '/', validProblem);
        expect(onSession).not.toHaveBeenCalled();
    });

    test('does not call onSession when cookies array is empty', async () => {
        await post(server, '/', { ...validProblem, cookies: [] });
        expect(onSession).not.toHaveBeenCalled();
    });

    test('cookie values are preserved in the jar passed to onSession', async () => {
        await post(server, '/', { ...validProblem, cookies: sampleCookies });
        const [, cookieJarJson] = onSession.mock.calls[0];
        const jar = CookieJar.deserializeSync(JSON.parse(cookieJarJson));
        const cookies = jar.getCookiesSync('https://codeforces.com/');
        expect(cookies.some(c => c.key === 'JSESSIONID' && c.value === 'tok_abc')).toBe(true);
    });

    test('still scaffolds the problem when cookies are present', async () => {
        const { data } = await post(server, '/', { ...validProblem, cookies: sampleCookies });
        expect(data.ok).toBe(true);
        expect(data.title).toBe('Test Problem');
    });

    test('returns 400 when contestId is missing', async () => {
        const { contestId: _, ...noContest } = validProblem;
        const { status } = await post(server, '/', noContest);
        expect(status).toBe(400);
    });

    test('returns 400 when problemId is missing', async () => {
        const { problemId: _, ...noProblem } = validProblem;
        const { status } = await post(server, '/', noProblem);
        expect(status).toBe(400);
    });

    test('returns 400 when url is missing', async () => {
        const { url: _, ...noUrl } = validProblem;
        const { status } = await post(server, '/', noUrl);
        expect(status).toBe(400);
    });
});
