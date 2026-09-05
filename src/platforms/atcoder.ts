import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { CookieJar } from 'tough-cookie';
import { makeClient } from './http';
import type { IPlatform, FetchResult } from './types';
import type { ProblemMeta, TestCase, AuthSession, Language } from '../types';

function parseContestAndProblem(url: string): { contestId: string; problemId: string } {
    // https://atcoder.jp/contests/abc300/tasks/abc300_a
    const match = url.match(/\/contests\/([^/]+)\/tasks\/([^/?#]+)/i);
    if (match) {
        return { contestId: match[1], problemId: match[2] };
    }
    throw new Error(`Cannot parse contest/problem from AtCoder URL: ${url}`);
}

function parseTimeLimit(text: string): number {
    const match = text.match(/([\d.]+)\s*sec/i);
    return match ? Math.round(parseFloat(match[1]) * 1000) : 2000;
}

function parseMemoryLimit(text: string): number {
    const match = text.match(/(\d+)\s*MB/i);
    return match ? parseInt(match[1], 10) : 256;
}

function extractCsrf($: CheerioAPI): string {
    const token = $('input[name="csrf_token"]').first().val() as string | undefined;
    if (!token) {
        throw new Error('Could not find CSRF token on AtCoder page.');
    }
    return token;
}

function restoreJar(cookieJarJson: string): CookieJar {
    return CookieJar.deserializeSync(JSON.parse(cookieJarJson));
}

export class AtCoderClient implements IPlatform {
    async fetchProblem(url: string): Promise<FetchResult> {
        const client = makeClient();
        const response = await client.get<string>(url);
        const $ = cheerio.load(response.data);

        const { contestId, problemId } = parseContestAndProblem(url);

        // Prefer the English section on bilingual pages to avoid Japanese duplicates
        const langEn = $('.lang-en');
        const container = langEn.length > 0 ? langEn : $('#task-statement').length > 0 ? $('#task-statement') : $('body');

        const statementText = container.text();
        const timeLimitMs = parseTimeLimit(statementText);
        const memoryLimitMb = parseMemoryLimit(statementText);

        // Title lives in the first h2 or span.h2 outside the statement
        const rawTitle = $('span.h2').first().text().trim()
            || $('h2').first().text().trim()
            || problemId;
        // Strip leading "A - ", "B - " index prefix if present
        const title = rawTitle.replace(/^[A-Za-z\d]+\s*-\s*/, '').trim() || rawTitle;

        // Collect sample inputs/outputs by number so pairing is always correct
        const inputs: string[] = [];
        const outputs: string[] = [];

        container.find('h3').each((_, h3El) => {
            const h3Text = $(h3El).text().trim();
            const inputMatch = h3Text.match(/sample input\s*(\d+)/i);
            const outputMatch = h3Text.match(/sample output\s*(\d+)/i);
            const pre = $(h3El).next('pre');
            if (!pre.length) { return; }

            if (inputMatch) {
                inputs[parseInt(inputMatch[1]) - 1] = pre.text().trim();
            } else if (outputMatch) {
                outputs[parseInt(outputMatch[1]) - 1] = pre.text().trim();
            }
        });

        const testCases: TestCase[] = [];
        for (let i = 0; i < inputs.length; i++) {
            if (inputs[i] !== undefined) {
                testCases.push({ index: i + 1, input: inputs[i], expected: outputs[i] ?? '' });
            }
        }

        const meta: ProblemMeta = {
            platform: 'atcoder',
            contestId,
            problemId,
            title: title || `${contestId}_${problemId}`,
            url,
            timeLimitMs,
            memoryLimitMb,
            language: 'cpp',
        };

        return { meta, testCases };
    }

    async submit(meta: ProblemMeta, solutionCode: string, session: AuthSession, languageId: string): Promise<string> {
        const jar = restoreJar(session.cookieJarJson);
        const client = makeClient(jar);

        const submitPageUrl = `https://atcoder.jp/contests/${meta.contestId}/submit`;
        const pageRes = await client.get<string>(submitPageUrl);
        const $page = cheerio.load(pageRes.data);

        // Login page is shown when session is missing or expired
        if ($page('#username').length > 0) {
            throw new Error('Your AtCoder session has expired. Run "CP: Sign In" again.');
        }

        const csrf = extractCsrf($page);

        const body = new URLSearchParams({
            csrf_token: csrf,
            'data.TaskScreenName': meta.problemId,
            'data.LanguageId': languageId,
            sourceCode: solutionCode,
        });

        await client.post<string>(
            submitPageUrl,
            body.toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': submitPageUrl } }
        );

        return `https://atcoder.jp/contests/${meta.contestId}/submissions/me`;
    }
}

export function detectAtCoderUrl(url: string): boolean {
    return url.includes('atcoder.jp');
}

export function defaultLanguageId(): Record<Language, string> {
    // IDs can vary per contest — expose as user settings and look them up
    // from the <select> on the live submit page if these become stale.
    // Current defaults: C++ (GCC 9.2.1) = 4003, Python (3.8.2) = 4047, Java (OpenJDK 11.0.6) = 4005
    return { cpp: '4003', python: '4047', java: '4005' };
}
