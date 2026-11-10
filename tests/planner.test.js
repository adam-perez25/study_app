// Planner: plans for exams and projects, the month calendar and the hours planned per day.
import { describe, it, expect, afterEach } from 'vitest';
import { loadApp, dayKeyOffset, MIN } from './helpers/loadApp.js';

const BASE_SETTINGS = { hours: 1, minutes: 0, focusLen: 25, shortLen: 5, longLen: 15, longEvery: 4 };
const SUBJECTS = [
  { id: 's1', name: 'Maths', color: 0, hidden: false },
  { id: 's2', name: 'Physics', color: 1, hidden: false },
];
const day = (offset) => dayKeyOffset(offset); // today is Wed 28 Oct 2026
const plain = (x) => JSON.parse(JSON.stringify(x));
const plan = (extra = {}) => ({ id: 'p1', name: 'Calculus exam', type: 'Exam', subjectId: 's1', created: day(-5), deadline: day(10), needMin: 600, ...extra });
const saved = (extra = {}) => ({ settings: { ...BASE_SETTINGS }, tasks: [], session: null, history: {}, subjects: SUBJECTS, ...extra });

let app;
afterEach(() => app?.close());

function openPlanner(data) {
  app = loadApp({ saved: data });
  app.$('planBtn').click();
  return app;
}
const submit = (form) => form.dispatchEvent(new app.window.Event('submit', { cancelable: true }));
const click = (el) => el.dispatchEvent(new app.window.MouseEvent('click', { bubbles: true }));

describe('planner data', () => {
  it('adds empty plans to saved data from older versions', () => {
    app = loadApp({ saved: saved() });
    expect(plain(app.state.plans)).toEqual([]);
    expect(plain(app.state.planned)).toEqual({});
  });

  it('builds a month grid of whole weeks that start on Monday', () => {
    app = loadApp();
    const grid = app.run('monthGrid(2026, 9)'); // October 2026 starts on a Thursday
    expect(grid.length % 7).toBe(0);
    expect(grid[0]).toBe('2026-09-28'); // the Monday before 1 Oct
    expect(grid).toContain('2026-10-31');
    expect(grid.at(-1)).toBe('2026-11-01'); // the Sunday after 31 Oct
  });

  it('finds the active plan of a subject, and ignores plans past their deadline', () => {
    app = loadApp({ saved: saved({ plans: [plan({ id: 'old', deadline: day(-1) }), plan()] }) });
    expect(app.run(`activePlan('s1').id`)).toBe('p1');
    expect(app.run(`activePlan('s2')`)).toBeNull();
  });
});

