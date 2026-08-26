import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { Element, Text, AnyNode } from 'domhandler';
import { CookieJar } from 'tough-cookie';
import { makeClient } from './http';
import type { IPlatform, FetchResult } from './types';
import type { ProblemMeta, TestCase, AuthSession, Language } from '../types';

// Walk a <pre>'s child nodes and convert <br>/<div> boundaries to newlines.
// cheerio's .text() collapses them onto one line — this preserves structure.
function extractPreText($: CheerioAPI, pre: AnyNode): string {
    let result = '';
    const children = (pre as Element).children ?? [];
    for (const node of children) {
        if (node.type === 'text') {
            result += (node as Text).data;
        } else if (node.type === 'tag') {
            const el = node as Element;
            if (el.name === 'br') {
                result += '\n';
            } else if (el.name === 'div') {
                const inner = $.text([el]);
                result += (result.length > 0 && !result.endsWith('\n') ? '\n' : '') + inner;
            } else {
                result += $.text([el]);
            }
        }
    }
    return result.trim();
}

function parseContestAndProblem(url: string): { contestId: string; problemId: string } {
    // Handles:
    //   codeforces.com/problemset/problem/1/A
    //   codeforces.com/contest/1/problem/A
    const contestMatch = url.match(/\/contest\/(\d+)\/problem\/([^/?#]+)/i);
    if (contestMatch) {
        return { contestId: contestMatch[1], problemId: contestMatch[2].toUpperCase() };
    }
    const problemsetMatch = url.match(/\/problemset\/problem\/(\d+)\/([^/?#]+)/i);
    if (problemsetMatch) {
        return { contestId: problemsetMatch[1], problemId: problemsetMatch[2].toUpperCase() };
    }
    throw new Error(`Cannot parse contest/problem from URL: ${url}`);
}

function parseTimeLimit(text: string): number {
    const match = text.match(/([\d.]+)\s*second/i);
    return match ? Math.round(parseFloat(match[1]) * 1000) : 2000;
}

function parseMemoryLimit(text: string): number {
    const match = text.match(/(\d+)\s*megabyte/i);
    return match ? parseInt(match[1], 10) : 256;
}

function randomAlphanumeric(length: number): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

function extractCsrf($: CheerioAPI): string {
    const token = $('input[name="csrf_token"]').first().val() as string | undefined;
    if (!token) {
        throw new Error('Could not find CSRF token on Codeforces page.');
    }
    return token;
}

function restoreJar(cookieJarJson: string): CookieJar {
    return CookieJar.deserializeSync(JSON.parse(cookieJarJson));
}

export class CodeforcesClient implements IPlatform {
    async fetchProblem(url: string): Promise<FetchResult> {
        const client = makeClient();
        const response = await client.get<string>(url);
        const $ = cheerio.load(response.data);

        const { contestId, problemId } = parseContestAndProblem(url);

        const title = $('.title').first().text().trim().replace(/^[A-Z]\.\s*/, '');
        const timeLimitMs = parseTimeLimit($('.time-limit').first().text());
        const memoryLimitMb = parseMemoryLimit($('.memory-limit').first().text());

        const testCases: TestCase[] = [];
        $('.sample-test').find('.input').each((i, inputEl) => {
            const pre = $(inputEl).find('pre').get(0);
            if (!pre) { return; }
            const input = extractPreText($, pre);

            const outputEl = $('.sample-test').find('.output').get(i);
            const outPre = outputEl ? $(outputEl).find('pre').get(0) : undefined;
            const expected = outPre ? extractPreText($, outPre) : '';

            testCases.push({ index: i + 1, input, expected });
        });

        const meta: ProblemMeta = {
            platform: 'codeforces',
            contestId,
            problemId,
            title: title || `${contestId}${problemId}`,
            url,
            timeLimitMs,
            memoryLimitMb,
            language: 'cpp',  // caller overrides with user's chosen language
        };

        return { meta, testCases };
    }

    async login(username: string, password: string): Promise<AuthSession> {
        const jar = new CookieJar();
        const client = makeClient(jar);

        const loginUrl = 'https://codeforces.com/enter';
        const pageRes = await client.get<string>(loginUrl);
        const $page = cheerio.load(pageRes.data);

        if ($page('.rc-anchor-container, .g-recaptcha').length > 0) {
            throw new Error(
                'Codeforces is showing a CAPTCHA challenge. ' +
                'Log in via browser first to clear it, then try again.'
            );
        }

        const csrf = extractCsrf($page);
        const ftaa = randomAlphanumeric(18);
        const bfaa = randomAlphanumeric(18);

        const body = new URLSearchParams({
            csrf_token: csrf,
            action: 'enter',
            handleOrEmail: username,
            password,
            ftaa,
            bfaa,
            _tta: '0',
            remember: 'on',
        });

        const loginRes = await client.post<string>(
            `${loginUrl}?csrf_token=${csrf}`,
            body.toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': loginUrl } }
        );

        const $after = cheerio.load(loginRes.data);

        if ($after('.rc-anchor-container, .g-recaptcha').length > 0) {
            throw new Error(
                'Codeforces requires CAPTCHA verification. ' +
                'This extension cannot complete sign-in when CAPTCHA is active.'
            );
        }

        if ($after('#enterForm').length > 0) {
            const errText = $after('.error').first().text().trim();
            throw new Error(
                errText ||
                'Login failed — check your handle/email and password. ' +
                'Accounts with 2FA cannot sign in through this extension.'
            );
        }

        // Extract handle from the top nav
        const handle =
            $after('a[href^="/profile/"]').first().text().trim() ||
            username;

        return {
            platform: 'codeforces',
            handle,
            cookieJarJson: JSON.stringify(jar.toJSON()),
        };
    }

    async submit(meta: ProblemMeta, solutionCode: string, session: AuthSession, languageId: string): Promise<string> {
        const jar = restoreJar(session.cookieJarJson);
        const client = makeClient(jar);

        const submitPageUrl = `https://codeforces.com/contest/${meta.contestId}/submit`;
        const pageRes = await client.get<string>(submitPageUrl);
        const $page = cheerio.load(pageRes.data);

        // Redirected to login page — session expired
        if ($page('#enterForm').length > 0) {
            throw new Error('Your Codeforces session has expired. Run "CP: Sign In" again.');
        }

        const csrf = extractCsrf($page);
        const ftaa = randomAlphanumeric(18);
        const bfaa = randomAlphanumeric(18);

        const body = new URLSearchParams({
            csrf_token: csrf,
            action: 'submitSolutionFormSubmit',
            contestId: meta.contestId,
            submittedProblemIndex: meta.problemId,
            programTypeId: languageId,
            source: solutionCode,
            tabSize: '4',
            _tta: '0',
            ftaa,
            bfaa,
        });

        const submitRes = await client.post<string>(
            `${submitPageUrl}?csrf_token=${csrf}`,
            body.toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': submitPageUrl } }
        );

        const $after = cheerio.load(submitRes.data);

        // If submit form is still on the page, something went wrong
        if ($after('#submitSolutionForm').length > 0) {
            const errText = $after('.error').first().text().trim();
            throw new Error(errText || 'Submission failed — the form was rejected by Codeforces.');
        }

        return `https://codeforces.com/contest/${meta.contestId}/my`;
    }
}

export function detectCodeforcesUrl(url: string): boolean {
    return url.includes('codeforces.com');
}

export function defaultLanguageId(): Record<Language, string> {
    return { cpp: '91', python: '70', java: '87' };
}
