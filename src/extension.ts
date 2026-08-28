import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { scaffoldProblem, findProblemJson, readTestCases, addTestCase } from './core/workspaceManager';
import { runTests } from './core/runner';
import { showResults } from './ui/resultsPanel';
import { getSession, setSession, clearSession } from './core/secrets';
import { CodeforcesClient } from './platforms/codeforces';
import { startServer } from './core/server';
import type { Language, Platform, ProblemMeta, AuthSession } from './types';

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('cpSidekick');

  checkCompilerOnActivation(config.get<string>('cpp.compiler', 'g++'),        'C++ compiler',       'cpSidekick.cpp.compiler');
  checkCompilerOnActivation(config.get<string>('python.executable', 'python3'), 'Python interpreter', 'cpSidekick.python.executable');
  checkCompilerOnActivation(config.get<string>('java.compiler', 'javac'),      'Java compiler',      'cpSidekick.java.compiler');
  checkCompilerOnActivation(config.get<string>('java.runtime', 'java'),        'Java runtime',       'cpSidekick.java.runtime');

  const port = config.get<number>('companionPort', 27121);
  const server = startServer(port, context.extensionPath, async (platform, cookieJarJson, silent) => {
    await setSession(context.secrets, platform, cookieJarJson);
    if (!silent) {
      vscode.window.showInformationMessage(`CP Sidekick: Signed in to ${platform} via browser session.`);
    }
  });
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

      const loginUrls: Record<string, string> = {
        codeforces: 'https://codeforces.com/enter',
      };

      await vscode.env.openExternal(vscode.Uri.parse(loginUrls[platform.value]));
      vscode.window.showInformationMessage(
        `CP Sidekick: Sign in to ${platform.label} in the browser — ` +
        `your session will be imported automatically once you\'re logged in.`
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

function checkCompilerOnActivation(compiler: string, label: string, settingKey: string): void {
  const probe = cp.spawn(compiler, ['--version'], { stdio: 'ignore' });
  probe.on('error', async (err: NodeJS.ErrnoException) => {
    if (err.code !== 'ENOENT') { return; }
    const action = await vscode.window.showWarningMessage(
      `CP Sidekick: ${label} "${compiler}" was not found. Browse to its location to configure it.`,
      'Browse'
    );
    if (action !== 'Browse') { return; }

    const filters: { [name: string]: string[] } = process.platform === 'win32'
      ? { 'Executable': ['exe'] }
      : { 'All files': ['*'] };

    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: `Select ${label.toLowerCase()}`,
      filters,
    });
    if (!picked || picked.length === 0) { return; }

    const selectedPath = picked[0].fsPath;
    const [section, key] = settingKey.split(/\.(.+)/);
    await vscode.workspace.getConfiguration(section).update(key, selectedPath, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`CP Sidekick: ${label} set to "${selectedPath}".`);
  });
  probe.on('close', () => {});
}
