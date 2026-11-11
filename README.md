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

- **The time you pick is study time; breaks are added on top.** 30 min → 25 min focus, 5 min break, 5 min focus. 1 h → 25 + 5 + 25 + 5 + 10 min (70 min in all). Focus blocks never go over the length you chose, and the session never ends on a break.
- **No breaks:** tick **No breaks** under the time picker on the start screen and the whole time is one focus block, with no short or long breaks. The plan preview shows a single block, the break settings are greyed out while it's on, and the choice is remembered for next time.
- **Block settings** (focus length, break lengths, long break frequency) are under "Block settings" on the start screen.
- A chime and a Windows notification mark each change between focus and break. Pick the chime (Bells, Soft, Digital or Marimba) and the volume, or mute it ("library mode"), under Sound in ⚙ Settings; the 🔔 button on the timer mutes it too.
- **"I'm back":** by default the next focus block starts by itself when a break ends. Untick **Start focus blocks automatically after a break** in ⚙ Settings (or under Block settings) and the next focus block waits until you click **I'm back** (or ▶ on the mini timer), so it never runs while you're away. Breaks always start by themselves.
- **Space** pauses and resumes.
- **Mini timer:** a small always-on-top window with the countdown, red while you focus, green on breaks, blue on long breaks, grey when paused. It pops up by itself during a session whenever the app isn't the active window — minimized, or you clicked another window — without taking focus from that window, and goes away when you come back to the app, or open it any time with **⧉ Mini timer**. Drag it anywhere; its buttons pause, skip, reopen the app (⤢) or hide it (✕).
- **Full screen:** **⛶ Full screen** fills the screen with the timer during a session; click **✕ Exit full screen** or press Esc to leave, and it leaves by itself when the session ends.
- **Share your progress:** at the bottom of 📊 Stats, pick **This week** or **All time** to see a card with your focus time, sessions, days studied, streak, best day, top subject and level. **📋 Copy image** puts it on the clipboard to paste in a chat, **💾 Save image** saves it as a PNG, and **📝 Copy as text** copies the same stats as text.
- **Do not disturb:** Windows doesn't let apps switch it on themselves, so **🔕 Do not disturb** opens Windows notification settings, where its switch is at the top. Also tick "Turn on do not disturb automatically… when using an app in full screen mode" there, and ⛶ Full screen will block notifications for you.
- **Subjects:** pick what you're studying under "What are you studying?" (optional; click it again to clear, "+ New subject" to add one with a colour). The timer and mini timer show it, and the Stats screen's **By subject** card shows time per subject this week, this month or in total. Rename, recolour, hide, delete or add subjects in ⚙ Settings; hiding keeps their past time under the subject, and so does deleting: a deleted subject disappears from the start screen, Settings and the planner, but its time still counts in every total and shows in **By subject** as "Name (deleted)". Time from before subjects existed counts as "No subject".
- **📅 Planner:** plan exams and projects. **📅 Plan** on the start screen opens it; **+ New plan** asks for a name, Exam or Project, a subject, a deadline and the hours needed. Click a day on the month calendar to choose how long to study each plan that day (click the time and type it, like 1:30, 90 or 1h 30, or use − / + to move 15 minutes; up to 12 h), then **Copy to next day** or **Clear day**. **Spread the missing hours** (also offered when you make a plan) shares a plan's time evenly over the weekdays left before its deadline and keeps it balanced: when you change a day it's pinned 📌 and the plan's other days adjust (put less on Tuesday and the next days get a bit more, put more and they get less), clearing a day keeps it free, clicking 📌 lets that day adjust by itself again, and time you don't study moves to the days left. Plans you plan entirely by hand are never changed. A subject can have several plans at once (say, an exam and a project). When you pick a subject that has plans, the start screen shows **Counts toward**: one plan is picked for you (the one with the most time planned today, otherwise the soonest deadline) and you can pick another one or **No plan**. A plan's progress is only the sessions you did for it, so the same study time never counts twice; with No plan the time still counts in your stats. Each plan shows hours studied, needed and planned, and warns when the planned hours don't cover what's needed. Past days show studied / planned, in amber when you fell short. When something is planned for today, the start screen shows a **Today's plan** card: pick one and its time, subject and plan are filled in. Deleting a subject deletes its plans; **Reset stats** keeps your plans and planned hours but starts their progress again.
- **Progress tracking:** every minute of focus is logged per day. The 📊 Stats screen shows today, this week, this month and all time, your streak (a day counts once you focus 10+ min), a comparison with the same point last week, levels you earn as hours add up (Beginner, Apprentice, Learner…; click the level card to open a list of all 20 levels with their tier colour, the hours each one needs, the ones you've reached and the time left to the next one), a 14-day chart and a 20-week calendar. Set your daily goal in ⚙ Settings, or start over there with **Reset stats** (tasks, subjects and settings are kept).
- **🏅 Achievements:** badges for total hours (1 to 100 h), streaks (3 to 30 days), completed sessions, 5 sessions in one week and reaching your daily goal on 7 days. New ones are announced at the end of a session; all of them are on the Stats screen. Once unlocked, a badge stays unlocked.
- **⚙ Settings** (next to 📊 Stats): Appearance (Light, Dark or Match Windows), Sound (chime, volume, mute), Subjects, Timer (the "I'm back" switch and daily goal) and Data (Reset stats).
- **Closing during a session** asks first: end the session (the time focused so far is saved) or keep studying. If the app quits without asking (crash, battery), the session reopens paused where it stopped, so time with the app closed is never counted.
- Tasks and any running session are saved, so closing the app doesn't lose them. Unfinished tasks carry over to your next session. Everything is stored locally in the app's own storage; there is no account, server or configuration file.

## Project layout

| File | What it is |
| --- | --- |
| `src/index.html` | The screens (setup, timer, done, stats, settings, planner) and the popups |
| `src/styles.css` | Look and feel, including dark mode |
| `src/app.js` | All the logic: planning blocks, the timer, tasks, subjects, stats, achievements, sounds, the planner, settings |
| `src/mini.html`, `src/mini.js` | The floating mini timer |
| `main.js` | Electron: opens the app window and the mini timer, and passes messages between them |
| `preload.js` | The bridge that lets the pages talk to Electron (`window.desktop`) |
| `assets/` | The app icon (`icon.png`, `icon.ico`) |
| `tests/` | Vitest tests (`planning`, `session`, `stats`, `planner`) and `helpers/loadApp.js`, which loads the app into jsdom |
| `tools/make-shortcut.ps1`, `tools/make-shortcut.js` | Create the desktop and Start Menu shortcuts |
| `tools/make-icon.ps1` | Draws the icon into `assets/` |

## Roadmap

- **Backup (export and import):** all your data lives in one localStorage key (`study-timer-v1`), so wiping `%APPDATA%\study-timer` or changing computers loses it. Add two buttons in Settings: "Export data" saves the whole `state` as a JSON file (through a save dialog in main, like `share:save-image`), and "Import data" reads one back, checks it looks like a Study Timer backup, asks to confirm, and replaces the current data. Run the same `??=` migration after importing. Test the validation as a pure function.
- **Planner nudges:** the planner only shows numbers when you open it. Show "behind by 40 min" and "3 days left" on the Today's plan card and on each plan row, using data that already exists (`planMissing`, `planStudied`, the deadline). Keep the maths in a pure function with tests, because planner reminders will reuse it.
- **Plan checklist for topics:** give each plan an optional list of topics or chapters (for example "Unit 3 - Waves") that you tick off, with "3/8 topics" shown next to the time bar. Add a `topics` field to `plans` with a `??=` default and a small editor in the plan form.
- **Planner reminders:** a Windows notification when the app starts, or at a time you choose, such as "Exam in 3 days, you're 2h behind". Needs a reminder setting and a check in the main process. Build it after planner nudges, which provide the "behind" calculation.
- **Pull tasks into sessions:** when you start a session for a plan, offer its unticked topics as tasks for the session task list, and tick the topic off the plan when you tick the task. Build it after the plan checklist.

### Later

- **Sync across devices:** needs a server or a shared cloud folder, so it waits until the backup feature exists.
- **Plan review:** when a deadline passes, show a recap with planned versus studied time and whether the plan was done or missed.
- **Ranking:** a leaderboard to compare your study time with other people. It needs a login and a server, so it waits until sync exists.

Suggested order: backup, planner nudges, plan checklist, planner reminders, pull tasks into sessions.
