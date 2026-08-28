const PORT = 27121;

const btn    = document.getElementById('btn');
const status = document.getElementById('status');

function setStatus(msg, type) {
    status.textContent = msg;
    status.className = type || '';
}

// Runs inside the problem page's JS context — no imports, plain DOM.
function parseProblemPage() {
    function extractPreText(pre) {
        let result = '';
        for (const node of pre.childNodes) {
            if (node.nodeType === 3 /* TEXT_NODE */) {
                result += node.textContent;
            } else if (node.nodeType === 1 /* ELEMENT_NODE */) {
                if (node.tagName === 'BR') {
                    result += '\n';
                } else if (node.tagName === 'DIV') {
                    const inner = node.textContent;
                    result += (result.length > 0 && !result.endsWith('\n') ? '\n' : '') + inner;
                } else {
                    result += node.textContent;
                }
            }
        }
        return result.trim();
    }

    const url = window.location.href;
    const contestMatch    = url.match(/\/contest\/(\d+)\/problem\/([^/?#]+)/i);
    const problemsetMatch = url.match(/\/problemset\/problem\/(\d+)\/([^/?#]+)/i);
    const m = contestMatch || problemsetMatch;
    if (!m) { return null; }

    const contestId = m[1];
    const problemId = m[2].toUpperCase();

    const titleEl = document.querySelector('.title');
    const title = titleEl
        ? titleEl.textContent.trim().replace(/^[A-Z]\.\s*/, '')
        : `${contestId}${problemId}`;

    const timeLimitText = document.querySelector('.time-limit')?.textContent ?? '';
    const memLimitText  = document.querySelector('.memory-limit')?.textContent ?? '';

    const tlMatch = timeLimitText.match(/([\d.]+)\s*second/i);
    const timeLimitMs = tlMatch ? Math.round(parseFloat(tlMatch[1]) * 1000) : 2000;

    const mlMatch = memLimitText.match(/(\d+)\s*megabyte/i);
    const memoryLimitMb = mlMatch ? parseInt(mlMatch[1], 10) : 256;

    const testCases = [];
    const inputEls  = document.querySelectorAll('.sample-test .input');
    const outputEls = document.querySelectorAll('.sample-test .output');

    inputEls.forEach((inputEl, i) => {
        const pre = inputEl.querySelector('pre');
        if (!pre) { return; }
        const input    = extractPreText(pre);
        const outPre   = outputEls[i]?.querySelector('pre');
        const expected = outPre ? extractPreText(outPre) : '';
        testCases.push({ index: i + 1, input, expected });
    });

    return { platform: 'codeforces', contestId, problemId, title, url, timeLimitMs, memoryLimitMb, testCases };
}

btn.addEventListener('click', async () => {
    btn.disabled = true;
    setStatus('Parsing problem…');

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab.url || !tab.url.includes('codeforces.com')) {
            setStatus('Not a Codeforces page.', 'error');
            btn.disabled = false;
            return;
        }

        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: parseProblemPage,
        });

        const problem = results[0]?.result;
        if (!problem) {
            setStatus('Could not parse page — are you on a problem page?', 'error');
            btn.disabled = false;
            return;
        }

        // Include cookies so VS Code can refresh the session in the same request.
        const cookies = await chrome.cookies.getAll({ domain: 'codeforces.com' });
        if (cookies.length > 0) {
            problem.cookies = cookies;
        }

        setStatus('Sending to VS Code…');
        const res  = await fetch(`http://127.0.0.1:${PORT}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(problem),
        });
        const data = await res.json();

        if (res.ok) {
            setStatus(`Done! ${data.title ?? ''}`, 'ok');
        } else {
            setStatus(data.error ?? 'VS Code returned an error.', 'error');
        }
    } catch {
        setStatus('VS Code not reachable. Is it open with a workspace?', 'error');
    }

    btn.disabled = false;
});
