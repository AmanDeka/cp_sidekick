const PORT = 27121;

// chrome.storage.session persists across service worker restarts (unlike module-level vars).
async function getLoginTabs() {
    const { loginTabs = [] } = await chrome.storage.session.get('loginTabs');
    return new Set(loginTabs);
}

async function saveLoginTabs(set) {
    await chrome.storage.session.set({ loginTabs: [...set] });
}

// When a CF tab visits the login page, mark it so we can detect when login completes.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!tab.url?.includes('codeforces.com')) { return; }

    if (tab.url.includes('/enter')) {
        const tabs = await getLoginTabs();
        tabs.add(tabId);
        await saveLoginTabs(tabs);
        return;
    }

    // Tab navigated away from /enter — check if login just completed.
    if (changeInfo.status !== 'complete') { return; }
    const tabs = await getLoginTabs();
    if (!tabs.has(tabId)) { return; }

    tabs.delete(tabId);
    await saveLoginTabs(tabs);

    // Check if the user is now logged in.
    let handle = null;
    try {
        const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => document.querySelector('a[href^="/profile/"]')?.textContent?.trim() ?? null,
        });
        handle = result?.result;
    } catch {
        return;
    }

    if (!handle) { return; }

    // Send session to VS Code and show a badge on success.
    try {
        const cookies = await chrome.cookies.getAll({ domain: 'codeforces.com' });
        const res = await fetch(`http://127.0.0.1:${PORT}/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform: 'codeforces', cookies }),
        });
        if (res.ok) {
            chrome.action.setBadgeText({ text: 'OK' });
            chrome.action.setBadgeBackgroundColor({ color: '#2ea043' });
            setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
        }
    } catch {
        // VS Code not running — silently ignore; user can open the popup to retry.
    }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
    const tabs = await getLoginTabs();
    if (tabs.has(tabId)) {
        tabs.delete(tabId);
        await saveLoginTabs(tabs);
    }
});
