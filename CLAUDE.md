# CP Sidekick — VS Code Extension

## What this is

A VS Code extension that acts as a competitive programming sidekick for
**Codeforces** and **AtCoder**. Given a problem, it should:

1. Auto-scaffold the environment: a language template + downloaded sample
   test cases, with zero manual setup.
2. Let the user write their solution directly in the editor.
3. Run the solution against the sample tests locally, in one click.
4. Sign in to the platform and submit the solution directly — no tab-switching.

The user only ever writes the actual algorithm code; everything else
(fetching, scaffolding, running, submitting) is handled by the extension.

## Decisions already made (don't re-litigate these without asking)

- **Languages to support:** C++, Python, Java.
- **Test case fetching:** build our own fetcher inside the extension —
  no dependency on the third-party "Competitive Companion" browser
  extension. Fetch problem pages directly (`axios`) and parse sample I/O
  out of the HTML (`cheerio`). Both Codeforces and AtCoder serve problem
  statements as static server-rendered HTML, so a plain HTTP GET is enough
  — no headless browser needed for fetching.
- **Submission:** the extension owns sign-in. User provides platform
  credentials once via a "Sign In" command; the extension authenticates
  with a form POST, then persists only the resulting **session cookie**
  (never the password) in `vscode.SecretStorage` (OS keychain-backed).
  "Submit" replays the site's own submit-form POST using that session —
  fully automatic, no browser tab required.

## Why fetching/submitting need custom scraping (no official API)

Neither platform has a public API for sample test cases or submissions.
Codeforces' API (`codeforces.com/api`) only exposes contest/problem
*metadata* (ratings, tags) — never sample I/O — and has no submit endpoint.
AtCoder has no public API at all. So both fetch and submit have to work by
parsing/replaying the same HTML the browser would use. This is the same
approach real-world prior art uses (`cf-tool`, `atcoder-cli`, the CPH VS
Code extension), so it's a well-trodden path, just brittle by nature —
selectors and form fields will occasionally need updating when the sites
change their markup.

## Architecture

```
src/
  extension.ts            Command registration + UI flows (entry point)
  types.ts                 Shared types: ProblemMeta, TestCase, RunResult, AuthSession...
  core/
    workspaceManager.ts    Scaffolds problem folders; reads/writes tests + problem.json
    runner.ts                Compiles (C++/Java) & runs solution against each test case
    secrets.ts                SecretStorage wrapper — get/set/clear session per platform
  platforms/
    types.ts                  IPlatform interface: fetchProblem / login / submit
    http.ts                    Shared axios instance factory w/ cookie-jar support
                                 (axios-cookiejar-support + tough-cookie)
    codeforces.ts              Codeforces-specific fetch/login/submit
    atcoder.ts                  AtCoder-specific fetch/login/submit
  ui/
    resultsPanel.ts            Webview: pass/fail cards with input/expected/actual + runtime
  templates/
    template.cpp / .py / .java Default solution boilerplate per language
```

### Problem folder layout (scaffolded per problem)

```
<workspaceRoot>/<platform>/<contestId>/<problemId>/
  solution.cpp | solution.py | Main.java
  problem.json                 # ProblemMeta: title, url, time/memory limits, language
  tests/
    1.in  1.out
    2.in  2.out
    ...
```

`problem.json` is how `runTests`/`submitSolution` know which platform,
contest, problem, and time limit apply to whatever file is currently open —
find it by walking up from the active file until a `problem.json` is found.

### Commands to implement

| Command | Behavior |
|---|---|
| `cpSidekick.setupProblem` | QuickPick platform → input problem id/URL → QuickPick language → fetch → scaffold → open solution file |
| `cpSidekick.runTests` | Save active file → compile if needed → run against every test in `tests/` → show results webview |
| `cpSidekick.addTestCase` | Create next numbered `N.in`/`N.out` pair, open both side-by-side for manual editing |
| `cpSidekick.login` | QuickPick platform → handle/username input → password input (masked) → POST login → store session |
| `cpSidekick.logout` | Clear stored session for a platform |
| `cpSidekick.submitSolution` | Confirm (modal) → POST submission using stored session → show result + link to status page |

## Key implementation gotchas (learned from a prior scaffolding pass — reuse this knowledge)

**Codeforces sample parsing:** `.sample-test .input pre` / `.output pre`
wrap each line in its own `<div>` (or use `<br>`) instead of plain
newlines. `cheerio`'s `.text()` alone collapses these onto one line — walk
child nodes manually, treating `<br>` and `<div>` boundaries as `\n`.

