# Study Timer

A pomodoro-style study timer for your laptop. Choose how long you want to study, and the app splits it into focus blocks with short breaks between them (and a longer break every few blocks). Add a list of tasks for the session and tick them off as you go.

## Run it

```bash
npm start
```

The first time on a new computer, run `npm install` first.

Or double-click **Study Timer** on the desktop. If the shortcut goes missing (or you move this folder), recreate it with:

```bash
powershell -ExecutionPolicy Bypass -File tools\make-shortcut.ps1
```

The icon is drawn by `tools\make-icon.ps1`; edit and re-run it to change the design. It has two built-in designs, `-Design clock-and-book` (default) and `-Design book-in-clock`.

## How it works

- **Total time includes breaks.** 1 h → 25 min focus, 5 min break, 30 min focus. The session never ends on a break; leftover minutes are added to the last block.
- **Block settings** (focus length, break lengths, long break frequency) are under "Block settings" on the start screen.
- A chime and a Windows notification mark each change between focus and break.
- **"I'm back":** when a break ends, the next focus block waits until you click **I'm back** (or ▶ on the mini timer), so it never runs while you're away. To have focus blocks start by themselves instead, tick **Start focus blocks automatically after a break** under Block settings. Breaks always start by themselves.
- **Space** pauses and resumes.
- **Mini timer:** a small always-on-top window with the countdown, red while you focus, green on breaks, blue on long breaks, grey when paused. It pops up by itself during a session whenever the app isn't the active window — minimized, or you clicked another window — without taking focus from that window, and goes away when you come back to the app, or open it any time with **⧉ Mini timer**. Drag it anywhere; its buttons pause, skip, reopen the app (⤢) or hide it (✕).
- **Subjects:** pick what you're studying under "What are you studying?" (optional; click it again to clear, "+ New subject" to add one with a colour). The timer and mini timer show it, and the Stats screen's **By subject** card shows time per subject this week, this month or in total. Rename, recolour or hide subjects with **Edit subjects**; hiding keeps their past time. Time from before subjects existed counts as "No subject".
- **Progress tracking:** every minute of focus is logged per day. The 📊 Stats screen shows today, this week, this month and all time, your streak (a day counts once you focus 10+ min), a comparison with the same point last week, levels you earn as hours add up, a 14-day chart and a 20-week calendar. Set your daily goal there, or start over with **Reset stats** (tasks and settings are kept).
- **Closing during a session** asks first: end the session (the time focused so far is saved) or keep studying. If the app quits without asking (crash, battery), the session reopens paused where it stopped, so time with the app closed is never counted.
- Tasks and any running session are saved, so closing the app doesn't lose them. Unfinished tasks carry over to your next session.

## Project layout

| File | What it is |
| --- | --- |
| `src/index.html` | The screens (setup, timer, done) |
| `src/styles.css` | Look and feel, including dark mode |
| `src/app.js` | All the logic: planning blocks, the timer, tasks, sounds |
| `src/mini.html`, `src/mini.js` | The floating mini timer |
| `main.js` | Electron: opens the app window and the mini timer, and passes messages between them |
| `preload.js` | The bridge that lets the pages talk to Electron (`window.desktop`) |
