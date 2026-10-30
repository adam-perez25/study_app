// A running session: blocks switching, pause, skip, ending, and resuming after the app closed.
import { describe, it, expect, afterEach } from 'vitest';
import { loadApp, dayKeyOffset, DEFAULT_NOW, MIN } from './helpers/loadApp.js';

const TODAY = dayKeyOffset(0);

// 1 hour plan: focus 25, short 5, focus 30.
function startOneHour(saved) {
  const app = loadApp({ saved });
  app.run('startSession()');
  return app;
}
const focusToday = (app) => (app.state.history[TODAY] || {}).none || 0;

let app;
afterEach(() => app?.close());

describe('starting a session', () => {
  it('starts on the first focus block and saves the session', () => {
    app = startOneHour();
    const s = app.state.session;
    expect(s.index).toBe(0);
    expect(s.endsAt).toBe(DEFAULT_NOW + 25 * MIN);
    expect(app.saved().session).not.toBeNull();
    expect(app.$('session').classList.contains('hidden')).toBe(false);
    expect(app.$('timeLeft').textContent).toBe('25:00');
  });
});

describe('blocks switching over time', () => {
  it('moves to the break when the focus block ends and credits its time to today', () => {
    app = startOneHour();
    app.advance(25 * MIN);
    expect(app.state.session.index).toBe(1);
    expect(app.state.session.blocks[1].type).toBe('short');
    expect(focusToday(app)).toBe(25 * MIN);
    expect(app.state.session.focusedMs).toBe(25 * MIN);
  });

  it('does not count break time as focus', () => {
    app = startOneHour();
    app.advance(30 * MIN); // through focus and the 5 min break
    expect(app.state.session.index).toBe(2);
    expect(focusToday(app)).toBe(25 * MIN);
  });

  it('catches up on several blocks at once (e.g. after the laptop slept) and finishes the session', () => {
    app = startOneHour();
    app.advance(2 * 60 * MIN);
    expect(app.state.session).toBeNull();
    expect(focusToday(app)).toBe(55 * MIN);
    expect(app.state.sessionCount).toBe(1);
    expect(app.state.sessionLog).toEqual([TODAY]);
    expect(app.$('done').classList.contains('hidden')).toBe(false);
  });

  it('with auto-start off, holds the next focus block after a break until "I\'m back"', () => {
    app = loadApp();
    app.state.settings.autoStartFocus = false;
    app.run('startSession()');
    app.advance(30 * MIN + 10 * MIN); // break ended 10 minutes ago
    const s = app.state.session;
    expect(s.index).toBe(2);
    expect(s.waiting).toBe(true);
    expect(s.pausedRemaining).toBe(30 * MIN); // nothing of the focus block used up while away
    expect(app.$('pauseBtn').textContent).toBe('I’m back');

    app.run('togglePause()'); // "I'm back"
    expect(app.state.session.waiting).toBe(false);
    expect(app.state.session.endsAt).toBe(app.now() + 30 * MIN);
  });
});

describe('pause and resume', () => {
  it('freezes the remaining time while paused', () => {
    app = startOneHour();
    app.advance(10 * MIN);
    app.run('togglePause()');
    expect(app.state.session.pausedRemaining).toBe(15 * MIN);
    app.advance(60 * MIN); // an hour away while paused
    expect(app.state.session.index).toBe(0);
    expect(app.$('timeLeft').textContent).toBe('15:00');
    expect(app.$('pauseBtn').textContent).toBe('Resume');
  });

  it('continues from where it was paused', () => {
    app = startOneHour();
    app.advance(10 * MIN);
    app.run('togglePause()');
    app.advance(60 * MIN);
    app.run('togglePause()');
    expect(app.state.session.pausedRemaining).toBeNull();
    expect(app.state.session.endsAt).toBe(app.now() + 15 * MIN);
    app.advance(15 * MIN);
    expect(app.state.session.index).toBe(1);
    expect(focusToday(app)).toBe(25 * MIN);
  });
});

describe('skipping a block', () => {
  it('credits only the minutes actually focused before skipping', () => {
    app = startOneHour();
    app.advance(10 * MIN);
    app.run('skipBlock()');
    expect(app.state.session.index).toBe(1);
    expect(focusToday(app)).toBe(10 * MIN);
    expect(app.state.session.endsAt).toBe(app.now() + 5 * MIN);
  });

  it('skipping a break gives no focus time', () => {
    app = startOneHour();
    app.advance(25 * MIN);
    app.advance(2 * MIN);
    app.run('skipBlock()');
    expect(app.state.session.index).toBe(2);
    expect(focusToday(app)).toBe(25 * MIN);
  });

  it('skipping while paused keeps the next block paused at its full length', () => {
    app = startOneHour();
    app.advance(10 * MIN);
    app.run('togglePause()');
    app.run('skipBlock()');
    expect(app.state.session.pausedRemaining).toBe(5 * MIN);
    expect(focusToday(app)).toBe(10 * MIN);
  });

  it('skipping the last block ends the session early', () => {
    app = startOneHour();
    app.advance(30 * MIN); // now in the last focus block
    app.advance(5 * MIN);
    app.run('skipBlock()');
    expect(app.state.session).toBeNull();
    expect(focusToday(app)).toBe(30 * MIN);
    expect(app.$('doneSummary').textContent).toMatch(/^Session ended early\. You completed 30 min of focus/);
  });
});

