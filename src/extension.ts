import * as vscode from 'vscode';
import * as path from 'path';
import { scaffoldProblem, findProblemJson, addTestCase } from './core/workspaceManager';
import { CodeforcesClient, detectCodeforcesUrl } from './platforms/codeforces';
import type { Language } from './types';

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

      const url = await vscode.window.showInputBox({
        prompt: 'Problem URL',
        placeHolder: 'https://codeforces.com/problemset/problem/1/A',
        validateInput: v => v.startsWith('http') ? undefined : 'Enter a valid URL',
      });
      if (!url) { return; }

      const language = await vscode.window.showQuickPick(
        ['cpp', 'python', 'java'],
        { placeHolder: 'Select language' }
      ) as Language | undefined;
      if (!language) { return; }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'CP Sidekick: Fetching problem...' },
        async () => {
          try {
            if (!detectCodeforcesUrl(url)) {
              vscode.window.showErrorMessage('CP Sidekick: Only Codeforces URLs are supported right now.');
              return;
            }

            const { meta, testCases } = await new CodeforcesClient().fetchProblem(url);
            meta.language = language;

            const solutionFile = await scaffoldProblem(meta, workspaceRoot, testCases, context.extensionPath);
            const doc = await vscode.workspace.openTextDocument(solutionFile);
            await vscode.window.showTextDocument(doc);
            vscode.window.showInformationMessage(`CP Sidekick: Ready — ${meta.title} (${testCases.length} test cases)`);
          } catch (err) {
            vscode.window.showErrorMessage(`CP Sidekick: Setup failed — ${String(err)}`);
          }
        }
      );
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
