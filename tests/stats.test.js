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
    expect(level(0)).toEqual({ level: 1, title: 'Beginner', tier: 'Bronze', fraction: 0, toNext: 120 });
  });

  it('reaches level 2 at 2 h, level 3 at 6 h, level 4 at 12 h', () => {
    app = loadApp();
    expect(level(119).level).toBe(1);
    expect(level(120).level).toBe(2);
    expect(level(360)).toMatchObject({ level: 3, title: 'Learner', fraction: 0 });
    expect(level(720).level).toBe(4);
    expect(level(540).fraction).toBeCloseTo(0.5);
  });

  it('has new titles after Legend: Grandmaster at 90 h, Transcendent at 380 h', () => {
    app = loadApp();
    expect(level(72 * 60)).toMatchObject({ level: 9, title: 'Legend' });
    expect(level(90 * 60)).toMatchObject({ level: 10, title: 'Grandmaster' });
    expect(level(380 * 60)).toMatchObject({ level: 20, title: 'Transcendent' });
  });

  it('changes tier every 4 levels and stays Diamond after that', () => {
    app = loadApp();
    expect(level(12 * 60 - 1).tier).toBe('Bronze'); // level 4
    expect(level(20 * 60).tier).toBe('Silver');     // level 5
    expect(level(72 * 60).tier).toBe('Gold');       // level 9
    expect(level(156 * 60).tier).toBe('Platinum');  // level 13
    expect(level(272 * 60).tier).toBe('Diamond');   // level 17
    expect(level(1000 * 60).tier).toBe('Diamond');
  });

  it('keeps the last title for very high levels', () => {
    app = loadApp();
    expect(level(1000 * 60)).toMatchObject({ level: 32, title: 'Transcendent' });
  });

  it('shows the tier on the stats screen', () => {
    app = loadApp({ saved: withHistory({ [day(0)]: { none: 25 * 60 * MIN } }) });
    app.run('renderStats()');
    expect(app.$('levelTier').textContent).toBe('Silver');
    expect(app.$('levelCard').dataset.tier).toBe('silver');
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

  it('has 36 badges with unique ids', () => {
    app = loadApp();
    const ids = app.run('ACHIEVEMENTS.map((a) => a.id)');
    expect(ids).toHaveLength(36);
    expect(new Set(ids).size).toBe(36);
  });

  it('"Perfect week" needs the daily goal 7 days in a row', () => {
    const history = {};
    for (let i = 0; i < 6; i++) history[day(-i)] = { none: 60 * MIN };
    history[day(-6)] = { none: 59 * MIN };
    history[day(-7)] = { none: 60 * MIN };
    app = loadApp({ saved: withHistory(history) });
    expect(app.run('achievementMetrics()').goalRun).toBe(6);
    expect(app.state.achievements.perfectWeek).toBeUndefined();
    app.run(`state.history['${day(-6)}'] = { none: 60 * 60000 }`);
    expect(app.run('checkAchievements()').map((a) => a.id)).toContain('perfectWeek');
  });

  it('"Big day", "Explorer" and "Specialist" use the saved history', () => {
    app = loadApp({ saved: withHistory({
      [day(-2)]: { math: 4 * 60 * MIN },
      [day(-1)]: { math: 21 * 60 * MIN, bio: 10 * MIN },
      [day(0)]: { chem: 10 * MIN, none: 60 * MIN },
    }) });
    const m = app.run('achievementMetrics()');
    expect(m.bestDay).toBeCloseTo(21 + 1 / 6);
    expect(m.subjects).toBe(3); // "No subject" doesn't count
    expect(m.bestSubject).toBe(25);
    expect(app.state.achievements).toMatchObject({
      bigDay: expect.any(String), subjects3: expect.any(String), specialist: expect.any(String),
    });
    expect(app.state.achievements.subjects5).toBeUndefined();
  });

  it('"Weekend warrior" needs both Saturday and Sunday of the same weekend', () => {
    // DEFAULT_NOW is Wednesday 28 Oct: day(-4) is Saturday 24, day(-3) Sunday 25, day(-10) Sunday 18.
    app = loadApp({ saved: withHistory({ [day(-4)]: { none: 10 * MIN }, [day(-10)]: { none: 10 * MIN } }) });
    expect(app.run('achievementMetrics()').weekends).toBe(0);
    app.run(`state.history['${day(-3)}'] = { none: 10 * 60000 }`);
    expect(app.run('achievementMetrics()').weekends).toBe(1);
  });

  it('"Comeback" needs 7 or more days off between two study days', () => {
    app = loadApp({ saved: withHistory({ [day(-7)]: { none: 30 * MIN }, [day(0)]: { none: 30 * MIN } }) });
    expect(app.run('achievementMetrics()').comebacks).toBe(0); // 6 days off
    app.run(`state.history['${day(-8)}'] = state.history['${day(-7)}']; delete state.history['${day(-7)}']`);
    expect(app.run('achievementMetrics()').comebacks).toBe(1); // 7 days off
  });

  it('records the start time and length of finished sessions', () => {
    // 7:00 start: early bird. A 2 h session at 25-min focus blocks ends with 100 min of focus.
    app = loadApp({ now: new Date(2026, 9, 28, 7, 0).getTime(),
      saved: withHistory({}, { settings: { ...BASE_SETTINGS, hours: 2 } }) });
    app.run('startSession()');
    app.advance(120 * MIN);
    expect(app.state.session).toBeNull();
    expect(app.state.records).toMatchObject({ earlyStarts: 1, lateStarts: 0 });
    expect(app.run('achievementMetrics()').longestSession).toBeGreaterThanOrEqual(90);
    expect(app.state.achievements.earlyBird).toBeTruthy();
    expect(app.state.achievements.deepFocus).toBeTruthy();
    expect(app.state.achievements.nightOwl).toBeUndefined();
  });

  it('a session started after 22:00 unlocks "Night owl"', () => {
    app = loadApp({ now: new Date(2026, 9, 28, 23, 0).getTime() });
    app.run('startSession()');
    app.advance(60 * MIN);
    expect(app.state.records.lateStarts).toBe(1);
    expect(app.state.achievements.nightOwl).toBeTruthy();
  });

  it('counts each finished task once', () => {
    app = loadApp({ saved: withHistory({}, { tasks: [
      { id: 1, text: 'a', done: true }, { id: 2, text: 'b', done: true }, { id: 3, text: 'c', done: false },
    ] }) });
    app.run('startSession(); finishSession(true)');
    expect(app.state.records.tasksDone).toBe(2);
    app.run('startSession(); finishSession(true)'); // same tasks still ticked: not counted again
    expect(app.state.records.tasksDone).toBe(2);
  });

  it('upgrades older saved data with empty records and keeps existing ones', () => {
    app = loadApp({ saved: withHistory({}, { records: { tasksDone: 7 } }) });
    expect(plain(app.state.records)).toEqual({ tasksDone: 7, earlyStarts: 0, lateStarts: 0, longestSessionMs: 0 });
  });
});

