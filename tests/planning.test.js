// Session planning, time formatting and reading the setup inputs.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadApp } from './helpers/loadApp.js';

const plain = (x) => JSON.parse(JSON.stringify(x)); // objects from the fake page, as plain JS
const settings = (over = {}) => ({ hours: 1, minutes: 0, focusLen: 25, shortLen: 5, longLen: 15, longEvery: 4, ...over });

let app;
beforeEach(() => { app = loadApp(); });
afterEach(() => app.close());

describe('buildPlan', () => {
  const plan = (over) => plain(app.window.buildPlan(settings(over)));
  const total = (blocks) => blocks.reduce((a, b) => a + b.min, 0);

  it('splits 1 hour into focus blocks with a short break, folding the leftover into the last block', () => {
    expect(plan()).toEqual([
      { type: 'focus', min: 25 },
      { type: 'short', min: 5 },
      { type: 'focus', min: 30 },
    ]);
  });

  it('puts a long break after every Nth focus block', () => {
    const blocks = plan({ hours: 3 });
    const breaks = blocks.filter((b) => b.type !== 'focus').map((b) => b.type);
    expect(breaks.slice(0, 4)).toEqual(['short', 'short', 'short', 'long']);
    expect(blocks.find((b) => b.type === 'long').min).toBe(15);
  });

  it('returns no blocks for 0 minutes', () => {
    expect(plan({ hours: 0, minutes: 0 })).toEqual([]);
  });

  it('makes a single focus block when the session is shorter than one block', () => {
    expect(plan({ hours: 0, minutes: 15 })).toEqual([{ type: 'focus', min: 15 }]);
  });

  it.each([
    [0, 5], [0, 30], [0, 45], [1, 0], [1, 35], [2, 10], [4, 0], [12, 59],
  ])('for %ih %im: blocks add up to the chosen time and never end on a break', (hours, minutes) => {
    const blocks = plan({ hours, minutes });
    expect(total(blocks)).toBe(hours * 60 + minutes);
    expect(blocks.at(-1).type).toBe('focus');
    expect(blocks[0].type).toBe('focus');
    // Focus and breaks alternate.
    blocks.forEach((b, i) => expect(b.type === 'focus').toBe(i % 2 === 0));
  });

  it('works with unusual block settings (long focus, long breaks every 2)', () => {
    const blocks = plan({ hours: 5, focusLen: 120, shortLen: 30, longLen: 60, longEvery: 2 });
    expect(total(blocks)).toBe(300);
    expect(blocks.at(-1).type).toBe('focus');
  });
});

describe('time formatting', () => {
  it('fmtClock shows mm:ss, adds hours when needed, and rounds partial seconds up', () => {
    const f = app.window.fmtClock;
    expect(f(0)).toBe('00:00');
    expect(f(1500)).toBe('00:02');
    expect(f(25 * 60000)).toBe('25:00');
    expect(f(3661000)).toBe('1:01:01');
  });

  it('fmtClock never shows negative time', () => {
    expect(app.window.fmtClock(-5000)).toBe('00:00');
  });

  it('fmtMinutes', () => {
    const f = app.window.fmtMinutes;
    expect(f(0)).toBe('0 min');
    expect(f(45)).toBe('45 min');
    expect(f(60)).toBe('1 h');
    expect(f(90)).toBe('1 h 30 min');
  });

  it('fmtShort rounds to whole minutes', () => {
    const f = app.window.fmtShort;
    expect(f(0)).toBe('0m');
    expect(f(44.6)).toBe('45m');
    expect(f(120)).toBe('2h');
    expect(f(234)).toBe('3h 54m');
  });
});

describe('setup inputs (readSettings)', () => {
  const setInputs = (values) => {
    for (const [id, v] of Object.entries(values)) app.$(id).value = v;
  };

  it('keeps values that are in range', () => {
    setInputs({ hours: '2', minutes: '30', focusLen: '50', shortLen: '10', longLen: '20', longEvery: '3' });
    expect(plain(app.window.readSettings())).toEqual({ hours: 2, minutes: 30, focusLen: 50, shortLen: 10, longLen: 20, longEvery: 3 });
  });

  it('clamps out-of-range values to the input limits', () => {
    setInputs({ hours: '99', minutes: '-5', focusLen: '1', shortLen: '999', longLen: '0', longEvery: '1' });
    expect(plain(app.window.readSettings())).toEqual({ hours: 12, minutes: 0, focusLen: 5, shortLen: 30, longLen: 1, longEvery: 2 });
  });

  it('uses the minimum for empty or non-numeric input', () => {
    setInputs({ hours: '', minutes: 'abc' });
    const s = app.window.readSettings();
    expect(s.hours).toBe(0);
    expect(s.minutes).toBe(0);
  });

  it('disables Start and asks for a duration when the total is 0', () => {
    setInputs({ hours: '0', minutes: '0' });
    app.window.updatePreview();
    expect(app.$('startBtn').disabled).toBe(true);
    expect(app.$('planSummary').textContent).toBe('Choose how long you want to study.');
  });

  it('saves the chosen settings so they come back after a restart', () => {
    setInputs({ hours: '2', minutes: '15' });
    app.window.updatePreview();
    expect(app.saved().settings).toMatchObject({ hours: 2, minutes: 15 });
  });
});
