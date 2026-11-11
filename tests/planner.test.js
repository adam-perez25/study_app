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

  it("lists a subject's running plans, soonest deadline first, and skips plans past their deadline", () => {
    app = loadApp({ saved: saved({ plans: [plan({ id: 'old', deadline: day(-1) }), plan({ id: 'late', deadline: day(20) }), plan()] }) });
    expect(app.run(`activePlans('s1').map((p) => p.id)`)).toEqual(['p1', 'late']);
    expect(app.run(`activePlans('s2')`)).toEqual([]);
  });

  it("picks the plan with the most time planned today, otherwise the soonest deadline", () => {
    app = loadApp({ saved: saved({ plans: [plan(), plan({ id: 'late', deadline: day(20) })] }) });
    expect(app.run(`defaultPlan(activePlans('s1')).id`)).toBe('p1');
    app.run(`state.planned['${day(0)}'] = { late: 30 }`);
    expect(app.run(`defaultPlan(activePlans('s1')).id`)).toBe('late');
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
    expect(app.$('planError').textContent).toBe('Pick the subject this plan is for.');
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

  it('lets a subject have an exam and a project at the same time', () => {
    openPlanner(saved({ plans: [plan()] }));
    app.$('newPlanBtn').click();
    app.$('planName').value = 'Maths project';
    app.$('planType').querySelector('[data-type="Project"]').click();
    app.$('planSubjects').querySelector('[data-subject="s1"]').click();
    submit(app.$('planForm'));
    expect(app.$('planError').textContent).toBe('');
    expect(app.saved().plans.map((p) => [p.type, p.subjectId])).toEqual([['Exam', 's1'], ['Project', 's1']]);
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

  it('keeps the exact minutes, between 0 and 12 h', () => {
    app = loadApp({ saved: saved({ plans: [plan()] }) });
    app.run(`setPlanned('${day(1)}', 'p1', 50)`);
    expect(app.state.planned[day(1)].p1).toBe(50);
    app.run(`setPlanned('${day(1)}', 'p1', 2000)`);
    expect(app.state.planned[day(1)].p1).toBe(720);
    app.run(`setPlanned('${day(1)}', 'p1', 0)`);
    expect(app.state.planned[day(1)]).toBeUndefined(); // an empty day is removed
  });

  it('reads typed times like 1:30, 90 or 1h 30', () => {
    app = loadApp();
    const parse = (t) => app.run(`parseDuration(${JSON.stringify(t)})`);
    expect(['1:30', '90', '90m', '90 min', '1h 30', '1h30m', '1.5h', '1,5h', '2h', ' 0:45 '].map(parse))
      .toEqual([90, 90, 90, 90, 90, 90, 90, 90, 120, 45]);
    expect(['', 'abc', '1:', '-5', 'h'].map(parse)).toEqual([null, null, null, null, null]);
  });

  it('lets you click the time and type a new one', () => {
    openPlanner(saved({ plans: [plan()], planned: { [day(0)]: { p1: 90 } } }));
    const key = (el, k) => el.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: k, bubbles: true }));
    const edit = (text, k = 'Enter') => {
      app.$('dayPanel').querySelector('[data-edit="p1"]').click();
      const input = app.$('dayPanel').querySelector('.d-time-input');
      input.value = text;
      key(input, k);
      return input;
    };
    expect(app.$('dayPanel').querySelector('[data-edit="p1"]').textContent).toBe('1h 30m');
    app.$('dayPanel').querySelector('[data-edit="p1"]').click();
    expect(app.$('dayPanel').querySelector('.d-time-input').value).toBe('1:30'); // starts with the current time
    key(app.$('dayPanel').querySelector('.d-time-input'), 'Escape');
    edit('1:20');
    expect(app.saved().planned[day(0)].p1).toBe(80); // exactly as typed
    expect(app.$('dayPanel').querySelector('[data-edit="p1"]').textContent).toBe('1h 20m');
    edit('45', 'Escape'); // Esc cancels
    expect(app.saved().planned[day(0)].p1).toBe(80);
    const bad = edit('soon');
    expect(bad.classList.contains('bad')).toBe(true); // not a time: stays in the box, marked
    expect(app.saved().planned[day(0)].p1).toBe(80);
    key(bad, 'Escape');
    app.$('dayPanel').querySelector('[data-step="15"]').click(); // − / + still move 15 minutes
    expect(app.saved().planned[day(0)].p1).toBe(95);
    edit('20h');
    expect(app.saved().planned[day(0)].p1).toBe(720); // 12 h at most
    edit('0');
    expect(app.saved().planned).toEqual({}); // 0 takes the plan off the day
  });

  it('saves a typed time when you click somewhere else', () => {
    openPlanner(saved({ plans: [plan()], planned: { [day(0)]: { p1: 90 } } }));
    app.$('dayPanel').querySelector('[data-edit="p1"]').click();
    const input = app.$('dayPanel').querySelector('.d-time-input');
    input.value = '2h';
    input.dispatchEvent(new app.window.FocusEvent('focusout', { bubbles: true }));
    expect(app.saved().planned[day(0)].p1).toBe(120);
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
  // Sessions done for each plan. p1 (exam) and p3 (project) are both Maths: each only gets its own sessions.
  const planHistory = {
    [day(-2)]: { p1: 45 * MIN, p3: 30 * MIN },
    [day(0)]: { p1: 20 * MIN },
  };
  const history = { [day(-2)]: { s1: 75 * MIN }, [day(0)]: { s1: 50 * MIN } }; // more Maths than the plans got

  it('counts only the sessions done for that plan', () => {
    app = loadApp({ saved: saved({ plans: [plan(), plan({ id: 'p3', type: 'Project' })], history, planHistory }) });
    expect(app.run(`planStudied(planById('p1'))`)).toBe(65);
    expect(app.run(`planStudied(planById('p3'))`)).toBe(30);
    expect(app.run(`planStudiedOn(planById('p1'), '${day(-1)}')`)).toBe(0);
  });

  it('adds up the hours planned for a plan', () => {
    app = loadApp({ saved: saved({ plans: [plan()], planned: { [day(1)]: { p1: 60 }, [day(2)]: { p1: 90, p2: 30 } } }) });
    expect(app.run(`planPlanned(planById('p1'))`)).toBe(150);
  });

  it('shows studied, needed and planned hours, and warns when the plan is short', () => {
    openPlanner(saved({ plans: [plan()], planHistory, planned: { [day(1)]: { p1: 120 } } }));
    const card = app.$('planList').querySelector('[data-plan="p1"]');
    expect(card.querySelector('.pl-num').textContent).toBe('1h 5m studied of 10h · 2h planned ahead');
    expect(card.querySelector('.meter-fill').style.width).toBe(`${(65 / 600) * 100}%`);
    // 10 h needed − 45 min studied before today − 2 h planned ahead (today's 20 min is part of today's plan)
    expect(card.querySelector('.pl-stat').textContent).toBe('⚠ 7h 15m still unplanned');
  });

  it('says when a plan is fully planned, done, or past its deadline', () => {
    const planned = { [day(1)]: { p1: 600 } };
    openPlanner(saved({ plans: [plan()], planHistory, planned }));
    expect(app.$('planList').querySelector('.pl-stat').textContent).toBe('✓ Fully planned');
    app.close();
    openPlanner(saved({ plans: [plan({ needMin: 60 })], planHistory }));
    expect(app.$('planList').querySelector('.pl-stat').textContent).toContain('Done');
    app.close();
    openPlanner(saved({ plans: [plan({ deadline: day(-1) })], planHistory }));
    expect(app.$('planList').querySelector('.pl-stat').textContent).toBe('Deadline passed with 8h 55m left');
  });

  it('shows studied / planned on past days and today, and marks days that fell short', () => {
    openPlanner(saved({ plans: [plan()], planHistory, planned: { [day(-2)]: { p1: 60 }, [day(-1)]: { p1: 30 }, [day(0)]: { p1: 15 }, [day(1)]: { p1: 45 } } }));
    expect(dayCell(day(-2)).querySelector('.tot').textContent).toBe('45m / 1h');
    expect(dayCell(day(-2)).querySelector('.tot').classList.contains('short')).toBe(true);
    expect(dayCell(day(-1)).querySelector('.tot').textContent).toBe('0m / 30m');
    expect(dayCell(day(0)).querySelector('.tot').textContent).toBe('20m / 15m');
    expect(dayCell(day(0)).querySelector('.tot').classList.contains('short')).toBe(false); // today isn't over yet
    expect(dayCell(day(1)).querySelector('.tot').textContent).toBe('45m'); // still ahead
  });

  it('shows what was studied for each plan in the day panel', () => {
    openPlanner(saved({ plans: [plan()], planHistory, planned: { [day(-2)]: { p1: 60 } } }));
    click(dayCell(day(-2)));
    expect(app.$('dayPanel').querySelector('.st').textContent).toBe('45m studied');
    expect(app.$('dayPanel').querySelector('.sum').textContent).toBe('Planned 1h · Studied 45m');
  });
});

describe("today's plan on the start screen", () => {
  const today = () => ({ plans: [plan(), plan({ id: 'p2', name: 'Lab report', subjectId: 's2' })], planned: { [day(0)]: { p1: 90, p2: 45 }, [day(1)]: { p1: 60 } } });

  it('is hidden when nothing is planned for today', () => {
    app = loadApp({ saved: saved({ plans: [plan()], planned: { [day(1)]: { p1: 60 } } }) });
    expect(app.$('todayPlanCard').hidden).toBe(true);
  });

  it("lists today's plans with their time and what's done", () => {
    app = loadApp({ saved: saved({ ...today(), history: { [day(0)]: { s1: 25 * MIN } }, planHistory: { [day(0)]: { p1: 25 * MIN } } }) });
    expect(app.$('todayPlanCard').hidden).toBe(false);
    const rows = [...app.$('todayPlanList').querySelectorAll('.tp-row')].map((r) => r.textContent);
    expect(rows).toEqual(['Calculus exam1 h 5 min25m done', 'Lab report45 minnot started']);
  });

  it('fills in the time and subject when you pick one, and highlights it', () => {
    app = loadApp({ saved: saved(today()) });
    app.$('todayPlanList').querySelector('[data-plan="p2"]').click();
    expect(app.$('hours').value).toBe('0');
    expect(app.$('minutes').value).toBe('45');
    expect(app.saved().settings).toMatchObject({ hours: 0, minutes: 45, subjectId: 's2' });
    expect(app.$('subjectPicker').querySelector('.chip.selected').textContent).toBe('Physics');
    expect(app.$('todayPlanList').querySelector('.selected').dataset.plan).toBe('p2');
    // Changing the time afterwards means it's no longer exactly that plan.
    app.$('minutes').value = '50';
    app.$('minutes').dispatchEvent(new app.window.Event('input'));
    expect(app.$('todayPlanList').querySelector('.selected')).toBeNull();
  });

  it('fills in only the time left when part of the day is already done', () => {
    app = loadApp({ saved: saved({ ...today(), planHistory: { [day(0)]: { p1: 25 * MIN } } }) });
    app.$('todayPlanList').querySelector('[data-plan="p1"]').click();
    expect(app.$('hours').value).toBe('1');
    expect(app.$('minutes').value).toBe('5');
    expect(app.$('todayPlanList').querySelector('.selected').dataset.plan).toBe('p1');
  });

  it('offers the full time again once the day plan is done', () => {
    app = loadApp({ saved: saved({ ...today(), planHistory: { [day(0)]: { p1: 95 * MIN } } }) });
    app.$('todayPlanList').querySelector('[data-plan="p1"]').click();
    expect(app.$('hours').value).toBe('1');
    expect(app.$('minutes').value).toBe('30');
  });

  it('shows what you planned in the Planner when you come back', () => {
    openPlanner(saved({ plans: [plan()] }));
    const add = app.$('dayAdd');
    add.value = 'p1';
    add.dispatchEvent(new app.window.Event('change', { bubbles: true }));
    app.$('plannerBack').click();
    expect(app.$('todayPlanCard').hidden).toBe(false);
    expect(app.$('todayPlanList').textContent).toContain('Calculus exam');
  });

  it('leaves out plans whose subject is hidden', () => {
    app = loadApp({ saved: saved({ ...today(), subjects: [SUBJECTS[0], { ...SUBJECTS[1], hidden: true }] }) });
    expect([...app.$('todayPlanList').querySelectorAll('[data-plan]')].map((r) => r.dataset.plan)).toEqual(['p1']);
  });
});

describe('counts toward a plan', () => {
  // Maths (s1) has an exam (p1, due day 10) and a project (p3, due day 20); Physics (s2) has no plan.
  const twoPlans = (extra = {}) => saved({
    plans: [plan(), plan({ id: 'p3', name: 'Maths project', type: 'Project', deadline: day(20) })],
    settings: { ...BASE_SETTINGS, subjectId: 's1' }, ...extra,
  });
  const choices = () => [...app.$('planOptions').querySelectorAll('input')].map((r) => `${r.value}${r.checked ? '*' : ''}`);
  const pick = (value) => {
    const radio = app.$('planOptions').querySelector(`input[value="${value}"]`);
    radio.checked = true;
    radio.dispatchEvent(new app.window.Event('change', { bubbles: true }));
  };
  // Studies 10 minutes and ends the session early.
  async function studyTenMinutes() {
    app.$('startBtn').click();
    app.advance(10 * MIN);
    app.$('endBtn').click();
    app.$('confirmYes').click();
    await Promise.resolve();
    await Promise.resolve();
  }

  it("shows the subject's plans and No plan, with one picked for you", () => {
    app = loadApp({ saved: twoPlans() });
    expect(app.$('planPick').hidden).toBe(false);
    expect(choices()).toEqual(['p1*', 'p3', 'none']);
    expect(app.$('planOptions').textContent).toContain('Exam · due 7 Nov · picked for you');
  });

  it('is hidden when the subject has no plans, or no subject is picked', () => {
    app = loadApp({ saved: twoPlans({ settings: { ...BASE_SETTINGS, subjectId: 's2' } }) });
    expect(app.$('planPick').hidden).toBe(true);
    app.close();
    app = loadApp({ saved: twoPlans({ settings: { ...BASE_SETTINGS, subjectId: null } }) });
    expect(app.$('planPick').hidden).toBe(true);
  });

  it('remembers what you pick, including No plan', () => {
    app = loadApp({ saved: twoPlans() });
    pick('p3');
    expect(app.saved().settings.planId).toBe('p3');
    expect(choices()).toEqual(['p1', 'p3*', 'none']);
    pick('none');
    expect(app.saved().settings.planId).toBe('none');
    expect(choices()).toEqual(['p1', 'p3', 'none*']);
  });

  it('a session counts toward the picked plan only', async () => {
    app = loadApp({ saved: twoPlans() });
    pick('p3');
    await studyTenMinutes();
    expect(app.saved().planHistory).toEqual({ [day(0)]: { p3: 10 * MIN } });
    expect(app.saved().history[day(0)]).toEqual({ s1: 10 * MIN }); // and in your stats, as always
  });

  it('with No plan, the session counts in your stats but toward no plan', async () => {
    app = loadApp({ saved: twoPlans() });
    pick('none');
    await studyTenMinutes();
    expect(app.saved().planHistory).toEqual({});
    expect(app.saved().history[day(0)]).toEqual({ s1: 10 * MIN });
  });

  it('shows the plan next to the subject on the timer', () => {
    app = loadApp({ saved: twoPlans() });
    app.$('startBtn').click();
    expect(app.$('subjectPill').textContent).toBe('Maths · Calculus exam');
  });

  it('picks automatically again when you choose another subject', () => {
    app = loadApp({ saved: twoPlans({ settings: { ...BASE_SETTINGS, subjectId: 's1', planId: 'none' } }) });
    const chip = (name) => [...app.$('subjectPicker').querySelectorAll('.chip')].find((c) => c.textContent === name);
    chip('Physics').click();
    chip('Maths').click();
    expect(app.state.settings.planId).toBeNull();
    expect(choices()).toEqual(['p1*', 'p3', 'none']);
  });

  it("picking a row in Today's plan picks its plan too", () => {
    app = loadApp({ saved: twoPlans({ planned: { [day(0)]: { p3: 45 } } }) });
    app.$('todayPlanList').querySelector('[data-plan="p3"]').click();
    expect(app.saved().settings.planId).toBe('p3');
    expect(choices()).toEqual(['p1', 'p3*', 'none']);
  });

  it('deleting the picked plan goes back to picking automatically', () => {
    app = loadApp({ saved: twoPlans({ settings: { ...BASE_SETTINGS, subjectId: 's1', planId: 'p3' }, planHistory: { [day(-1)]: { p3: 5 * MIN, p1: 5 * MIN } } }) });
    app.run(`removePlan('p3')`);
    expect(app.state.settings.planId).toBeNull();
    expect(JSON.parse(JSON.stringify(app.state.planHistory))).toEqual({ [day(-1)]: { p1: 5 * MIN } });
  });

  it('Reset stats also resets what was studied for each plan, and keeps the plans', async () => {
    app = loadApp({ saved: twoPlans({ planHistory: { [day(-1)]: { p1: 5 * MIN } }, planned: { [day(1)]: { p1: 60 } } }) });
    app.$('resetStatsBtn').click();
    app.$('confirmYes').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(app.saved().planHistory).toEqual({});
    expect(app.saved().plans).toHaveLength(2);
    expect(app.saved().planned).toEqual({ [day(1)]: { p1: 60 } });
  });
});

describe('keeping plans balanced', () => {
  // Today is Wed 28 Oct; p1 (10 h, due Sat 7 Nov) has 8 weekdays left: 28, 29, 30 Oct and 2–6 Nov.
  const weekdays = [0, 1, 2, 5, 6, 7, 8, 9];
  const auto = (extra = {}) => plan({ auto: true, ...extra });
  const minutes = (ns) => ns.map((n) => app.state.planned[day(n)]?.p1 ?? 0);
  const ahead = () => app.run(`plannedFrom(planById('p1'))`);

  it('spreads the hours evenly over the weekdays left before the deadline', () => {
    app = loadApp({ saved: saved({ plans: [auto()] }) }); // opening the app balances it
    expect(minutes(weekdays)).toEqual(Array(8).fill(75));
    expect(app.state.planned[day(3)]).toBeUndefined(); // no weekends
    expect(app.saved().planned[day(0)].p1).toBe(75);   // and it was saved
  });

  it('leaves plans you plan by hand alone', () => {
    app = loadApp({ saved: saved({ plans: [plan()], planned: { [day(1)]: { p1: 60 } } }) });
    expect(app.run(`rebalancePlan(planById('p1'))`)).toBe(false);
    expect(JSON.parse(JSON.stringify(app.state.planned))).toEqual({ [day(1)]: { p1: 60 } });
  });

  it('puts less on one day: that day is pinned and the other days get more', () => {
    app = loadApp({ saved: saved({ plans: [auto()] }) });
    app.run(`setByHand('${day(1)}', 'p1', 30)`);
    expect(app.run(`isPinned(planById('p1'), '${day(1)}')`)).toBe(true);
    // 570 min left over the 7 other days: 75 each, plus 15 more on the first three
    expect(minutes(weekdays)).toEqual([90, 30, 90, 90, 75, 75, 75, 75]);
    expect(ahead()).toBe(600);
  });

  it('puts more on one day: the other days get less', () => {
    app = loadApp({ saved: saved({ plans: [auto()] }) });
    app.run(`setByHand('${day(1)}', 'p1', 180)`);
    expect(minutes(weekdays)).toEqual([60, 180, 60, 60, 60, 60, 60, 60]);
    expect(ahead()).toBe(600);
  });

  it('a cleared day stays free, and unpinning it lets it adjust again', () => {
    openPlanner(saved({ plans: [auto()] }));
    click(app.$('calendar').querySelector(`[data-day="${day(1)}"]`));
    app.$('clearDayBtn').click();
    expect(minutes([1])).toEqual([0]);
    expect(ahead()).toBe(600); // the other 7 days took its time
    const pin = app.$('dayPanel').querySelector('[data-unpin="p1"]'); // still listed, pinned at 0
    expect(pin.textContent).toBe('📌');
    pin.click();
    expect(minutes(weekdays)).toEqual(Array(8).fill(75));
  });

  it('marks pinned days with 📌 and the others with auto', () => {
    openPlanner(saved({ plans: [auto()] }));
    expect(app.$('dayPanel').querySelector('.d-auto').textContent).toBe('auto');
    app.$('dayPanel').querySelector('[data-step="15"]').click();
    expect(app.$('dayPanel').querySelector('[data-unpin="p1"]')).not.toBeNull();
    expect(app.$('calendar').querySelector(`[data-day="${day(0)}"] .pill`).classList.contains('pinned')).toBe(true);
  });

  it('moves time you studied less than planned to the days left', () => {
    app = loadApp({ saved: saved({ plans: [auto()] }) });
    expect(minutes([0])).toEqual([75]);
    app.setNow(app.now() + 24 * 3600000); // a day goes by and nothing was studied
    app.run('rebalanceAll()');
    // the whole 10 h is now shared over the 7 weekdays left
    expect(minutes([1, 2, 5, 6, 7, 8, 9])).toEqual([90, 90, 90, 90, 90, 75, 75]);
    expect(app.run(`plannedFrom(planById('p1'), '${day(1)}')`)).toBe(600);
  });

  it('counts what you studied before today', () => {
    app = loadApp({ saved: saved({ plans: [auto()], planHistory: { [day(-1)]: { p1: 60 * MIN } } }) });
    expect(ahead()).toBe(540); // 10 h − 1 h already studied
  });

  it('never plans more than 12 h a day, and warns about what does not fit', () => {
    openPlanner(saved({ plans: [auto({ needMin: 6000, deadline: day(2) })] }));
    expect(minutes([0, 1, 2])).toEqual([720, 720, 720]);
    expect(app.$('planList').querySelector('.pl-stat').textContent).toBe('⚠ 64h still unplanned');
  });

  it('copying a day pins both days', () => {
    openPlanner(saved({ plans: [auto()] }));
    app.$('dayPanel').querySelector('[data-step="15"]').click(); // today: 90, pinned
    app.$('copyDayBtn').click();
    expect(minutes([0, 1])).toEqual([90, 90]);
    expect(app.run(`planById('p1').pinned.sort()`)).toEqual([day(0), day(1)]);
    expect(ahead()).toBe(600);
  });

  it('a new plan is balanced right away when the box is ticked, and not when it is unticked', () => {
    const create = (ticked) => {
      openPlanner(saved());
      app.$('newPlanBtn').click();
      app.$('planName').value = 'Exam';
      app.$('planSubjects').querySelector('[data-subject="s1"]').click();
      app.$('planDeadline').value = day(10);
      app.$('planHours').value = '10';
      app.$('planAutoFill').checked = ticked;
      submit(app.$('planForm'));
      return app.saved();
    };
    let data = create(true);
    expect(data.plans[0].auto).toBe(true);
    expect(Object.keys(data.planned).sort()).toEqual(weekdays.map(day));
    app.close();
    data = create(false);
    expect(data.plans[0].auto).toBeFalsy();
    expect(data.planned).toEqual({});
  });

  it('the button spreads the missing hours of every plan and keeps them balanced', () => {
    openPlanner(saved({ plans: [plan(), plan({ id: 'old', subjectId: 's2', deadline: day(-1) })], planned: { [day(1)]: { p1: 600 } } }));
    expect(app.$('autoFillBtn').disabled).toBe(false); // p1 is planned by hand
    app.$('autoFillBtn').click();
    expect(app.state.plans[0].auto).toBe(true);
    expect(app.state.plans[1].auto).toBeFalsy(); // past its deadline
    expect(ahead()).toBe(600);
    expect(app.$('autoFillStatus').textContent).toContain('Done');
    expect(app.$('autoFillBtn').disabled).toBe(true); // nothing left to spread
  });

  it('the button says when a plan does not fit in the days left', () => {
    openPlanner(saved({ plans: [plan({ needMin: 6000, deadline: day(2) })] }));
    app.$('autoFillBtn').click();
    expect(app.$('autoFillStatus').textContent).toContain('1 plan doesn’t fit in the days left');
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
    expect(app.saved().history[day(-1)]).toEqual({ s1: 30 * MIN }); // the time studied stays, under the deleted subject
  });
});
