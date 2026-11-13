# Advanced Paisley IDE

A second, more powerful coding environment in Paisley Tech Studio, beside Paisley Code Lab ("Paisley VS Code", `js/tech/code-lab.js`). Code Lab stays the guided HTML/CSS/JS editor for lessons, homework, groups and projects. The Advanced IDE is for builders who want Python, Java, C, C++, PHP and the web in one professional workspace.

Page: `/tech/ide` (`tech/ide.html`). Code: `js/tech/advanced-ide/`.

| File | What it does |
|---|---|
| `ide-entry.js` | The "Advanced Paisley IDE" button and the first half of the entrance (Tech Studio side) |
| `ide-app.js` | The welcome sequence, sign-in, the launcher and the whole workspace |
| `ide-langs.js` | One table per language: extension, icon, Monaco mode, runner, help level, starters, beginner hints, error explanations |
| `ide-intellisense.js` | Monaco providers: Jedi for Python, Paisley suggestions for Java/C/C++/PHP, live checks |
| `ide-runner.js` | Execution providers, the sandbox iframe, cached runtime downloads, the Java remote call |
| `runner-worker.js` | Runs inside the sandbox: Pyodide, Clang + WASI, php-wasm |
| `ide.css` | Workspace styles (Paisley palette on deep charcoal; Quicksand UI, JetBrains Mono code) |
| `functions/code-runner.js` | `runCode` callable: forwards Java (and fallback) runs to an isolated execution service |

## Who can use it (Admin > Tech Studio > Controls)

The IDE is **off for everyone** until the Studio Desk switches it on in Admin > Tech Studio > Controls (`js/admin/tech-controls.js`). Its settings live in `techSettings/advancedIde`:

```
{ enabled, levels: ['beginner' | 'intermediate' | 'expert'], students: [uid], updatedAt, updatedBy, updatedByName }
```

A builder has it when it is **enabled** and either **their level is ticked** or **they were picked by name**. A builder with no level counts as Intermediate, as everywhere else in Tech Studio. The picker lists every active builder, tagged "Admitted from Paisley" (`admittedFrom`) or "Applied". It can filter, pick everyone shown, and shows how many builders will have access before you save.

The same test runs in four places, so hiding the button is never the only lock:
- the builder portal (`ideOn()` in `tech/dashboard.html`, which follows the setting live);
- `/tech/ide`, which refuses to open without access, and locks to read only if access is switched off while a builder is working (unsaved changes stay in the browser and are offered back later);
- `firestore.rules` (`advancedIdeAllowed()`: creating or saving a `type: 'advanced'` practice doc, or turning another practice into one);
- `runCode`.

Coaches and admins can always open a builder's project read only, to review it.

## Where builders find it (only with access)

- Practice > Start practising: an "Advanced Paisley IDE" practice tool beside Coding experiment, Writing, Research and AI.
- Home, under Practise or create: an Advanced Paisley IDE card.
- Inside Code Lab, only on Practice coding experiments: an "Advanced IDE" button in the toolbar. It offers to bring that practice's files into a new Advanced project. The files are copied; the practice itself is never changed.
- My practice lists Advanced projects ("Advanced IDE · Python"). Opening one goes straight to it with a short fade; the fireworks are for entering from the button. Without access they show as locked, with an explanation.

## The entrance

1. On Tech Studio (`PaisleyIDEEntry.launch`), the page dims and blurs behind a veil, and a short burst of Paisley confetti rises from the button. Then the veil deepens to charcoal (about 1.2 s).
2. `/tech/ide` paints its dark welcome straight from HTML, so there is no white flash: subtle fireworks, "WELCOME TO THE ADVANCED PAISLEY IDE", "Your ideas. Your code. Your next big creation starts here." Under it, a progress line shows the real steps (signing in, opening the project, loading the editor). It plays for at least 2.7 s, can be skipped (button, Enter, Space or Esc), and reveals the workspace with a blur-to-sharp crossfade.
3. With `prefers-reduced-motion` both halves are plain fades with no particles. Reopening a project, or reloading, shows a short version.

