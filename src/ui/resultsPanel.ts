import * as vscode from 'vscode';
import type { RunResult } from '../types';

let panel: vscode.WebviewPanel | undefined;

export function showResults(results: RunResult[], title: string): void {
  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      'cpSidekickResults',
      'CP Sidekick: Results',
      vscode.ViewColumn.Beside,
      { enableScripts: false, retainContextWhenHidden: true }
    );
    panel.onDidDispose(() => { panel = undefined; });
  }

  panel.title = `Results: ${title}`;
  panel.webview.html = buildHtml(results);
  panel.reveal(vscode.ViewColumn.Beside, true);
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pass':  return '✓ Pass';
    case 'fail':  return '✗ Fail';
    case 'tle':   return '⏱ TLE?';
    case 'error': return '⚠ Error';
    default:      return status;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'pass':  return '#2ea043';
    case 'fail':  return '#f85149';
    case 'tle':   return '#d29922';
    case 'error': return '#f85149';
    default:      return '#8b949e';
  }
}

function buildHtml(results: RunResult[]): string {
  const passed = results.filter(r => r.status === 'pass').length;
  const total  = results.length;

  const cards = results.map(r => {
    const color  = statusColor(r.status);
    const label  = statusLabel(r.status);
    const detail = r.status !== 'pass'
      ? `
        <div class="section"><div class="label">Input</div><pre>${esc(r.testCase.input)}</pre></div>
        <div class="section"><div class="label">Expected</div><pre>${esc(r.testCase.expected)}</pre></div>
        <div class="section"><div class="label">Got</div><pre>${esc(r.actual || '(no output)')}</pre></div>
        ${r.stderr ? `<div class="section"><div class="label">Stderr</div><pre class="err">${esc(r.stderr)}</pre></div>` : ''}
      ` : '';

    return `
      <div class="card" style="border-left: 4px solid ${color}">
        <div class="card-header">
          <span class="badge" style="color:${color}">${label}</span>
          <span class="tc-title">Test ${r.testCase.index}</span>
          <span class="runtime">${r.runtimeMs} ms</span>
        </div>
        ${detail}
      </div>
    `;
  }).join('');

  const summaryColor = passed === total ? '#2ea043' : '#f85149';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  body { font-family: var(--vscode-editor-font-family, monospace); font-size: 13px;
         background: var(--vscode-editor-background); color: var(--vscode-editor-foreground);
         margin: 0; padding: 16px; }
  h2   { margin: 0 0 12px; font-size: 15px; }
  .summary { font-size: 14px; font-weight: 600; color: ${summaryColor}; margin-bottom: 16px; }
  .card { background: var(--vscode-editorWidget-background, #1e1e1e);
          border-radius: 4px; margin-bottom: 12px; overflow: hidden; }
  .card-header { display: flex; align-items: center; gap: 10px; padding: 8px 12px;
                 background: var(--vscode-editorGroupHeader-tabsBackground, #252526); }
  .badge  { font-weight: 700; min-width: 60px; }
  .tc-title { flex: 1; }
  .runtime  { font-size: 11px; color: var(--vscode-descriptionForeground, #8b949e); }
  .section  { padding: 6px 12px; }
  .label    { font-size: 11px; color: var(--vscode-descriptionForeground, #8b949e);
              text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  pre { margin: 0; white-space: pre-wrap; word-break: break-all;
        background: var(--vscode-textBlockQuote-background, #0d1117);
        padding: 6px 8px; border-radius: 3px; font-size: 12px; }
  pre.err { color: #f85149; }
</style>
</head>
<body>
<h2>Test Results</h2>
<div class="summary">${passed} / ${total} passed</div>
${cards}
</body>
</html>`;
}
