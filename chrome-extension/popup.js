const PORT = 27121;

const btn = document.getElementById('btn');
const status = document.getElementById('status');

function setStatus(msg, type) {
  status.textContent = msg;
  status.className = type || '';
}

btn.addEventListener('click', async () => {
  btn.disabled = true;
  setStatus('Sending to VS Code…');

  let url;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    url = tab.url;
  } catch (err) {
    setStatus('Could not read tab URL.', 'error');
    btn.disabled = false;
    return;
  }

  if (!url || !url.includes('codeforces.com')) {
    setStatus('Not a Codeforces problem page.', 'error');
    btn.disabled = false;
    return;
  }

  try {
    const res = await fetch(`http://127.0.0.1:${PORT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (res.ok) {
      setStatus(`Done! ${data.title ?? ''}`, 'ok');
    } else {
      setStatus(data.error ?? 'VS Code returned an error.', 'error');
    }
  } catch {
    setStatus('VS Code not reachable. Is it open?', 'error');
  }

  btn.disabled = false;
});
