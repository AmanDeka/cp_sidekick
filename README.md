# CP Sidekick

A VS Code extension for competitive programmers. Given a problem URL, it fetches sample test cases, scaffolds your solution file, runs your code locally, and submits — without leaving the editor.

Supports **Codeforces** and **AtCoder**. Solutions in **C++**, **Python**, or **Java**.

---

## Features

| Command | What it does |
|---|---|
| **CP: Setup Problem** | Fetches a problem by URL, scaffolds a solution file + sample test cases |
| **CP: Run Tests** | Compiles (if needed) and runs your solution against all sample tests |
| **CP: Add Test Case** | Creates a new numbered test case and opens it for editing |
| **CP: Sign In** | Authenticates with a platform and stores your session securely |
| **CP: Sign Out** | Clears the stored session for a platform |
| **CP: Submit Solution** | Submits your current solution directly to the platform |

---

## How it works

1. Run **CP: Setup Problem** and paste a problem URL
2. Pick your language — a template is opened ready to edit
3. Write your solution
4. Run **CP: Run Tests** to see pass/fail results inline
5. Run **CP: Submit Solution** to submit (sign in once first)

---

## Problem folder layout

Problems are scaffolded under `cp/` in your workspace (configurable):

```
cp/
  codeforces/
    1/A/
      solution.cpp
      problem.json
      tests/
        1.in  1.out
        2.in  2.out
  atcoder/
    abc388/a/
      solution.py
      problem.json
      tests/
        1.in  1.out
```

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `cpSidekick.defaultLanguage` | `cpp` | Default language for new problems (`cpp`, `python`, `java`) |
| `cpSidekick.workspaceRoot` | `cp` | Subfolder problems are scaffolded into |
| `cpSidekick.cpp.compiler` | `g++` | C++ compiler executable |
| `cpSidekick.cpp.flags` | `["-std=c++17", "-O2", "-Wall"]` | Compiler flags (exclude `-o`) |
| `cpSidekick.python.executable` | `python3` | Python interpreter |
| `cpSidekick.java.compiler` | `javac` | Java compiler executable |
| `cpSidekick.java.runtime` | `java` | Java runtime executable |
| `cpSidekick.timeLimitBufferMs` | `1000` | Extra ms added to time limit before a local TLE is flagged |
| `cpSidekick.codeforces.languageId` | see below | Codeforces `programTypeId` per language |
| `cpSidekick.atcoder.languageId` | see below | AtCoder `LanguageId` per language |

### Language IDs

Codeforces and AtCoder use numeric IDs to identify languages on submission. The defaults may go stale when platforms update — if a submission lands in the wrong language, inspect the `<select>` on the live submit page and update the setting.

Default Codeforces IDs: `{ "cpp": "91", "python": "70", "java": "87" }`  
Default AtCoder IDs: `{ "cpp": "5001", "python": "5055", "java": "5005" }`

---

## Limitations

- Accounts with CAPTCHA or 2FA cannot sign in via this extension — a clear error will tell you if this is the case.
- No verdict polling after submit — the extension confirms the submission was accepted by the server and links you to the status page.
- Public contest problems only (no gym, private, or mashup contests).

---

## Requirements

- **C++**: `g++` on PATH
- **Python**: `python` (or `python3`) on PATH
- **Java**: `javac` and `java` on PATH
