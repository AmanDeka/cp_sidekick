import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { scaffoldProblem, findProblemJson, readTestCases, addTestCase } from './core/workspaceManager';
import { runTests } from './core/runner';
import { showResults } from './ui/resultsPanel';
import { getSession, setSession, clearSession } from './core/secrets';
import { CodeforcesClient } from './platforms/codeforces';
import { startServer } from './core/server';
import type { Language, Platform, ProblemMeta, AuthSession } from './types';

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('cpSidekick');
  const port = config.get<number>('companionPort', 27121);
  const server = startServer(port, context.extensionPath);
  context.subscriptions.push({ dispose: () => server.close() });

  context.subscriptions.push(
    vscode.commands.registerCommand('cpSidekick.setupProblem', async () => {
      vscode.window.showInformationMessage(
        'Navigate to the problem page in Chrome, then click the CP Sidekick extension icon to send it to VS Code.',
        'OK'
      );
    }),

    vscode.commands.registerCommand('cpSidekick.runTests', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('CP Sidekick: Open a solution file first.');
        return;
      }

      await editor.document.save();
      const solutionFile = editor.document.uri.fsPath;
      const problemJsonPath = findProblemJson(solutionFile);
      if (!problemJsonPath) {
        vscode.window.showErrorMessage('CP Sidekick: No problem.json found — run Setup Problem first.');
        return;
      }

      const problemDir = path.dirname(problemJsonPath);
      const meta: ProblemMeta = JSON.parse(fs.readFileSync(problemJsonPath, 'utf8'));
      const testCases = readTestCases(problemDir);
      if (testCases.length === 0) {
        vscode.window.showWarningMessage('CP Sidekick: No test cases found in tests/ folder.');
        return;
      }

      const cfg = vscode.workspace.getConfiguration('cpSidekick');
      const runnerConfig = {
        cppCompiler:      cfg.get<string>('cpp.compiler', 'g++'),
        cppFlags:         cfg.get<string[]>('cpp.flags', ['-O2', '-std=c++17', '-Wall']),
        pythonExecutable: cfg.get<string>('python.executable', 'python3'),
        javaCompiler:     cfg.get<string>('java.compiler', 'javac'),
        javaRuntime:      cfg.get<string>('java.runtime', 'java'),
        timeLimitBufferMs: cfg.get<number>('timeLimitBufferMs', 1000),
      };

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'CP Sidekick: Running tests...' },
        async () => {
          try {
            const results = await runTests(solutionFile, meta, testCases, runnerConfig);
            showResults(results, meta.title);
          } catch (err) {
            vscode.window.showErrorMessage(`CP Sidekick: Run failed — ${String(err)}`);
          }
        }
      );
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

    vscode.commands.registerCommand('cpSidekick.login', async () => {
      const platform = await vscode.window.showQuickPick(
        [{ label: 'Codeforces', value: 'codeforces' as Platform }],
        { placeHolder: 'Select platform' }
      );
      if (!platform) { return; }

      const username = await vscode.window.showInputBox({
        prompt: `${platform.label} handle or email`,
        placeHolder: 'handle / email',
      });
      if (!username) { return; }

      const password = await vscode.window.showInputBox({
        prompt: `${platform.label} password`,
        password: true,
      });
      if (!password) { return; }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `CP Sidekick: Signing in to ${platform.label}...` },
        async () => {
          try {
            const client = new CodeforcesClient();
            const session = await client.login(username, password);
            await setSession(context.secrets, platform.value, session.cookieJarJson);
            vscode.window.showInformationMessage(`CP Sidekick: Signed in as ${session.handle}`);
          } catch (err) {
            vscode.window.showErrorMessage(`CP Sidekick: Sign in failed — ${String(err)}`);
          }
        }
      );
    }),

    vscode.commands.registerCommand('cpSidekick.logout', async () => {
      const platform = await vscode.window.showQuickPick(
        [{ label: 'Codeforces', value: 'codeforces' as Platform }],
        { placeHolder: 'Select platform to sign out of' }
      );
      if (!platform) { return; }

      await clearSession(context.secrets, platform.value);
      vscode.window.showInformationMessage(`CP Sidekick: Signed out of ${platform.label}`);
    }),

    vscode.commands.registerCommand('cpSidekick.submitSolution', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('CP Sidekick: Open a solution file first.');
        return;
      }

      const solutionFile = editor.document.uri.fsPath;
      const problemJsonPath = findProblemJson(solutionFile);
      if (!problemJsonPath) {
        vscode.window.showErrorMessage('CP Sidekick: No problem.json found — run Setup Problem first.');
        return;
      }

      const meta: ProblemMeta = JSON.parse(fs.readFileSync(problemJsonPath, 'utf8'));

      const cookieJarJson = await getSession(context.secrets, meta.platform);
      if (!cookieJarJson) {
        vscode.window.showErrorMessage(`CP Sidekick: Not signed in to ${meta.platform}. Run "CP: Sign In" first.`);
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Submit ${meta.title} (${meta.problemId}) to ${meta.platform}?`,
        { modal: true },
        'Submit'
      );
      if (confirm !== 'Submit') { return; }

      await editor.document.save();
      const solutionCode = fs.readFileSync(solutionFile, 'utf8');

      const cfg = vscode.workspace.getConfiguration('cpSidekick');
      const langIds = cfg.get<Record<string, string>>(`${meta.platform}.languageId`, {});
      const languageId = langIds[meta.language] ?? '91';

      const session: AuthSession = { platform: meta.platform, handle: '', cookieJarJson };

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'CP Sidekick: Submitting...' },
        async () => {
          try {
            const client = new CodeforcesClient();
            const statusUrl = await client.submit(meta, solutionCode, session, languageId);
            const open = await vscode.window.showInformationMessage(
              'CP Sidekick: Submitted! View your submission?',
              'Open'
            );
            if (open === 'Open') {
              vscode.env.openExternal(vscode.Uri.parse(statusUrl));
            }
          } catch (err) {
            vscode.window.showErrorMessage(`CP Sidekick: Submit failed — ${String(err)}`);
          }
        }
      );
    })
  );
}

export function deactivate(): void {}
