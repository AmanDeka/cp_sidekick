import * as vscode from 'vscode';
import * as path from 'path';
import { scaffoldProblem, findProblemJson, addTestCase } from './core/workspaceManager';
import type { ProblemMeta } from './types';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('cpSidekick.setupProblem', async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage('CP Sidekick: Open a workspace folder first.');
        return;
      }

      const config = vscode.workspace.getConfiguration('cpSidekick');
      const workspaceRoot = path.join(
        workspaceFolders[0].uri.fsPath,
        config.get<string>('workspaceRoot', 'cp')
      );

      // Hard-coded dummy meta for Phase 1 — will be replaced by real fetcher in Phase 2/3
      const meta: ProblemMeta = {
        platform: 'codeforces',
        contestId: '1',
        problemId: 'A',
        title: 'Theatre Square',
        url: 'https://codeforces.com/problemset/problem/1/A',
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        language: config.get<'cpp' | 'python' | 'java'>('defaultLanguage', 'cpp'),
      };

      try {
        const solutionFile = await scaffoldProblem(meta, workspaceRoot, [], context.extensionPath);
        const doc = await vscode.workspace.openTextDocument(solutionFile);
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage(`CP Sidekick: Scaffolded ${meta.title}`);
      } catch (err) {
        vscode.window.showErrorMessage(`CP Sidekick: Setup failed — ${String(err)}`);
      }
    }),

    vscode.commands.registerCommand('cpSidekick.runTests', () => {
      vscode.window.showInformationMessage('CP Sidekick: Run Tests — coming in Phase 4');
    }),

    vscode.commands.registerCommand('cpSidekick.addTestCase', async () => {
      const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
      if (!activeFile) {
        vscode.window.showErrorMessage('CP Sidekick: Open a solution file first.');
        return;
      }

      const problemJsonPath = findProblemJson(activeFile);
      if (!problemJsonPath) {
        vscode.window.showErrorMessage('CP Sidekick: No problem.json found — run Setup Problem first.');
        return;
      }

      const problemDir = path.dirname(problemJsonPath);

      try {
        const { inPath, outPath } = addTestCase(problemDir);

        const inDoc = await vscode.workspace.openTextDocument(inPath);
        await vscode.window.showTextDocument(inDoc, vscode.ViewColumn.One);

        const outDoc = await vscode.workspace.openTextDocument(outPath);
        await vscode.window.showTextDocument(outDoc, vscode.ViewColumn.Two);
      } catch (err) {
        vscode.window.showErrorMessage(`CP Sidekick: Add test case failed — ${String(err)}`);
      }
    }),

    vscode.commands.registerCommand('cpSidekick.login', () => {
      vscode.window.showInformationMessage('CP Sidekick: Sign In — coming in Phase 6');
    }),

    vscode.commands.registerCommand('cpSidekick.logout', () => {
      vscode.window.showInformationMessage('CP Sidekick: Sign Out — coming in Phase 6');
    }),

    vscode.commands.registerCommand('cpSidekick.submitSolution', () => {
      vscode.window.showInformationMessage('CP Sidekick: Submit Solution — coming in Phase 7');
    })
  );
}

export function deactivate(): void {}
