<!-- project-map: commit=d5aefa5 updated=2026-10-31 -->
## Project map

### Overview
Study Timer (v0.2.0, package `study-timer`) is a pomodoro-style Windows desktop app. You pick a total time, breaks included, and it splits that time into focus, short-break and long-break blocks. It also has a "No breaks" option, a session task list, subjects, stats, streaks, levels (with an all-levels popup), achievements, shareable stats cards, a planner for exams and projects, a floating mini timer and full screen. Stack: Electron ^45 and plain JS, with no framework, bundler or TypeScript. Dev deps are vitest, jsdom and electron-builder. Scripts: `npm start` (`electron .`), `npm test` (`vitest run`), `npm run dist` (NSIS installer `dist/Study-Timer-Setup-${version}.exe`).

### Layout
| Path | Purpose |
| --- | --- |
| `main.js` | Main process: windows, IPC, clipboard and save dialog, Windows taskbar and notification quirks |
| `preload.js` | `contextBridge` exposes `window.desktop` |
| `src/index.html` | Main window markup. Screens: setup, session, done, stats, settings, planner. Dialogs: `confirmDialog`, `planDialog`, `levelsDialog` |
| `src/app.js` (~2130 lines) | The whole renderer app as one global script (not a module). Navigate by its `// ----------` section banners |
| `src/styles.css` | Styles, dark mode, `--subj-N` colour variables |
| `src/mini.html`, `src/mini.js` | Floating mini timer window |
| `tests/` | `planning`, `session`, `stats`, `planner` `.test.js`, plus the jsdom harness `helpers/loadApp.js` |
| `tools/` | `make-shortcut.ps1`/`.js` (Desktop and Start Menu `.lnk` files), `make-icon.ps1` (draws `assets/icon.*`) |

### Entry points and flow
- `app.whenReady` (main.js:229) runs `blockElectronShortcut()` and then `createWindow()` (main.js:20). The window uses `contextIsolation`, `preload.js` and `backgroundThrottling: false`, and loads `src/index.html`.
- `app.js` boot (~line 2099) runs `initSetup/Subjects/Session/Stats/Planner/Share/Settings/Sound`. If a session is saved, it calls `freezeStaleSession()` (~2119) and then `runSession()`.
- Timer: a 250 ms interval calls `tick()` (~411), which calls `publishTimer()` (~491). That sends `window.desktop.updateTimer(snapshot)` only when the snapshot changed. Main forwards it to the mini window as `'timer'`.
- IPC (preload name -> channel):
  - `updateTimer` -> `timer:update`. Sending `null` closes the mini window and exits full screen.
  - `toggleMini` -> `mini:toggle`.
  - `sendCommand` -> `mini:command`. `open` and `close` are handled in main. Others (`pause`, `skip`) are relayed to the app as `'command'`, which reaches the `window.desktop.onCommand` handler (app.js:~591).
  - `answerClose` -> `close:answer`.
  - `toggleFullScreen` -> `fullscreen:toggle`, `exitFullScreen` -> `fullscreen:exit`. Main replies with `'fullscreen'`.
  - `openDndSettings` -> `dnd:open`.
  - `copyImage` -> `share:copy-image`, `copyText` -> `share:copy-text`, `saveImage` -> `share:save-image` (invoke, returns a bool).
- Mini window: `openMini` (main.js:79) creates a frameless, always-on-top 280x112 window. During a session it opens automatically on main-window blur or minimize, and closes on focus or restore (`miniAuto`).

### Key modules (src/app.js)
- `load`/`save`: lines 6-44. `buildPlan` (pure; `noBreaks` gives one focus block): ~49. Subjects: ~186. Tasks: ~285.
- Session: `show` (~358), `startSession`, `tick`, `togglePause`, `skipBlock`, `finishSession`, `askConfirm`, `confirmClose` (~670).
- Shared helpers next to `askConfirm`: `closeOnBackdropClick(dlg)` (outside click closes a popup) and `escapeHtml` (use it for user text put in `innerHTML`).
- Sound: `CHIMES` (~694), `announce`.
- Stats (~824): `dayKey`, `streaks`, `levelInfo`, `levelTable` (pure, rows of the all-levels popup), `renderStats/Bars/Heatmap`, `renderLevels`/`openLevels`.
- Achievements: `ACHIEVEMENTS` (~1167), `checkAchievements`.
- Share cards: `shareData`, `drawShareCard` (canvas to PNG data URL), `shareText`.
- Planner (~1610): pure helpers `monthGrid`, `activePlans`, `defaultPlan`, `currentPlanId`, `planStudiedOn`/`planStudied`, `planPlanned`, `setPlanned`, `copyDayToNext`, `autoFillPlan`, `removePlan`. UI: `renderPlanner` (list, calendar, day panel), `renderTodayPlan` (start-screen card, redrawn by `updatePreview` and `renderSubjectPicker`), `renderPlanPick` ("Counts toward" radios, redrawn by `renderSubjectPicker`), the plan form (`openPlanForm`, `savePlanForm`). `planner` holds what the screen shows and isn't saved.
- Settings: `applyTheme`.
- `mini.js` renders the snapshot `{type,label,blockText,endsAt,pausedRemaining,waiting,totalMs}`.

