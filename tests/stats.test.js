// Saved data, tasks, subjects, streaks, levels and achievements.
import { describe, it, expect, afterEach } from 'vitest';
import { loadApp, dayKeyOffset, MIN } from './helpers/loadApp.js';

const BASE_SETTINGS = { hours: 1, minutes: 0, focusLen: 25, shortLen: 5, longLen: 15, longEvery: 4 };
const withHistory = (history, extra = {}) => ({ settings: { ...BASE_SETTINGS }, tasks: [], session: null, history, ...extra });
const day = (offset) => dayKeyOffset(offset);
const plain = (x) => JSON.parse(JSON.stringify(x));

let app;
afterEach(() => app?.close());

describe('saved data', () => {
  it('starts with default settings when nothing is saved', () => {
    app = loadApp();
    expect(plain(app.state.settings)).toMatchObject({
      ...BASE_SETTINGS, dailyGoal: 60, autoStartFocus: true, theme: 'system',
      sound: { chime: 'bells', volume: 0.7, muted: false },
    });
  });

  it('starts fresh when the saved data is corrupted', () => {
    app = loadApp({ rawSaved: '{not json' });
    expect(plain(app.state.settings)).toMatchObject(BASE_SETTINGS);
    expect(app.state.session).toBeNull();
  });

  it('upgrades data from older versions: fills new fields and turns plain day totals into "No subject"', () => {
    app = loadApp({ saved: withHistory({ [day(-1)]: 30 * MIN, [day(0)]: { none: 5 * MIN } }) });
    expect(plain(app.state.history)).toEqual({ [day(-1)]: { none: 30 * MIN }, [day(0)]: { none: 5 * MIN } });
    expect(app.state.sessionCount).toBe(0);
    expect(plain(app.state.subjects)).toEqual([]);
    expect(app.state.settings.dailyGoal).toBe(60);
  });

  it('keeps settings the user already chose', () => {
    app = loadApp({ saved: withHistory({}, {
      settings: { ...BASE_SETTINGS, dailyGoal: 120, autoStartFocus: false, sound: { chime: 'soft', volume: 0.2, muted: true } },
    }) });
    expect(app.state.settings.dailyGoal).toBe(120);
    expect(app.state.settings.autoStartFocus).toBe(false);
    expect(plain(app.state.settings.sound)).toEqual({ chime: 'soft', volume: 0.2, muted: true });
  });
});

describe('tasks', () => {
  it('adds a trimmed task and saves it', () => {
    app = loadApp();
    app.run('addTask("  Read chapter 3  ")');
    expect(app.state.tasks).toHaveLength(1);
    expect(app.state.tasks[0].text).toBe('Read chapter 3');
    expect(app.saved().tasks[0].done).toBe(false);
    expect(app.$('taskListSetup').textContent).toContain('Read chapter 3');
  });

  it('ignores empty or blank tasks', () => {
    app = loadApp();
    app.run('addTask(""); addTask("    ")');
    expect(app.state.tasks).toHaveLength(0);
  });

  it('shows task text as plain text, not HTML', () => {
    app = loadApp();
    app.run('addTask("<img src=x onerror=alert(1)>")');
    expect(app.$('taskListSetup').querySelector('img')).toBeNull();
  });

  it('"New session" keeps only unfinished tasks', () => {
    app = loadApp({ saved: withHistory({}, { tasks: [{ id: 1, text: 'a', done: true }, { id: 2, text: 'b', done: false }] }) });
    app.$('newBtn').click();
    expect(app.state.tasks.map((t) => t.text)).toEqual(['b']);
  });
});

describe('streaks', () => {
  const streaks = () => plain(app.run('streaks()'));

  it('is 0 with no history', () => {
    app = loadApp();
    expect(streaks()).toEqual({ cur: 0, best: 0, studiedToday: false });
  });

  it('counts consecutive days with at least 10 minutes, including today', () => {
    app = loadApp({ saved: withHistory({
      [day(0)]: { none: 10 * MIN }, [day(-1)]: { none: 40 * MIN }, [day(-2)]: { none: 15 * MIN },
    }) });
    expect(streaks()).toEqual({ cur: 3, best: 3, studiedToday: true });
  });

  it('not having studied yet today does not break the streak', () => {
    app = loadApp({ saved: withHistory({ [day(-1)]: { none: 20 * MIN }, [day(-2)]: { none: 20 * MIN } }) });
    expect(streaks()).toMatchObject({ cur: 2, studiedToday: false });
  });

  it('a day under 10 minutes breaks the streak', () => {
    app = loadApp({ saved: withHistory({
      [day(-1)]: { none: 20 * MIN }, [day(-2)]: { none: 9 * MIN }, [day(-3)]: { none: 20 * MIN },
    }) });
    expect(streaks().cur).toBe(1);
  });

  it('adds up all subjects on a day', () => {
    app = loadApp({ saved: withHistory({ [day(-1)]: { a: 5 * MIN, none: 5 * MIN } }) });
    expect(streaks().cur).toBe(1);
  });

  it('remembers the best streak even after it was broken', () => {
    const history = {};
    for (let i = 10; i < 15; i++) history[day(-i)] = { none: 30 * MIN }; // 5 days in a row, 10–14 days ago
    history[day(-1)] = { none: 30 * MIN };
    app = loadApp({ saved: withHistory(history) });
    expect(streaks()).toMatchObject({ cur: 1, best: 5 });
  });
});

