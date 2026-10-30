# Study Timer

A pomodoro-style study timer for your laptop. Choose how long you want to study, and the app splits it into focus blocks with short breaks between them (and a longer break every few blocks). Add a list of tasks for the session and tick them off as you go.

## Requirements

- Windows (made and tested there; the desktop shortcut and icon scripts in `tools\` are PowerShell)
- [Node.js](https://nodejs.org/) 22.22+ or 24.15+ (needed by the test tools), with npm
- Electron is installed by `npm install`; nothing else is needed

## Run it

The first time on a new computer, install the dependencies:

```bash
npm install
```

Then start the app:

```bash
npm start
```

Or double-click **Study Timer** on the desktop. If the shortcut goes missing (or you move this folder), recreate it with:

```bash
powershell -ExecutionPolicy Bypass -File tools\make-shortcut.ps1
```

The icon is drawn by `tools\make-icon.ps1`; edit and re-run it to change the design. It has two built-in designs, `-Design clock-and-book` (default) and `-Design book-in-clock`:

```bash
powershell -ExecutionPolicy Bypass -File tools\make-icon.ps1 -Design book-in-clock
```

## Run the tests

```bash
npm test
```

The tests use [Vitest](https://vitest.dev/) and load `src/index.html` and `src/app.js` into a fake browser page (jsdom) with a clock the tests control, so they run without opening Electron. They cover session planning, the running timer (switching blocks, pause, skip, ending, resuming after a crash), saved data, subjects, streaks, levels and achievements.

## How it works

- **Total time includes breaks.** 1 h → 25 min focus, 5 min break, 30 min focus. The session never ends on a break; leftover minutes are added to the last block.
- **Block settings** (focus length, break lengths, long break frequency) are under "Block settings" on the start screen.
- A chime and a Windows notification mark each change between focus and break. Pick the chime (Bells, Soft, Digital or Marimba) and the volume, or mute it ("library mode"), under Sound in ⚙ Settings; the 🔔 button on the timer mutes it too.
- **"I'm back":** by default the next focus block starts by itself when a break ends. Untick **Start focus blocks automatically after a break** in ⚙ Settings (or under Block settings) and the next focus block waits until you click **I'm back** (or ▶ on the mini timer), so it never runs while you're away. Breaks always start by themselves.
- **Space** pauses and resumes.
- **Mini timer:** a small always-on-top window with the countdown, red while you focus, green on breaks, blue on long breaks, grey when paused. It pops up by itself during a session whenever the app isn't the active window — minimized, or you clicked another window — without taking focus from that window, and goes away when you come back to the app, or open it any time with **⧉ Mini timer**. Drag it anywhere; its buttons pause, skip, reopen the app (⤢) or hide it (✕).
- **Subjects:** pick what you're studying under "What are you studying?" (optional; click it again to clear, "+ New subject" to add one with a colour). The timer and mini timer show it, and the Stats screen's **By subject** card shows time per subject this week, this month or in total. Rename, recolour, hide, delete or add subjects in ⚙ Settings; hiding keeps their past time under the subject, deleting keeps it as "No subject". Time from before subjects existed counts as "No subject".
- **Progress tracking:** every minute of focus is logged per day. The 📊 Stats screen shows today, this week, this month and all time, your streak (a day counts once you focus 10+ min), a comparison with the same point last week, levels you earn as hours add up (Beginner, Apprentice, Learner…), a 14-day chart and a 20-week calendar. Set your daily goal in ⚙ Settings, or start over there with **Reset stats** (tasks, subjects and settings are kept).
- **🏅 Achievements:** badges for total hours (1 to 100 h), streaks (3 to 30 days), completed sessions, 5 sessions in one week and reaching your daily goal on 7 days. New ones are announced at the end of a session; all of them are on the Stats screen. Once unlocked, a badge stays unlocked.
- **⚙ Settings** (next to 📊 Stats): Appearance (Light, Dark or Match Windows), Sound (chime, volume, mute), Subjects, Timer (the "I'm back" switch and daily goal) and Data (Reset stats).
- **Closing during a session** asks first: end the session (the time focused so far is saved) or keep studying. If the app quits without asking (crash, battery), the session reopens paused where it stopped, so time with the app closed is never counted.
- Tasks and any running session are saved, so closing the app doesn't lose them. Unfinished tasks carry over to your next session. Everything is stored locally in the app's own storage; there is no account, server or configuration file.

## Project layout

| File | What it is |
| --- | --- |
| `src/index.html` | The screens (setup, timer, done) |
| `src/styles.css` | Look and feel, including dark mode |
| `src/app.js` | All the logic: planning blocks, the timer, tasks, subjects, stats, achievements, sounds, settings |
| `src/mini.html`, `src/mini.js` | The floating mini timer |
| `main.js` | Electron: opens the app window and the mini timer, and passes messages between them |
| `preload.js` | The bridge that lets the pages talk to Electron (`window.desktop`) |
| `assets/` | The app icon (`icon.png`, `icon.ico`) |
| `tests/` | Vitest tests (`planning`, `session`, `stats`) and `helpers/loadApp.js`, which loads the app into jsdom |
| `tools/make-shortcut.ps1`, `tools/make-shortcut.js` | Create the desktop and Start Menu shortcuts |
| `tools/make-icon.ps1` | Draws the icon into `assets/` |