### Data and state
- The only storage is the localStorage key `'study-timer-v1'`, which holds the whole `state` as JSON. `userData` is forced to `%APPDATA%\study-timer` (main.js:~225).
- `state`:
  - `settings` {hours, minutes, focusLen, shortLen, longLen, longEvery, noBreaks, dailyGoal, autoStartFocus, theme, subjectId, sound{chime,volume,muted}}
  - `tasks` [{id,text,done}]
  - `session` null or {blocks,index,endsAt,pausedRemaining,startedAt,focusedMs,waiting,lastSeen,subjectId,planId}
  - `history` {'YYYY-MM-DD': {subjectId|'none': ms}}
  - `sessionCount`, `sessionLog` ['YYYY-MM-DD']
  - `subjects` [{id,name,color 0-7,hidden,deleted?}]. Deleting keeps the subject with `hidden` and `deleted` set, so its `history` stays under it and Stats shows "Name (deleted)" (`subjectName`). Skip `deleted` ones wherever subjects are listed for editing or matched by name.
  - `achievements` {id: ISO date}
  - `records` {tasksDone, earlyStarts, lateStarts, longestSessionMs}
  - `plans` [{id,name,type 'Exam'|'Project',subjectId,created,deadline,needMin}]. A subject can have several active plans (deadline >= today). Progress comes only from `planHistory`.
  - `planned` {'YYYY-MM-DD': {planId: minutes}}, whole minutes (typed, or − / + in 15-minute steps; auto-fill uses 15-minute pieces), at most 720 a day.
  - `planHistory` {'YYYY-MM-DD': {planId: ms}}: focus time of sessions done for a plan, added by `creditFocus` next to `history` when `session.planId` is set. Reset stats clears it.
  - `settings.planId`: the "Counts toward" choice on the start screen, a plan id, `'none'`, or null (pick automatically). `currentPlanId()` resolves it; `startSession` stores it as `session.planId`. Changing subject sets it back to null.
- Migration: new fields get `??=` defaults at app.js:13-34. Follow this pattern when adding fields.
- Main-process memory only: `timer`, `miniPos`, `miniAuto`.

### Conventions
- CommonJS in main, preload and tests; browser globals in `src`. Use `init<Area>`/`render<Area>` pairs and `$ = getElementById`. Dates are local `YYYY-MM-DD`, weeks start Monday, locale is `en-GB`.
- Tests: `loadApp({saved, rawSaved, now, desktop})` runs the unmodified `app.js` in jsdom with a fake `Date` (default Wed 28 Oct 2026 12:00). Helpers: `app.advance(ms)`, `app.run(code)`, `app.state`, `app.saved()`. Canvas is stubbed. So keep `app.js` a single top-level script, and always treat `window.desktop` as optional.
- Keep in sync:
  - README "How it works" and "Project layout"
  - `version` in package.json (used in the installer name)
  - `STORAGE_KEY` (app.js and loadApp.js)
  - `appId` 'study-timer' (main.js and package.json `build.appId`)
  - IPC channel names (preload.js and main.js)
  - mini snapshot fields (`tick()` and mini.js)
  - `--subj-N` count and `SUBJECT_COLORS` (8)
- Git: work on `feature/*`, `release/*` or `docs/*` branches, then merge into `main`.

### Gotchas
- Close is blocked while `timer` is non-null (main.js:59). Main sends `'confirm-close'` and only `close:answer` `true` closes the app.
- Mini pause and skip run in the main window. If that window is gone, they are dropped.
- `freezeStaleSession` pauses a session that has not been seen for 30 s or more, so time with the app closed isn't counted.
- Don't change the `app.setPath('userData')` logic, or saved data seems to vanish.
- `blockElectronShortcut()` (main.js:208) creates a hidden directory named `Electron.lnk` in the Start Menu. It only does this in dev (`electron.exe`).
- Windows can't toggle Do Not Disturb from code, so the app only opens Settings.
- `share:*` handlers require a `data:image/png;base64,` prefix.
- `.claude/` is gitignored. Its `launch.json` serves `src` with a python server on port 5173, where `window.desktop` doesn't exist.
<!-- /project-map -->
