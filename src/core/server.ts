import * as http from 'http';
import * as path from 'path';
import * as vscode from 'vscode';
import { CookieJar, Cookie } from 'tough-cookie';
import { scaffoldProblem } from './workspaceManager';
import type { Language, Platform, ProblemMeta, TestCase } from '../types';

function jsonResponse(res: http.ServerResponse, status: number, body: object): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

interface ChromeCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expirationDate?: number;
}

interface CompanionPayload {
  platform?: string;
  contestId?: string;
  problemId?: string;
  title?: string;
  url?: string;
  timeLimitMs?: number;
  memoryLimitMb?: number;
  testCases?: TestCase[];
  language?: string;
  cookies?: ChromeCookie[];
}

function buildCookieJar(chromeCookies: ChromeCookie[]): string {
  const jar = new CookieJar();
  for (const c of chromeCookies) {
    try {
      const cookie = new Cookie({
        key: c.name,
        value: c.value,
        domain: c.domain.replace(/^\./, ''),
        path: c.path || '/',
        secure: c.secure,
        httpOnly: c.httpOnly,
        expires: c.expirationDate ? new Date(c.expirationDate * 1000) : undefined,
      });
      jar.setCookieSync(cookie, 'https://codeforces.com/');
    } catch {
      // skip malformed cookies
    }
  }
  return JSON.stringify(jar.toJSON());
}

export function startServer(
  port: number,
  extensionPath: string,
  onSession: (platform: Platform, cookieJarJson: string, silent?: boolean) => Promise<void>,
): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      jsonResponse(res, 405, { error: 'Method not allowed' });
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let payload: CompanionPayload;
      try {
        payload = JSON.parse(body);
      } catch {
        jsonResponse(res, 400, { error: 'Invalid JSON' });
        return;
      }

      // /session route — import browser cookies as the stored session
      if (req.url === '/session') {
        if (!payload.cookies || !Array.isArray(payload.cookies)) {
          jsonResponse(res, 400, { error: 'Missing cookies array' });
          return;
        }
        try {
          const platform = (payload.platform ?? 'codeforces') as Platform;
          const cookieJarJson = buildCookieJar(payload.cookies);
          await onSession(platform, cookieJarJson);
          jsonResponse(res, 200, { ok: true });
        } catch (err) {
          jsonResponse(res, 500, { error: String(err) });
        }
        return;
      }

      // Default route — scaffold a problem
      const { contestId, problemId, title, url, timeLimitMs, memoryLimitMb, testCases } = payload;

      if (!contestId || !problemId || !url) {
        jsonResponse(res, 400, { error: 'Missing required fields: contestId, problemId, url' });
        return;
      }

      const config = vscode.workspace.getConfiguration('cpSidekick');
      const language: Language = (['cpp', 'python', 'java'].includes(payload.language ?? '')
        ? payload.language
        : config.get<Language>('defaultLanguage', 'cpp')) as Language;

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        jsonResponse(res, 500, { error: 'No workspace folder open in VS Code' });
        return;
      }
      const workspaceRoot = path.join(
        workspaceFolders[0].uri.fsPath,
        config.get<string>('workspaceRoot', 'cp'),
      );

      const meta: ProblemMeta = {
        platform: (payload.platform ?? 'codeforces') as Platform,
        contestId,
        problemId,
        title: title || `${contestId}${problemId}`,
        url,
        timeLimitMs: timeLimitMs ?? 2000,
        memoryLimitMb: memoryLimitMb ?? 256,
        language,
      };

      try {
        // Silently refresh the session if cookies were included alongside the problem.
        if (payload.cookies && Array.isArray(payload.cookies) && payload.cookies.length > 0) {
          const cookieJarJson = buildCookieJar(payload.cookies);
          await onSession(meta.platform, cookieJarJson, true);
        }

        const solutionFile = await scaffoldProblem(meta, workspaceRoot, testCases ?? [], extensionPath);
        const doc = await vscode.workspace.openTextDocument(solutionFile);
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage(
          `CP Sidekick: Ready — ${meta.title} (${(testCases ?? []).length} test cases)`,
        );
        jsonResponse(res, 200, { ok: true, title: meta.title });
      } catch (err) {
        jsonResponse(res, 500, { error: String(err) });
      }
    });
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`CP Sidekick companion server listening on port ${port}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      vscode.window.showWarningMessage(
        `CP Sidekick: Port ${port} is already in use. The companion server did not start.`,
      );
    }
  });

  return server;
}
