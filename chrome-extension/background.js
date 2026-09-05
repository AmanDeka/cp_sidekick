const PORT = 27121;

// loginTabs: maps tabId (string) -> platform ('codeforces' | 'atcoder')
// Stored in chrome.storage.session so it survives service worker restarts.

async function getLoginTabs() {
    const { loginTabs = {} } = await chrome.storage.session.get('loginTabs');
    return loginTabs;
}

async function saveLoginTabs(map) {
    await chrome.storage.session.set({ loginTabs: map });
}

function isLoginUrl(url, platform) {
    if (platform === 'codeforces') { return url.includes('codeforces.com/enter'); }
    if (platform === 'atcoder')    { return url.includes('atcoder.jp/login'); }
    return false;
}

function detectPlatform(url) {
    if (url.includes('codeforces.com')) { return 'codeforces'; }
    if (url.includes('atcoder.jp'))     { return 'atcoder'; }
    return null;
}

// Extracts the logged-in handle from the page (runs in page context).
function getCodeforcesHandle() {
    return document.querySelector('a[href^="/profile/"]')?.textContent?.trim() ?? null;
}

function getAtCoderHandle() {
    return document.querySelector('a[href^="/users/"]')?.textContent?.trim() ?? null;
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    const url = tab.url;
    if (!url) { return; }

    const platform = detectPlatform(url);
    if (!platform) { return; }

    // Mark tabs that land on the login page.
    if (isLoginUrl(url, platform)) {
        const tabs = await getLoginTabs();
        tabs[String(tabId)] = platform;
        await saveLoginTabs(tabs);
        return;
    }

    // Only act when a full navigation completes.
    if (changeInfo.status !== 'complete') { return; }

    const tabs = await getLoginTabs();
    const trackedPlatform = tabs[String(tabId)];
    if (!trackedPlatform) { return; }

    // Tab navigated away from login — check if they're now signed in.
    delete tabs[String(tabId)];
    await saveLoginTabs(tabs);

    let handle = null;
    try {
        const handleFunc = trackedPlatform === 'atcoder' ? getAtCoderHandle : getCodeforcesHandle;
        const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            func: handleFunc,
        });
        handle = result?.result;
    } catch {
        return;
    }

    if (!handle) { return; }

    // Send the session cookies to VS Code.
    try {
        const cookieDomain = trackedPlatform === 'atcoder' ? 'atcoder.jp' : 'codeforces.com';
        const cookies = await chrome.cookies.getAll({ domain: cookieDomain });
        const res = await fetch(`http://127.0.0.1:${PORT}/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform: trackedPlatform, cookies }),
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
    if (tabs[String(tabId)]) {
        delete tabs[String(tabId)];
        await saveLoginTabs(tabs);
    }
});