describe('levels', () => {
  const level = (min) => plain(app.window.levelInfo(min));

  it('starts at level 1 with 2 hours to the next level', () => {
    app = loadApp();
    expect(level(0)).toEqual({ level: 1, title: 'Beginner', fraction: 0, toNext: 120 });
  });

  it('reaches level 2 at 2 h, level 3 at 6 h, level 4 at 12 h', () => {
    app = loadApp();
    expect(level(119).level).toBe(1);
    expect(level(120).level).toBe(2);
    expect(level(360)).toMatchObject({ level: 3, title: 'Learner', fraction: 0 });
    expect(level(720).level).toBe(4);
    expect(level(540).fraction).toBeCloseTo(0.5);
  });

  it('keeps the last title for very high levels', () => {
    app = loadApp();
    expect(level(1000 * 60).title).toBe('Legend');
  });
});

describe('subjects', () => {
  it('totals focused time per subject in a date range', () => {
    app = loadApp({ saved: withHistory({
      [day(-10)]: { math: 60 * MIN },
      [day(-1)]: { math: 10 * MIN, none: 5 * MIN },
      [day(0)]: { bio: 20 * MIN },
    }) });
    const all = plain(app.run('subjectTotals(null, null)'));
    expect(all).toEqual({ math: 70 * MIN, none: 5 * MIN, bio: 20 * MIN });
    const recent = plain(app.run(`subjectTotals(parseKey('${day(-1)}'), parseKey('${day(0)}'))`));
    expect(recent).toEqual({ math: 10 * MIN, none: 5 * MIN, bio: 20 * MIN });
  });

  it('a new subject gets a colour no visible subject uses', () => {
    app = loadApp({ saved: withHistory({}, { subjects: [
      { id: 'a', name: 'A', color: 0, hidden: false },
      { id: 'b', name: 'B', color: 1, hidden: false },
      { id: 'c', name: 'C', color: 2, hidden: true },
    ] }) });
    expect(app.run('nextFreeColor()')).toBe(2);
  });

  it('adding a subject with an existing name (any case) re-shows it instead of adding a duplicate', () => {
    app = loadApp({ saved: withHistory({}, { subjects: [{ id: 'm', name: 'Maths', color: 0, hidden: true }] }) });
    app.$('subjectName').value = '  maths ';
    app.$('subjectForm').dispatchEvent(new app.window.Event('submit', { cancelable: true }));
    expect(app.state.subjects).toHaveLength(1);
    expect(app.state.subjects[0].hidden).toBe(false);
    expect(app.state.settings.subjectId).toBe('m');
  });

  it('deleting a subject moves its time to "No subject" and keeps the totals', async () => {
    app = loadApp({ saved: withHistory(
      { [day(-1)]: { math: 30 * MIN, none: 5 * MIN }, [day(0)]: { math: 10 * MIN } },
      { subjects: [{ id: 'math', name: 'Maths', color: 0, hidden: false }],
        settings: { ...BASE_SETTINGS, subjectId: 'math' } },
    ) });
    const done = app.run('deleteSubject(state.subjects[0])');
    app.$('confirmYes').click();
    await done;
    expect(plain(app.state.history)).toEqual({ [day(-1)]: { none: 35 * MIN }, [day(0)]: { none: 10 * MIN } });
    expect(app.state.subjects).toHaveLength(0);
    expect(app.state.settings.subjectId).toBeNull();
  });

  it('cancelling the delete changes nothing', async () => {
    app = loadApp({ saved: withHistory(
      { [day(0)]: { math: 10 * MIN } },
      { subjects: [{ id: 'math', name: 'Maths', color: 0, hidden: false }] },
    ) });
    const done = app.run('deleteSubject(state.subjects[0])');
    app.$('confirmNo').click();
    await done;
    expect(app.state.subjects).toHaveLength(1);
    expect(plain(app.state.history)).toEqual({ [day(0)]: { math: 10 * MIN } });
  });
});

describe('achievements', () => {
  it('unlocks badges already earned when the app opens', () => {
    app = loadApp({ saved: withHistory({ [day(0)]: { none: 90 * MIN } }, { sessionCount: 1 }) });
    const ids = Object.keys(app.state.achievements);
    expect(ids).toEqual(expect.arrayContaining(['hours1', 'sessions1']));
    expect(ids).not.toContain('hours10');
  });

  it('only returns newly unlocked badges, and keeps old ones even if the metric drops', () => {
    app = loadApp({ saved: withHistory({ [day(0)]: { none: 90 * MIN } }) });
    expect(app.run('checkAchievements()').map((a) => a.id)).toEqual([]);
    app.run('state.history = {}');
    app.run('checkAchievements()');
    expect(app.state.achievements.hours1).toBeTruthy();
  });

  it('counts the best week of sessions (Monday to Sunday)', () => {
    // DEFAULT_NOW is a Wednesday: Monday..Wednesday of this week plus last Sunday.
    const log = [day(-2), day(-2), day(-1), day(0), day(-3)];
    app = loadApp({ saved: withHistory({}, { sessionLog: log }) });
    expect(app.run('achievementMetrics()').bestWeek).toBe(4);
  });

  it('"Goal getter" counts days that reached the daily goal', () => {
    const history = {};
    for (let i = 0; i < 7; i++) history[day(-i * 2)] = { none: 60 * MIN };
    history[day(-1)] = { none: 59 * MIN };
    app = loadApp({ saved: withHistory(history) });
    expect(app.run('achievementMetrics()').goalDays).toBe(7);
    expect(app.state.achievements.goal7).toBeTruthy();
  });

  it('finishing a session announces new badges on the done screen', () => {
    app = loadApp();
    app.run('startSession()');
    app.advance(60 * MIN);
    expect(app.$('doneAchievements').hidden).toBe(false);
    expect(app.$('doneAchievements').textContent).toContain('First session');
  });
});
