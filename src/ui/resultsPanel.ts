import * as vscode from 'vscode';
import type { RunResult } from '../types';

let panel: vscode.WebviewPanel | undefined;

export function showResults(results: RunResult[], title: string): void {
  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      'cpSidekickResults',
      'CP Sidekick: Results',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
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
  const counts = { pass: 0, fail: 0, tle: 0, error: 0 };
  for (const r of results) { counts[r.status as keyof typeof counts]++; }
  const total = results.length;
  const allPass = counts.pass === total;

  const summaryColor = allPass ? '#2ea043' : '#f85149';
  const summaryParts = [`${counts.pass} / ${total} passed`];
  if (counts.fail)  { summaryParts.push(`${counts.fail} failed`); }
  if (counts.tle)   { summaryParts.push(`${counts.tle} TLE`); }
  if (counts.error) { summaryParts.push(`${counts.error} error`); }
  const summaryText = summaryParts.join(' · ');

  const cards = results.map((r, i) => {
    const color   = statusColor(r.status);
    const label   = statusLabel(r.status);
    const isPass  = r.status === 'pass';
    // Pass cards are collapsible (collapsed by default); fail/tle/error always open
    const bodyId  = `body-${i}`;
    const arrowId = `arrow-${i}`;

    const inputSection   = `<div class="section"><div class="label">Input</div><pre>${esc(r.testCase.input)}</pre></div>`;
    const expectedSection = `<div class="section"><div class="label">Expected</div><pre>${esc(r.testCase.expected)}</pre></div>`;
    const actualSection  = `<div class="section"><div class="label">${isPass ? 'Output' : 'Got'}</div><pre>${esc(r.actual || '(no output)')}</pre></div>`;
    const stderrSection  = r.stderr
      ? `<div class="section"><div class="label">Stderr</div><pre class="err">${esc(r.stderr)}</pre></div>`
      : '';

    const bodyContent = isPass
      ? `${inputSection}${actualSection}`
      : `${inputSection}${expectedSection}${actualSection}${stderrSection}`;

    const toggle = isPass
      ? `onclick="toggle('${bodyId}','${arrowId}')" style="cursor:pointer"`
      : '';
    const arrow = isPass
      ? `<span id="${arrowId}" class="arrow">▶</span>`
      : '';
    const bodyStyle = isPass ? 'display:none' : '';

    return `
      <div class="card" style="border-left: 4px solid ${color}">
        <div class="card-header" ${toggle}>
          <span class="badge" style="color:${color}">${label}</span>
          <span class="tc-title">Test ${r.testCase.index}</span>
          <span class="runtime">${r.runtimeMs} ms</span>
          ${arrow}
        </div>
        <div id="${bodyId}" style="${bodyStyle}">
          ${bodyContent}
        </div>
      </div>`;
  }).join('');

  const emptyState = results.length === 0
    ? `<div class="empty">No test cases found. Use <strong>CP: Add Test Case</strong> to add one.</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  body     { font-family: var(--vscode-editor-font-family, monospace); font-size: 13px;
             background: var(--vscode-editor-background); color: var(--vscode-editor-foreground);
             margin: 0; padding: 16px; }
  h2       { margin: 0 0 4px; font-size: 15px; }
  .summary { font-size: 13px; font-weight: 600; color: ${summaryColor}; margin-bottom: 16px; }
  .card    { background: var(--vscode-editorWidget-background, #1e1e1e);
             border-radius: 4px; margin-bottom: 10px; overflow: hidden; }
  .card-header { display: flex; align-items: center; gap: 10px; padding: 8px 12px;
                 background: var(--vscode-editorGroupHeader-tabsBackground, #252526); }
  .card-header:hover { filter: brightness(1.08); }
  .badge   { font-weight: 700; min-width: 62px; }
  .tc-title { flex: 1; }
  .runtime { font-size: 11px; color: var(--vscode-descriptionForeground, #8b949e); }
  .arrow   { font-size: 10px; color: var(--vscode-descriptionForeground, #8b949e); transition: transform 0.15s; }
  .arrow.open { transform: rotate(90deg); }
  .section { padding: 6px 12px; }
  .label   { font-size: 11px; color: var(--vscode-descriptionForeground, #8b949e);
             text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  pre      { margin: 0; white-space: pre; overflow-x: auto;
             background: var(--vscode-textBlockQuote-background, #0d1117);
             padding: 6px 8px; border-radius: 3px; font-size: 12px; }
  pre.err  { color: #f85149; }
  .empty   { color: var(--vscode-descriptionForeground, #8b949e); font-style: italic; margin-top: 8px; }
</style>
</head>
<body>
<h2>Test Results</h2>
<div class="summary">${summaryText}</div>
${emptyState}
${cards}
<script>
  function toggle(bodyId, arrowId) {
    const body  = document.getElementById(bodyId);
    const arrow = document.getElementById(arrowId);
    const open  = body.style.display === 'none';
    body.style.display  = open ? '' : 'none';
    arrow.className = open ? 'arrow open' : 'arrow';
  }
</script>
</body>
</html>`;
}
