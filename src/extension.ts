import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('cpSidekick.setupProblem', () => {
      vscode.window.showInformationMessage('CP Sidekick: Setup Problem — coming in Phase 1');
    }),

    vscode.commands.registerCommand('cpSidekick.runTests', () => {
      vscode.window.showInformationMessage('CP Sidekick: Run Tests — coming in Phase 4');
    }),

    vscode.commands.registerCommand('cpSidekick.addTestCase', () => {
      vscode.window.showInformationMessage('CP Sidekick: Add Test Case — coming in Phase 1');
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
