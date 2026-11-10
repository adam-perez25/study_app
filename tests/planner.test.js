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