**AtCoder sample parsing:** samples live under `#task-statement`, inside
`h3` headers ("Sample Input 1", "Sample Output 1") followed by a `<pre>`
sibling. Pages are often bilingual — prefer the `.lang-en` scoped block if
present, otherwise the whole statement, to avoid picking up Japanese
duplicates.

**Time/memory limits:** Codeforces has dedicated `.time-limit` /
`.memory-limit` elements. AtCoder embeds them in prose near the top
("Time Limit: 2 sec / Memory Limit: 1024 MB") — regex out of the page text.

**CSRF tokens:** both platforms require a `csrf_token` hidden input scraped
from the login/submit page and replayed in the POST body. Codeforces also
expects `ftaa`/`bfaa` anti-bot fields — random alphanumeric strings are
sufficient (mimics what a first-time browser looks like; this is how
`cf-tool` does it too).

**Language IDs for submission are NOT stable** — Codeforces' `programTypeId`
and AtCoder's `LanguageId` (which can even vary *per AtCoder contest*)
change over time. Don't hardcode these — expose them as user-editable
settings with sane current defaults, and document how to look them up
(inspect the `<select>` on the live submit page) so the tool degrades
gracefully instead of silently submitting in the wrong language.

**Java constraint:** both judges want a single public class; template must
be `public class Main` and the file must be named `Main.java` for `javac`
to accept it.

**Local TLE is advisory only:** the dev machine's clock isn't the judge's.
Run with `problem.timeLimitMs + configurable buffer` (default ~1s slack)
and label the result "TLE?" rather than treating it as authoritative.

**Output comparison:** normalize before comparing — strip trailing
whitespace per line and trailing blank lines — to avoid false negatives
from harmless whitespace differences.

**Auth limitations to document, not silently swallow:** accounts with a
CAPTCHA challenge or 2FA cannot be signed in via plain form POST. Fail
loudly with a clear message rather than a confusing generic error. A good
follow-up feature (not required for v1): a "paste session cookie" login
mode as a captcha-proof alternative to password login.

**Never persist the raw password** — only the authenticated cookie jar
(serialized via `tough-cookie`'s `CookieJar.toJSON()`), stored through
`vscode.SecretStorage` (OS keychain-backed), keyed per platform.

## Tech stack

- TypeScript, compiled via `tsc` (target ES2020, commonjs modules)
- `axios` + `axios-cookiejar-support` + `tough-cookie` for HTTP with cookie-jar sessions
- `cheerio` for HTML parsing
- No bundler needed for v1 (small extension) — plain `tsc` output to `out/`
- Template files (`.cpp`/`.py`/`.java`) are plain text assets, not compiled —
  need an explicit copy step from `src/templates/` to `out/templates/` after
  `tsc` runs (they won't be emitted automatically).

## Settings to expose (package.json `contributes.configuration`)

- `cpSidekick.defaultLanguage` — cpp | python | java
- `cpSidekick.workspaceRoot` — subfolder problems scaffold into (default `cp`)
- `cpSidekick.cpp.compiler` / `cpSidekick.cpp.flags`
- `cpSidekick.python.executable`
- `cpSidekick.java.executable`
- `cpSidekick.timeLimitBufferMs`
- `cpSidekick.codeforces.languageId` — object mapping language → CF programTypeId
- `cpSidekick.atcoder.languageId` — object mapping language → AtCoder LanguageId

## Explicit non-goals for v1

- No Competitive Companion integration (superseded by our own fetcher).
- No gym / private / mashup contest support (public problem pages only).
- No captcha/2FA bypass of any kind.
- No verdict polling after submit (just confirm the POST succeeded and link
  to the status page) — could be a v2 feature.

## Suggested build order

1. `types.ts` + `core/workspaceManager.ts` (folder scaffolding logic) — testable without network.
2. `platforms/http.ts` + `platforms/codeforces.ts` fetchProblem — verify against a couple of real problem URLs.
3. `platforms/atcoder.ts` fetchProblem — same.
4. `core/runner.ts` — compile/run/compare, test locally against a hand-made problem folder for each language.
5. `extension.ts` wiring for setupProblem + runTests + addTestCase; get this loop solid before touching auth.
6. `core/secrets.ts` + login for both platforms — test against real accounts (use a throwaway/test account first).
7. `submit` for both platforms — test on old/practice problems, never during a live rated contest until trusted.
8. `ui/resultsPanel.ts` webview polish.