describe('planner screen', () => {
  it('opens from the start screen and goes back', () => {
    openPlanner(saved());
    expect(app.$('planner').classList.contains('hidden')).toBe(false);
    expect(app.$('planList').textContent).toContain('No plans yet');
    app.$('plannerBack').click();
    expect(app.$('setup').classList.contains('hidden')).toBe(false);
  });

  it('shows this month with today marked, and moves between months', () => {
    openPlanner(saved({ plans: [plan({ deadline: day(3) })] }));
    expect(app.$('calTitle').textContent).toBe('October 2026');
    expect(app.$('calendar').querySelector('.cell.today').dataset.day).toBe(day(0));
    expect(app.$('calendar').querySelector(`[data-day="${day(3)}"] .flag`)).not.toBeNull(); // the deadline, 31 Oct
    app.$('calNext').click();
    expect(app.$('calTitle').textContent).toBe('November 2026');
    app.$('calPrev').click();
    app.$('calPrev').click();
    expect(app.$('calTitle').textContent).toBe('September 2026');
    app.$('calToday').click();
    expect(app.$('calTitle').textContent).toBe('October 2026');
  });

  it('lists plans with their type, subject and days left', () => {
    openPlanner(saved({ plans: [plan()] }));
    const card = app.$('planList').querySelector('[data-plan="p1"]');
    expect(card.textContent).toContain('Calculus exam');
    expect(card.textContent).toContain('Exam · Maths · due 7 Nov (10 days left)');
  });

  it('shows plan names as text, not HTML', () => {
    openPlanner(saved({ plans: [plan({ name: '<img src=x onerror=alert(1)>' })] }));
    expect(app.$('planList').querySelector('img')).toBeNull();
    expect(app.$('planList').textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('new plan popup', () => {
  it('saves a plan for the picked subject', () => {
    openPlanner(saved());
    app.$('newPlanBtn').click();
    expect(app.$('planDialog').open).toBe(true);
    app.$('planName').value = '  Mechanics project ';
    app.$('planType').querySelector('[data-type="Project"]').click();
    app.$('planSubjects').querySelector('[data-subject="s2"]').click();
    app.$('planDeadline').value = day(20);
    app.$('planHours').value = '12.5';
    submit(app.$('planForm'));
    expect(app.$('planDialog').open).toBe(false);
    const [p] = app.saved().plans;
    expect(p).toMatchObject({ name: 'Mechanics project', type: 'Project', subjectId: 's2', created: day(0), deadline: day(20), needMin: 750 });
    expect(app.$('planList').querySelector('.pl-card.on').dataset.plan).toBe(p.id); // the new plan is highlighted
  });

  it('explains what is missing instead of saving', () => {
    openPlanner(saved());
    app.$('newPlanBtn').click();
    submit(app.$('planForm'));
    expect(app.$('planError').textContent).toBe('Give the plan a name.');
    app.$('planName').value = 'Exam';
    submit(app.$('planForm'));
    expect(app.$('planError').textContent).toContain('Pick a subject');
    app.$('planSubjects').querySelector('[data-subject="s1"]').click();
    app.$('planDeadline').value = day(-1);
    submit(app.$('planForm'));
    expect(app.$('planError').textContent).toBe('The deadline can’t be before today.');
    app.$('planDeadline').value = day(3);
    app.$('planHours').value = '0';
    submit(app.$('planForm'));
    expect(app.$('planError').textContent).toContain('Hours needed');
    expect(app.state.plans.length).toBe(0);
    expect(app.$('planDialog').open).toBe(true);
  });

  it('allows one active plan per subject, so study time never counts twice', () => {
    openPlanner(saved({ plans: [plan()] }));
    app.$('newPlanBtn').click();
    expect(app.$('planSubjects').querySelector('[data-subject="s1"]').disabled).toBe(true);
    expect(app.$('planSubjects').querySelector('[data-subject="s2"]').disabled).toBe(false);
  });

  it('frees the subject again once the old plan is past its deadline', () => {
    openPlanner(saved({ plans: [plan({ deadline: day(-1) })] }));
    app.$('newPlanBtn').click();
    expect(app.$('planSubjects').querySelector('[data-subject="s1"]').disabled).toBe(false);
  });

  it('asks for a subject first when there are none', () => {
    openPlanner(saved({ subjects: [] }));
    app.$('newPlanBtn').click();
    expect(app.$('planSubjects').textContent).toContain('Add a subject on the start screen first');
  });

  it('closes with Cancel without saving', () => {
    openPlanner(saved());
    app.$('newPlanBtn').click();
    app.$('planName').value = 'Something';
    app.$('planCancel').click();
    expect(app.$('planDialog').open).toBe(false);
    expect(app.state.plans.length).toBe(0);
  });
});

describe('hours per day', () => {
  const dayCell = (k) => app.$('calendar').querySelector(`[data-day="${k}"]`);
  const change = (el) => el.dispatchEvent(new app.window.Event('change', { bubbles: true }));

  it('rounds planned time to 15-minute steps between 0 and 12 h', () => {
    app = loadApp({ saved: saved({ plans: [plan()] }) });
    app.run(`setPlanned('${day(1)}', 'p1', 50)`);
    expect(app.state.planned[day(1)].p1).toBe(45);
    app.run(`setPlanned('${day(1)}', 'p1', 2000)`);
    expect(app.state.planned[day(1)].p1).toBe(720);
    app.run(`setPlanned('${day(1)}', 'p1', 0)`);
    expect(app.state.planned[day(1)]).toBeUndefined(); // an empty day is removed
  });

  it('adds a plan to the selected day, then changes it in 15-minute steps', () => {
    openPlanner(saved({ plans: [plan()] }));
    click(dayCell(day(1)));
    expect(app.$('dayPanel').textContent).toContain('Thursday 29 October');
    expect(app.$('dayPanel').textContent).toContain('Nothing planned for this day yet.');
    const add = app.$('dayAdd');
    add.value = 'p1';
    change(add);
    expect(app.saved().planned[day(1)]).toEqual({ p1: 60 });
    app.$('dayPanel').querySelector('[data-step="15"]').click();
    app.$('dayPanel').querySelector('[data-step="15"]').click();
    app.$('dayPanel').querySelector('[data-step="-15"]').click();
    expect(app.saved().planned[day(1)]).toEqual({ p1: 75 });
    expect(app.$('dayPanel').textContent).toContain('Planned 1h 15m');
    expect(dayCell(day(1)).querySelector('.pill').textContent).toBe('1:15');
    expect(dayCell(day(1)).querySelector('.tot').textContent).toBe('1:15');
  });

  it('takes a plan off the day when it goes down to 0', () => {
    openPlanner(saved({ plans: [plan()], planned: { [day(0)]: { p1: 15 } } }));
    app.$('dayPanel').querySelector('[data-step="-15"]').click();
    expect(app.saved().planned).toEqual({});
  });

  it('only offers plans whose deadline is still ahead on that day', () => {
    openPlanner(saved({ plans: [plan({ deadline: day(2) }), plan({ id: 'p2', subjectId: 's2', name: 'Lab', deadline: day(9) })] }));
    click(dayCell(day(4))); // Sun 1 Nov, the last cell of October's calendar
    const options = [...app.$('dayAdd').options].map((o) => o.value).filter(Boolean);
    expect(options).toEqual(['p2']);
  });

  it('copies a day to the next one and shows that day', () => {
    openPlanner(saved({ plans: [plan(), plan({ id: 'p2', subjectId: 's2', deadline: day(1) })], planned: { [day(1)]: { p1: 90, p2: 30 }, [day(2)]: { p2: 15 } } }));
    click(dayCell(day(1)));
    app.$('copyDayBtn').click();
    // p2's deadline is day(1), so it isn't copied past it
    expect(app.saved().planned[day(2)]).toEqual({ p1: 90 });
    expect(app.$('dayPanel').textContent).toContain('Friday 30 October');
  });

  it('clears a day', () => {
    openPlanner(saved({ plans: [plan()], planned: { [day(1)]: { p1: 90 }, [day(3)]: { p1: 30 } } }));
    click(dayCell(day(1)));
    app.$('clearDayBtn').click();
    expect(app.saved().planned).toEqual({ [day(3)]: { p1: 30 } });
  });

  it('shows days before today without − / + and without Clear', () => {
    openPlanner(saved({ plans: [plan()], planned: { [day(-1)]: { p1: 60 } } }));
    click(dayCell(day(-1)));
    expect(app.$('dayPanel').textContent).toContain('Past day');
    expect(app.$('dayPanel').querySelector('[data-step]')).toBeNull();
    expect(app.$('dayAdd')).toBeNull();
    expect(app.$('clearDayBtn').disabled).toBe(true);
  });

  it('fades the other plans on the calendar while one is highlighted', () => {
    openPlanner(saved({ plans: [plan(), plan({ id: 'p2', subjectId: 's2' })], planned: { [day(1)]: { p1: 60, p2: 30 } } }));
    click(app.$('planList').querySelector('[data-plan="p2"]'));
    const pills = [...dayCell(day(1)).querySelectorAll('.pill')];
    expect(pills.map((p) => p.classList.contains('faded'))).toEqual([true, false]);
  });
});

describe('progress', () => {
  const dayCell = (k) => app.$('calendar').querySelector(`[data-day="${k}"]`);
  // p1 runs from day(-5) to day(10) for Maths (s1)
  const history = {
    [day(-9)]: { s1: 120 * MIN },              // before the plan was made: doesn't count
    [day(-2)]: { s1: 45 * MIN, s2: 30 * MIN }, // only the Maths part counts
    [day(0)]: { s1: 20 * MIN },
  };

  it('counts the time studied with the plan subject, from the day it was made to its deadline', () => {
    app = loadApp({ saved: saved({ plans: [plan()], history }) });
    expect(app.run(`planStudied(planById('p1'))`)).toBe(65);
    expect(app.run(`planStudiedOn(planById('p1'), '${day(-9)}')`)).toBe(0);
    expect(app.run(`planStudied({ ...planById('p1'), deadline: '${day(-1)}' })`)).toBe(45); // after the deadline doesn't count
  });

  it('adds up the hours planned for a plan', () => {
    app = loadApp({ saved: saved({ plans: [plan()], planned: { [day(1)]: { p1: 60 }, [day(2)]: { p1: 90, p2: 30 } } }) });
    expect(app.run(`planPlanned(planById('p1'))`)).toBe(150);
  });

  it('shows studied, needed and planned hours, and warns when the plan is short', () => {
    openPlanner(saved({ plans: [plan()], history, planned: { [day(1)]: { p1: 120 } } }));
    const card = app.$('planList').querySelector('[data-plan="p1"]');
    expect(card.querySelector('.pl-num').textContent).toBe('1h 5m studied of 10h · 2h planned');
    expect(card.querySelector('.meter-fill').style.width).toBe(`${(65 / 600) * 100}%`);
    expect(card.querySelector('.pl-stat').textContent).toBe('⚠ 8h still unplanned');
  });

  it('says when a plan is fully planned, done, or past its deadline', () => {
    const planned = { [day(1)]: { p1: 600 } };
    openPlanner(saved({ plans: [plan()], history, planned }));
    expect(app.$('planList').querySelector('.pl-stat').textContent).toBe('✓ Fully planned');
    app.close();
    openPlanner(saved({ plans: [plan({ needMin: 60 })], history }));
    expect(app.$('planList').querySelector('.pl-stat').textContent).toContain('Done');
    app.close();
    openPlanner(saved({ plans: [plan({ deadline: day(-1) })], history }));
    expect(app.$('planList').querySelector('.pl-stat').textContent).toBe('Deadline passed with 9h 15m left');
  });

  it('shows studied / planned on past days and today, and marks days that fell short', () => {
    openPlanner(saved({ plans: [plan()], history, planned: { [day(-2)]: { p1: 60 }, [day(-1)]: { p1: 30 }, [day(0)]: { p1: 15 }, [day(1)]: { p1: 45 } } }));
    expect(dayCell(day(-2)).querySelector('.tot').textContent).toBe('45m / 1h');
    expect(dayCell(day(-2)).querySelector('.tot').classList.contains('short')).toBe(true);
    expect(dayCell(day(-1)).querySelector('.tot').textContent).toBe('0m / 30m');
    expect(dayCell(day(0)).querySelector('.tot').textContent).toBe('20m / 15m');
    expect(dayCell(day(0)).querySelector('.tot').classList.contains('short')).toBe(false); // today isn't over yet
    expect(dayCell(day(1)).querySelector('.tot').textContent).toBe('45m'); // still ahead
  });

  it('shows what was studied for each plan in the day panel', () => {
    openPlanner(saved({ plans: [plan()], history, planned: { [day(-2)]: { p1: 60 } } }));
    click(dayCell(day(-2)));
    expect(app.$('dayPanel').querySelector('.st').textContent).toBe('45m studied');
    expect(app.$('dayPanel').querySelector('.sum').textContent).toBe('Planned 1h · Studied 45m');
  });
});

describe('deleting', () => {
  it('deletes a plan and the hours planned for it, after asking', async () => {
    openPlanner(saved({ plans: [plan(), plan({ id: 'p2', subjectId: 's2' })], planned: { [day(1)]: { p1: 60, p2: 30 }, [day(2)]: { p1: 45 } } }));
    expect(app.$('deletePlanBtn').hidden).toBe(true);
    click(app.$('planList').querySelector('[data-plan="p1"]'));
    expect(app.$('deletePlanBtn').hidden).toBe(false);
    app.$('deletePlanBtn').click();
    expect(app.$('confirmDialog').open).toBe(true);
    app.$('confirmYes').click();
    await Promise.resolve();
    expect(app.saved().plans.map((p) => p.id)).toEqual(['p2']);
    expect(app.saved().planned).toEqual({ [day(1)]: { p2: 30 } });
    expect(app.$('deletePlanBtn').hidden).toBe(true);
  });

  it('deletes the plans of a deleted subject', async () => {
    app = loadApp({ saved: saved({ plans: [plan()], planned: { [day(1)]: { p1: 60 } }, history: { [day(-1)]: { s1: 30 * MIN } } }) });
    app.run(`deleteSubject(subjectById('s1'))`);
    expect(app.$('confirmText').textContent).toContain('Its plan (“Calculus exam”) is deleted too.');
    app.$('confirmYes').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(app.saved().plans).toEqual([]);
    expect(app.saved().planned).toEqual({});
    expect(app.saved().history[day(-1)]).toEqual({ none: 30 * MIN }); // the time studied stays
  });
});