describe('share cards', () => {
  // DEFAULT_NOW is Wednesday 28 Oct 2026: this week is Mon 26 Oct (day -2) to Sun 1 Nov (day 4).
  const saved = () => withHistory({
    [day(-9)]: { math: 120 * MIN },             // last week
    [day(-2)]: { math: 60 * MIN },
    [day(-1)]: { bio: 30 * MIN, none: 50 * MIN },
    [day(0)]: { bio: 5 * MIN },                 // under 10 min: not a study day
  }, {
    subjects: [{ id: 'math', name: 'Maths', color: 0, hidden: false }, { id: 'bio', name: 'Biology', color: 1, hidden: false }],
    sessionLog: [day(-9), day(-2), day(-1), day(-1)],
    sessionCount: 4,
  });
  const stats = (data) => Object.fromEntries(data.stats);

  it('the week card sums this week only', () => {
    app = loadApp({ saved: saved() });
    const d = plain(app.run('shareData("week")'));
    expect(d.title).toBe('My study week');
    expect(d.range).toBe('Mon 26 Oct – Sun 1 Nov');
    expect(d.big).toBe('2h 25m');
    expect(stats(d)).toMatchObject({
      'Sessions': '3', 'Days studied': '2/7', 'Daily goal met': '2/7', 'Best day': '1h 20m', 'Top subject': 'Maths',
    });
    expect(d.bars.map((b) => b.min)).toEqual([60, 80, 5, 0, 0, 0, 0]);
  });

  it('the all-time card covers everything', () => {
    app = loadApp({ saved: saved() });
    const d = plain(app.run('shareData("all")'));
    expect(d.title).toBe('My study journey');
    expect(d.range).toBe(`Since ${app.run(`fmtDay(parseKey('${day(-9)}'))`)}`);
    expect(d.big).toBe('4h 25m');
    expect(d.bars).toBeNull();
    expect(stats(d)).toMatchObject({
      'Sessions': '4', 'Days studied': '3', 'Best streak': '2 days', 'Best day': '2h', 'Top subject': 'Maths',
    });
    expect(stats(d)['Achievements']).toMatch(/^\d+\/36$/);
  });

  it('works with no study yet', () => {
    app = loadApp();
    const d = plain(app.run('shareData("all")'));
    expect(d.range).toBe('Just getting started');
    expect(stats(d)).toMatchObject({ 'Top subject': '—', 'Best day': '0m', 'Best streak': '0 days' });
  });

  it('the text version lists the same stats and the level', () => {
    app = loadApp({ saved: saved() });
    const text = app.run('shareText(shareData("week"))');
    expect(text).toContain('📚 My study week (Mon 26 Oct – Sun 1 Nov)');
    expect(text).toContain('2h 25m of focus this week');
    expect(text).toContain('• Top subject: Maths');
    expect(text).toContain('Level 2 · Apprentice (Bronze)');
  });

  it('the buttons copy and save the chosen card through the desktop app', async () => {
    const calls = [];
    const desktop = {
      updateTimer: () => {}, toggleMini: () => {}, onCommand: () => {}, answerClose: () => {},
      toggleFullScreen: () => {}, exitFullScreen: () => {}, onFullScreen: () => {}, openDndSettings: () => {},
      copyImage: (url) => calls.push(['copyImage', url]),
      copyText: (text) => calls.push(['copyText', text]),
      saveImage: async (url, name) => { calls.push(['saveImage', url, name]); return true; },
    };
    app = loadApp({ saved: saved(), desktop });
    app.$('shareCopyImage').click();
    await Promise.resolve();
    expect(calls[0]).toEqual(['copyImage', 'data:image/png;base64,AAAA']);
    expect(app.$('shareStatus').textContent).toContain('copied');

    app.window.document.querySelector('#sharePeriod [data-period="all"]').click();
    app.$('shareCopyText').click();
    await Promise.resolve();
    expect(calls[1][1]).toContain('My study journey');

    app.$('shareSaveImage').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls[2]).toEqual(['saveImage', 'data:image/png;base64,AAAA', `study-all-time-${day(0)}.png`]);
    expect(app.$('shareStatus').textContent).toBe('Image saved.');
  });
});