## Languages, help and running

| Language | Editor help | Runs with | Where |
|---|---|---|---|
| Python `.py` | **Full IntelliSense**: Jedi (completions, parameter hints, hover docs, imports across files) and parso syntax checks | Pyodide 314.0.7 (Python 3), `input()`, packages Pyodide ships (numpy and friends load on import) | browser sandbox |
| C `.c` `.h` | Paisley suggestions + live Clang checks | YoWASP Clang/LLD 22 → wasm32-wasi, run with browser_wasi_shim | browser sandbox |
| C++ `.cpp` `.cc` `.cxx` `.hpp` | Paisley suggestions + live Clang checks | same, `-std=c++17 -fno-exceptions` | browser sandbox |
| PHP `.php` | Paisley suggestions + live PHP parser checks | php-wasm 0.2.0 (PHP 8.4) | browser sandbox |
| Java `.java` | Paisley suggestions; errors on run | `runCode` → Judge0-compatible service | isolated server sandbox (needs configuring) |
| JavaScript `.js` | **Full IntelliSense** (Monaco's TypeScript service) | sandboxed page; `console.log` goes to the terminal | browser |
| HTML / CSS | **Full IntelliSense** (Monaco's HTML/CSS services) + tag snippets | live preview (`CodeLab.buildPreview`, the same engine as Code Lab) | browser |

"Paisley suggestions" are hand-built: keywords, snippets, the common standard library with signatures and docs (C stdio/stdlib/string/math/ctype; C++ iostream/string/vector/map/set/algorithm; Java String/Scanner/ArrayList/HashMap/Math/…; about 150 PHP functions), members after `.` `->` `::` for known types and for the builder's own classes/structs, functions and fields from every file in the project, parameter hints and hover docs. The IDE labels this help as "Paisley suggestions" and never calls it IntelliSense. The Language tools panel explains the difference.

Unknown extensions open as plain text, never as HTML. A `.h` header is C++ in a C++ project.

Editor: Monaco 0.52.2 (jsDelivr, lazy). Bracket and quote completion, auto-indent, folding, line numbers, find/replace (Ctrl+F / Ctrl+H), multi-cursor, sticky scroll, bracket colouring, formatting for HTML/CSS/JS/JSON (Shift+Alt+F; other languages say plainly that formatting is not available), Paisley dark and light themes.

### Interactive input

`/tech/ide` is served with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` (`firebase.json` and `vercel.json` headers). That makes the page cross-origin isolated, so a running program can pause on a SharedArrayBuffer until the builder types a line in the terminal. This works for Python `input()`, C `scanf`/`fgets`, C++ `cin`/`getline` and PHP `readline`/`fgets(STDIN)`. Lines in the Input tab are read first; End input (Ctrl+D) sends end-of-file.

Where the browser cannot isolate the page (Safari does not support `credentialless`), programs read only from the Input tab, and the IDE says so. Java always reads from the Input tab (it runs remotely).

COEP side effect: a builder's web page in the preview cannot embed third-party iframes that do not opt in (for example a YouTube embed). Code Lab, which is not isolated, still can.

## Security

- **Student code never runs on the Paisley origin or on a Paisley server.** Python, C, C++ and PHP run in Web Workers started inside an iframe with `sandbox="allow-scripts"`, which has an opaque origin: no cookies, no IndexedDB, no Firebase session, no access to the page. This matters when a coach or admin opens a builder's project and runs it. The workers are module workers started from a `data:` URL, because a `blob:` module worker cannot start from an opaque origin and Pyodide refuses classic workers.
- The web preview is the same sandboxed iframe Code Lab uses.
- Java goes to `runCode`, which checks the caller (active builder, active coach or admin), validates file names (nothing can climb out of the project), limits size (40 files, 256 KB of source, 64 KB of input) and rate (15 runs a minute, 300 a day per person, `codeRunUsage/{uid}`), then forwards to the execution service. The function itself never executes anything. The service URL and key live only on the server.
- Runtime downloads go through the page (`fetchRuntime`), which fetches only the pinned runtime URLs, keeps them in Cache Storage (`paisley-ide-runtimes-v1`) and reports real progress. The first Python run downloads about 12 MB, C/C++ about 18 MB, PHP about 5 MB; later visits open them from the cache.

## Projects and permissions

Advanced projects are `techPractice` docs with `type: 'advanced'`:

```
codeFiles   [{ name, lang, content }]   lang: html css js json md txt py java c cpp php
codeFolders ['src', ...]
codeActive  'main.py'
ide         { v: 1, lang, entry, open: [names], template }
```

Plus the usual practice fields (`studentId`, `studentName`, `coachId`, `title`, `done`, `helpRequested`, `coachNote`, …). No rules change was needed. The builder owns and edits them; their coach and admins read them and can leave a note; guardians cannot open them. Coaches and admins see them in their Practice views with "Open in the Advanced IDE", which opens read only (they can run the code). Limits: 60 files, 200 KB a file, 900 KB a project.

Saving: automatic 1.5 s after typing stops (Ctrl+S any time). Each change is also kept in `localStorage` until the save lands. If a save fails (offline), the IDE retries, and on the next open it offers to restore the newer copy. The first save in a session logs `practice_saved` in `techActivity`.

## The workspace

Title bar: project name (rename), language, save state, the run file, Run / Stop, split, preview (web), panel, full screen, back to Tech Studio. Activity bar: Explorer, Search (all files, case, regex, replace all), Language tools (help level, how each language runs, runtime status, download now), Keyboard shortcuts, Settings (theme, font size, tab size, word wrap, minimap, autosave, live input, prepare the language on open; kept per browser). Editor: tabs, split editor, welcome when nothing is open. Panel: Terminal (output, errors in red, input you typed in teal, a plain-English explanation with "Go to line" under each error), Problems (live checks plus run errors), Input. Preview (web projects): live refresh as you type, full / tablet / phone width. Status bar: download progress, help level, problems, cursor, input mode.

How things behave together:
- Run always brings up the terminal. Web projects open the preview beside the editor.
- When a program asks for input, the input box appears and takes focus.
- Errors leave a marker on the line and an entry in Problems.
- Double-clicking the tabs maximises the editor; doing it again brings the panels back.
- Full screen uses the browser's full-screen mode, and F11 toggles it inside the IDE.
- Confirmations and names use the IDE's own dialogs, never `prompt`/`confirm`, which would drop the browser out of full screen.

Shortcuts: F5 / Ctrl+Enter Run · Shift+F5 Stop · Ctrl+S Save · Ctrl+P open a file · Ctrl+Shift+F search · Ctrl+B side bar · Ctrl+J panel · Ctrl+\ split · Alt+N new file · F11 full screen · F1 every editor command.

Below 900 px the side bar becomes an overlay. Below 640 px the preview takes the editor's place, toggled with the Preview button.

## Configuring Java (not done yet)

Java needs an isolated execution service compatible with the [Judge0 CE](https://github.com/judge0/judge0) API (`POST /submissions?base64_encoded=true&wait=true`). Until one is configured, Run on a Java project says so plainly, and nothing is faked. Either:

- self-host Judge0 CE (Docker, on its own VM, never on Paisley infrastructure) and use its URL with an `X-Auth-Token`, or
- use a hosted Judge0 CE (for example through RapidAPI: `keyHeader` `X-RapidAPI-Key`, `host` `judge0-ce.p.rapidapi.com`).

Then set **one** of:

- `functions/.env` (or a Secret Manager secret exposed as an environment variable): `CODE_RUNNER_URL`, `CODE_RUNNER_KEY`, optional `CODE_RUNNER_KEY_HEADER` (default `X-Auth-Token`), `CODE_RUNNER_HOST`, then redeploy `runCode`;
- or Firestore `serverConfig/codeRunner` in the Firebase console: `{ url, key, keyHeader, host, enabled: true }`. The rules close `serverConfig` to every client, admins included.

Single-file `Main.java` programs use Judge0's Java (id 62). Several files, packages or another main class use the multi-file program (id 89) with `javac -d out …` and `java -cp out <MainClass>`. The JDK paths default to Judge0 CE's image (`/usr/local/openjdk13/bin`); override them with `serverConfig/codeRunner.commands.java = { compile, run }` if your image differs. The function also accepts `python`, `c`, `cpp` and `php`, so a runner could later serve as a fallback for those. This integration is unit-tested against the Judge0 API shape (`functions/test/code-runner.test.js`) but has **not** been run against a live Judge0 service.

## When a runtime breaks

Mistakes in a builder's code come back as ordinary results: tracebacks, compiler errors, exit codes. A JavaScript-level throw while running means the runtime itself broke. When that happens:
1. The worker posts `restart: true`.
2. The page throws that worker away (`reset(role)` in `ide-runner.js`).
3. The next Run starts a fresh worker, loading the runtime again from Cache Storage. A broken Pyodide ("Pyodide already fatally failed") is never reused.
4. If the tools worker is replaced, Jedi loads again automatically.

The terminal says what happened, with a Run again button.

This is what used to happen with **pygame**: `pygame.init()` read the page's `screen`, which a worker does not have, and killed Pyodide for the rest of the session. The worker now provides a `screen`, so pygame imports and initialises. `pygame.display.set_mode` still cannot open a window from a worker, so the IDE explains that and restarts Python. `turtle` and `tkinter` do not exist in the browser and get their own explanation; matplotlib works.

The service worker (`sw.js`) leaves `/tech/ide` and `js/tech/advanced-ide/` alone, so the page keeps its COOP/COEP headers. It also answers offline misses with a plain network error, never an uncaught "Failed to fetch".

## Known limits

- Pygame windows (`set_mode`), turtle and tkinter do not work in the browser.
- C++ exceptions (`try`/`throw`) are off in the browser compiler; the IDE explains this when they are used.
- Python packages are the ones Pyodide ships; anything else fails with ModuleNotFoundError and a hint.
- PHP runs as a script (CLI-style). Output that is HTML can be opened as a page; there is no web server, forms or sessions.
- Live checks for C/C++ and PHP start once their runtime has downloaded (it downloads automatically when a project in that language opens, unless switched off in Settings).
- Uploading pictures or other binary files into an Advanced project is not supported yet (Code Lab's uploads are).
- Formatting is available for HTML, CSS, JavaScript and JSON only.

## Tested

- `functions/test/code-runner.test.js` (12): who may run, "not configured" with no call made, Judge0 request shape and key header, multi-file Java zip and main class, compile diagnostics, limits, rate limiting, path safety, the zip format.
- `tests/rules/tech.rules.test.js`: Advanced projects (builder owns; coach and admin read and note only; guardians and other builders cannot open) and `serverConfig` / `codeRunUsage` closed to everyone.
- In headless Edge against the real page scripts (with an in-memory store instead of Firestore):
  - the welcome sequence;
  - Python with typed input, an error explanation and marker, and Jedi completions;
  - C (multi-file with a header, `scanf`, reading a project file);
  - C++ (classes and headers, `getline`);
  - PHP (`readline`, `require`, fatal errors with file and line);
  - JavaScript console programs and the HTML preview;
  - Java against a stand-in for `runCode` (not configured, success, compile error);
  - Paisley suggestions and parameter hints for Java, C, C++ and PHP, including the builder's own classes;
  - live Clang and PHP checks;
  - creating a project from the launcher, new files and folders, autosave;
  - the read-only coach view;
  - phone, tablet and laptop layouts with no sideways scrolling.
- The Code Lab toolbar button and the Tech Studio entrance, on a page using the entry module.
