import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { Element, Text, AnyNode } from 'domhandler';
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

    async login(_username: string, _password: string): Promise<AuthSession> {
        throw new Error('Login not implemented yet — coming in Phase 6');
    }

    async submit(_meta: ProblemMeta, _solutionCode: string, _session: AuthSession): Promise<string> {
        throw new Error('Submit not implemented yet — coming in Phase 7');
    }
}

export function detectCodeforcesUrl(url: string): boolean {
    return url.includes('codeforces.com');
}

export function defaultLanguageId(): Record<Language, string> {
    return { cpp: '91', python: '70', java: '87' };
}