describe('ending a session', () => {
  it('ending early saves the focus so far and counts the session', () => {
    app = startOneHour();
    app.advance(12 * MIN);
    app.run('finishSession(true)');
    expect(app.state.session).toBeNull();
    expect(focusToday(app)).toBe(12 * MIN);
    expect(app.state.sessionCount).toBe(1);
    expect(app.saved().session).toBeNull();
  });

  it('ending right away (no focus at all) does not count as a session', () => {
    app = startOneHour();
    app.run('finishSession(true)');
    expect(app.state.sessionCount).toBe(0);
    expect(app.state.sessionLog).toEqual([]);
  });

  it('credits the time to the subject picked for the session', () => {
    app = loadApp({ saved: {
      settings: { hours: 1, minutes: 0, focusLen: 25, shortLen: 5, longLen: 15, longEvery: 4, subjectId: 'math' },
      tasks: [], session: null,
      subjects: [{ id: 'math', name: 'Maths', color: 0, hidden: false }],
    } });
    app.run('startSession()');
    app.advance(25 * MIN);
    expect(app.state.history[TODAY]).toEqual({ math: 25 * MIN });
  });

  it('a hidden subject is not used for a new session', () => {
    app = loadApp({ saved: {
      settings: { hours: 1, minutes: 0, focusLen: 25, shortLen: 5, longLen: 15, longEvery: 4, subjectId: 'math' },
      tasks: [], session: null,
      subjects: [{ id: 'math', name: 'Maths', color: 0, hidden: true }],
    } });
    app.run('startSession()');
    expect(app.state.session.subjectId).toBeNull();
  });

  it('the summary mentions completed tasks', () => {
    app = startOneHour({
      settings: { hours: 1, minutes: 0, focusLen: 25, shortLen: 5, longLen: 15, longEvery: 4 },
      tasks: [{ id: 1, text: 'a', done: true }, { id: 2, text: 'b', done: false }],
      session: null,
    });
    app.advance(60 * MIN);
    expect(app.$('doneSummary').textContent).toBe('You completed 55 min of focus and 1 of 2 tasks.');
  });
});

describe('reopening the app with a saved session', () => {
  const savedSession = (session) => ({
    settings: { hours: 1, minutes: 0, focusLen: 25, shortLen: 5, longLen: 15, longEvery: 4 },
    tasks: [],
    session: {
      blocks: [{ type: 'focus', min: 25 }, { type: 'short', min: 5 }, { type: 'focus', min: 30 }],
      index: 0, pausedRemaining: null, focusedMs: 0, subjectId: null, ...session,
    },
  });

  it('after a crash, stops the clock where the app was last seen and reopens paused', () => {
    const start = DEFAULT_NOW - 3 * 60 * MIN; // started 3 hours ago...
    app = loadApp({ saved: savedSession({
      startedAt: start, endsAt: start + 25 * MIN,
      lastSeen: start + 10 * MIN, // ...but the app died 10 minutes in
    }) });
    const s = app.state.session;
    expect(s.index).toBe(0);
    expect(s.pausedRemaining).toBe(15 * MIN);
    expect(focusToday(app)).toBe(0); // the 3 hours with the app closed aren't study time
  });

  it('a session that was simply running (seen moments ago) keeps running', () => {
    app = loadApp({ saved: savedSession({
      startedAt: DEFAULT_NOW - 10 * MIN, endsAt: DEFAULT_NOW + 15 * MIN, lastSeen: DEFAULT_NOW - 2000,
    }) });
    expect(app.state.session.pausedRemaining).toBeNull();
    expect(app.$('timeLeft').textContent).toBe('15:00');
  });

  it('a paused session stays paused with the same time left', () => {
    app = loadApp({ saved: savedSession({
      startedAt: DEFAULT_NOW - 5 * 60 * MIN, endsAt: DEFAULT_NOW - 4 * 60 * MIN,
      pausedRemaining: 7 * MIN, lastSeen: DEFAULT_NOW - 4 * 60 * MIN,
    }) });
    expect(app.state.session.pausedRemaining).toBe(7 * MIN);
    expect(app.state.session.index).toBe(0);
  });
});
