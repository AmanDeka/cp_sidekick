import * as http from 'http';
import * as path from 'path';
import * as vscode from 'vscode';
import { CodeforcesClient, detectCodeforcesUrl } from '../platforms/codeforces';
import { scaffoldProblem } from './workspaceManager';
import type { Language } from '../types';

function jsonResponse(res: http.ServerResponse, status: number, body: object): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

export function startServer(
  port: number,
  extensionPath: string,
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
      let parsed: { url?: string; language?: string };
      try {
        parsed = JSON.parse(body);
      } catch {
        jsonResponse(res, 400, { error: 'Invalid JSON' });
        return;
      }

      const { url, language: langRaw } = parsed;
      if (!url || typeof url !== 'string') {
        jsonResponse(res, 400, { error: 'Missing url field' });
        return;
      }

      const config = vscode.workspace.getConfiguration('cpSidekick');
      const language: Language = (['cpp', 'python', 'java'].includes(langRaw ?? '')
        ? langRaw
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

      if (!detectCodeforcesUrl(url)) {
        jsonResponse(res, 400, { error: 'Only Codeforces URLs are supported right now' });
        return;
      }

      try {
        const { meta, testCases } = await new CodeforcesClient().fetchProblem(url);
        meta.language = language;
        const solutionFile = await scaffoldProblem(meta, workspaceRoot, testCases, extensionPath);
        const doc = await vscode.workspace.openTextDocument(solutionFile);
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage(
          `CP Sidekick: Ready — ${meta.title} (${testCases.length} test cases)`,
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
