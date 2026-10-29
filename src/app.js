// Study Timer — splits a study session into focus blocks with breaks between them.

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'study-timer-v1';

// ---------- Persistent state ----------

const state = load() || {
  settings: { hours: 1, minutes: 0, focusLen: 25, shortLen: 5, longLen: 15, longEvery: 4 },
  tasks: [],     // { id, text, done }
  session: null, // { blocks, index, endsAt, pausedRemaining, startedAt, focusedMs }
};
// Fields added after the first version; fill them in for saved data from older versions.
state.history ??= {};        // { 'YYYY-MM-DD': focused milliseconds }
state.sessionCount ??= 0;
state.settings.dailyGoal ??= 60; // minutes

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

// ---------- Session planning ----------

// Builds the list of blocks for a session. The total time includes breaks,
// and a session never ends on a break.
function buildPlan({ hours, minutes, focusLen, shortLen, longLen, longEvery }) {
  let remaining = hours * 60 + minutes;
  const blocks = [];
  let focusCount = 0;

  while (remaining > 0) {
    const focus = Math.min(focusLen, remaining);
    blocks.push({ type: 'focus', min: focus });
    focusCount++;
    remaining -= focus;
    if (remaining <= 0) break;

    const isLong = focusCount % longEvery === 0;
    const brk = isLong ? longLen : shortLen;
    // Too little time left for a break plus a useful block: add it to the last block.
    if (remaining - brk < 5) {
      blocks[blocks.length - 1].min += remaining;
      break;
    }
    blocks.push({ type: isLong ? 'long' : 'short', min: brk });
    remaining -= brk;
  }
  return blocks;
}

const LABELS = { focus: 'Focus', short: 'Short break', long: 'Long break' };
const COLORS = { focus: '--focus', short: '--break', long: '--long' };

function fmtClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mmss = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return h ? `${h}:${mmss}` : mmss;
}

function fmtMinutes(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function renderPlanBar(container, blocks, currentIndex = -1, currentFraction = 0) {
  container.innerHTML = '';
  blocks.forEach((b, i) => {
    const seg = document.createElement('div');
    seg.className = `seg ${b.type}`;
    seg.style.flexGrow = b.min;
    seg.title = `${LABELS[b.type]} · ${b.min} min`;
    if (currentIndex >= 0) {
      if (i < currentIndex) seg.classList.add('past');
      if (i === currentIndex) {
        seg.classList.add('current');
        const fill = document.createElement('div');
        fill.className = 'fill';
        fill.style.width = `${currentFraction * 100}%`;
        seg.appendChild(fill);
      }
    }
    container.appendChild(seg);
  });
}

// ---------- Setup screen ----------

const settingIds = ['hours', 'minutes', 'focusLen', 'shortLen', 'longLen', 'longEvery'];

function readSettings() {
  const s = {};
  for (const id of settingIds) {
    const input = $(id);
    const v = parseInt(input.value, 10);
    const min = parseInt(input.min, 10), max = parseInt(input.max, 10);
    s[id] = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
  }
  return s;
}

function updatePreview() {
  state.settings = { ...state.settings, ...readSettings() };
  save();
  const blocks = buildPlan(state.settings);
  renderPlanBar($('planPreview'), blocks);

  const focusBlocks = blocks.filter((b) => b.type === 'focus');
  const focusMin = focusBlocks.reduce((a, b) => a + b.min, 0);
  const total = state.settings.hours * 60 + state.settings.minutes;
  $('planSummary').textContent = total
    ? `${focusBlocks.length} focus block${focusBlocks.length === 1 ? '' : 's'} · ` +
      `${fmtMinutes(focusMin)} of focus · ${fmtMinutes(total - focusMin)} of breaks`
    : 'Choose how long you want to study.';
  $('startBtn').disabled = !total;

  document.querySelectorAll('#presets button').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.min) === total);
  });
}

function initSetup() {
  for (const id of settingIds) {
    $(id).value = state.settings[id];
    $(id).addEventListener('input', updatePreview);
  }
  document.querySelectorAll('#presets button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const min = Number(btn.dataset.min);
      $('hours').value = Math.floor(min / 60);
      $('minutes').value = min % 60;
      updatePreview();
    });
  });
  $('startBtn').addEventListener('click', startSession);
  $('newBtn').addEventListener('click', () => {
    // Keep unfinished tasks for the next session.
    state.tasks = state.tasks.filter((t) => !t.done);
    save();
    show('setup');
    renderTasks();
  });
  updatePreview();
}

// ---------- Tasks ----------

function addTask(text) {
  text = text.trim();
  if (!text) return;
  state.tasks.push({ id: Date.now() + Math.random(), text, done: false });
  save();
  renderTasks();
}

function bindTaskForm(formId, inputId) {
  $(formId).addEventListener('submit', (e) => {
    e.preventDefault();
    addTask($(inputId).value);
    $(inputId).value = '';
    $(inputId).focus();
  });
}

function renderTaskList(ul, { readonly = false } = {}) {
  ul.innerHTML = '';
  if (!state.tasks.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = readonly ? 'No tasks this session.' : 'No tasks yet — add what you want to work on.';
    ul.appendChild(li);
    return;
  }
  for (const task of state.tasks) {
    const li = document.createElement('li');
    li.classList.toggle('done', task.done);

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = task.done;
    cb.addEventListener('change', () => {
      task.done = cb.checked;
      save();
      renderTasks();
    });

    const span = document.createElement('span');
    span.textContent = task.text;

    li.append(cb, span);
    if (!readonly) {
      const del = document.createElement('button');
      del.className = 'del';
      del.title = 'Remove task';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        state.tasks = state.tasks.filter((t) => t !== task);
        save();
        renderTasks();
      });
      li.appendChild(del);
    }
    ul.appendChild(li);
  }
}

function renderTasks() {
  renderTaskList($('taskListSetup'));
  renderTaskList($('taskListLive'));
  renderTaskList($('taskListDone'), { readonly: true });
}

// ---------- Running session ----------

let tickHandle = null;
const RING_LEN = 2 * Math.PI * 90;

function show(screen) {
  for (const id of ['setup', 'session', 'done', 'stats']) $(id).classList.toggle('hidden', id !== screen);
  if (screen !== 'session') {
    document.title = 'Study Timer';
    setAccent('focus');
  }
  if (screen === 'setup') renderTodayCard();
  if (screen === 'stats') renderStats();
  window.scrollTo(0, 0);
}

function setAccent(type) {
  document.documentElement.style.setProperty('--accent', `var(${COLORS[type]})`);
}

function startSession() {
  const blocks = buildPlan(state.settings);
  if (!blocks.length) return;
  state.session = { blocks, index: 0, endsAt: Date.now() + blocks[0].min * 60000, pausedRemaining: null, startedAt: Date.now(), focusedMs: 0 };
  save();
  requestNotificationPermission();
  unlockAudio();
  runSession();
}

function runSession() {
  show('session');
  clearInterval(tickHandle);
  tickHandle = setInterval(tick, 250);
  tick();
}

// Adds the time spent in the current block to the session's focus total, if it is a focus block.
function creditFocus(elapsedMs) {
  const s = state.session;
  if (s.blocks[s.index].type !== 'focus' || elapsedMs <= 0) return;
  s.focusedMs = (s.focusedMs || 0) + elapsedMs;
  const key = dayKey(new Date());
  state.history[key] = (state.history[key] || 0) + elapsedMs;
}

function elapsedInBlock() {
  return state.session.blocks[state.session.index].min * 60000 - currentRemaining();
}

function currentRemaining() {
  const s = state.session;
  return s.pausedRemaining != null ? s.pausedRemaining : s.endsAt - Date.now();
}

function tick() {
  const s = state.session;
  if (!s) return;

  // Catch up on any blocks that finished (e.g. while the laptop was asleep).
  let advanced = false;
  while (s.pausedRemaining == null && Date.now() >= s.endsAt) {
    if (s.index >= s.blocks.length - 1) return finishSession();
    creditFocus(s.blocks[s.index].min * 60000);
    s.index++;
    s.endsAt += s.blocks[s.index].min * 60000;
    advanced = true;
  }
  if (advanced) {
    save();
    announce(s.blocks[s.index]);
  }
  // Remember the app was still running, so a session can be frozen at this point if it quits unexpectedly.
  if (Date.now() - (s.lastSeen || 0) > 5000) {
    s.lastSeen = Date.now();
    save();
  }

  const block = s.blocks[s.index];
  const totalMs = block.min * 60000;
  const remaining = currentRemaining();
  const fraction = 1 - remaining / totalMs;

  setAccent(block.type);
  $('phaseLabel').textContent = s.pausedRemaining != null ? `${LABELS[block.type]} · paused` : LABELS[block.type];
  $('timeLeft').textContent = fmtClock(remaining);
  $('ringProgress').style.strokeDasharray = RING_LEN;
  $('ringProgress').style.strokeDashoffset = RING_LEN * fraction;

  const focusIdx = s.blocks.slice(0, s.index + 1).filter((b) => b.type === 'focus').length;
  const focusTotal = s.blocks.filter((b) => b.type === 'focus').length;
  $('blockCount').textContent = block.type === 'focus'
    ? `Block ${focusIdx} of ${focusTotal}`
    : `Next: block ${focusIdx + 1} of ${focusTotal}`;

  const laterMs = s.blocks.slice(s.index + 1).reduce((a, b) => a + b.min * 60000, 0);
  $('totalLeft').textContent = `${fmtClock(remaining + laterMs)} left in the session`;

  renderPlanBar($('planLive'), s.blocks, s.index, fraction);
  $('pauseBtn').textContent = s.pausedRemaining != null ? 'Resume' : 'Pause';
  document.body.classList.toggle('paused', s.pausedRemaining != null);
  document.title = `${fmtClock(remaining)} · ${LABELS[block.type]}`;

  publishTimer({
    type: block.type,
    // Shorter wording so it fits the small window
    label: block.type === 'short' ? 'Break' : LABELS[block.type],
    blockText: block.type === 'focus' ? $('blockCount').textContent : '',
    endsAt: s.endsAt,
    pausedRemaining: s.pausedRemaining,
    totalMs,
  });
}

// Sends the timer to the desktop app (for the mini timer) whenever it changes.
let lastPublished = '';
function publishTimer(snapshot) {
  if (!window.desktop) return;
  const json = JSON.stringify(snapshot);
  if (json === lastPublished) return;
  lastPublished = json;
  window.desktop.updateTimer(snapshot);
}

function togglePause() {
  const s = state.session;
  if (s.pausedRemaining != null) {
    s.endsAt = Date.now() + s.pausedRemaining;
    s.pausedRemaining = null;
  } else {
    s.pausedRemaining = s.endsAt - Date.now();
  }
  save();
  tick();
}

function skipBlock() {
  const s = state.session;
  if (s.index >= s.blocks.length - 1) return finishSession(true);
  creditFocus(elapsedInBlock());
  s.index++;
  const ms = s.blocks[s.index].min * 60000;
  if (s.pausedRemaining != null) s.pausedRemaining = ms;
  else s.endsAt = Date.now() + ms;
  save();
  announce(s.blocks[s.index]);
  tick();
}

function finishSession(early = false) {
  clearInterval(tickHandle);
  const s = state.session;
  const done = state.tasks.filter((t) => t.done).length;
  creditFocus(early ? elapsedInBlock() : s.blocks[s.index].min * 60000);
  const studied = Math.round(s.focusedMs / 60000);
  $('doneSummary').textContent =
    `${early ? 'Session ended early. ' : ''}You completed ${fmtMinutes(studied)} of focus` +
    (state.tasks.length ? ` and ${done} of ${state.tasks.length} task${state.tasks.length === 1 ? '' : 's'}.` : '.');
  if (s.focusedMs > 0) state.sessionCount++;
  state.session = null;
  save();
  publishTimer(null);
  const { cur } = streaks();
  $('doneStreak').textContent =
    `Today: ${fmtMinutes(Math.round(minutesOn(new Date())))} · ` +
    (cur ? `🔥 ${cur}-day streak` : `Study ${STREAK_MIN} min in a day to start a streak`);
  if (!early) {
    chime('done');
    notify('Session complete', 'Great work! Time to rest.');
  }
  document.body.classList.remove('paused');
  renderTasks();
  show('done');
}

function initSession() {
  $('pauseBtn').addEventListener('click', togglePause);
  $('skipBtn').addEventListener('click', skipBlock);

  // Mini timer: only available in the desktop app, not in a plain browser.
  if (window.desktop) {
    $('miniBtn').addEventListener('click', () => window.desktop.toggleMini());
    window.desktop.onCommand((cmd) => {
      if (!state.session) return;
      if (cmd === 'pause') togglePause();
      if (cmd === 'skip') skipBlock();
      if (cmd === 'confirm-close') confirmClose();
    });
  } else {
    $('miniBtn').hidden = true;
    $('miniHint').hidden = true;
  }
  $('endBtn').addEventListener('click', async () => {
    const end = await askConfirm({
      title: 'End this session now?',
      text: 'The time you have focused so far is saved.',
      yes: 'End session',
      no: 'Keep studying',
    });
    if (end && state.session) finishSession(true);
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && state.session && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      togglePause();
    }
  });
}

// The app's own yes/no popup. Resolves true for "yes"; Esc or "no" resolve false.
function askConfirm({ title, text, yes, no }) {
  const dlg = $('confirmDialog');
  if (dlg.open) return Promise.resolve(false);
  $('confirmTitle').textContent = title;
  $('confirmText').textContent = text;
  $('confirmYes').textContent = yes;
  $('confirmNo').textContent = no;
  return new Promise((resolve) => {
    const done = (answer) => {
      $('confirmYes').onclick = $('confirmNo').onclick = dlg.onclose = null;
      if (dlg.open) dlg.close();
      resolve(answer);
    };
    $('confirmYes').onclick = () => done(true);
    $('confirmNo').onclick = () => done(false);
    dlg.onclose = () => done(false); // Esc
    dlg.showModal();
  });
}

// Closing the window during a session (asked by the desktop app).
async function confirmClose() {
  const end = await askConfirm({
    title: 'A study session is running',
    text: 'Closing the app ends the session. The time you have focused so far is saved.',
    yes: 'End session and close',
    no: 'Keep studying',
  });
  if (end && state.session) finishSession(true);
  window.desktop.answerClose(end);
}

// ---------- Sound & notifications ----------

let audioCtx = null;
function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume();
  } catch { audioCtx = null; }
}

// A short synthesized chime, so no sound files are needed.
function chime(kind) {
  if (!audioCtx) return;
  const notes = kind === 'focus' ? [523, 659, 784] : kind === 'done' ? [523, 659, 784, 1047] : [784, 659, 523];
  notes.forEach((freq, i) => {
    const t = audioCtx.currentTime + i * 0.18;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.55);
  });
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}

function notify(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body, silent: true }); } catch { /* not supported */ }
  }
}

function announce(block) {
  chime(block.type === 'focus' ? 'focus' : 'break');
  if (block.type === 'focus') notify('Back to focus', `${block.min} minutes of study. You've got this.`);
  else notify(`${LABELS[block.type]} time`, `Take ${block.min} minutes to rest.`);
}

// ---------- Progress & stats ----------

const STREAK_MIN = 10; // minutes of focus needed for a day to count toward the streak
const LEVEL_TITLES = ['Beginner', 'Apprentice', 'Learner', 'Student', 'Scholar', 'Expert', 'Master', 'Sage', 'Legend'];
const pad = (n) => String(n).padStart(2, '0');

function dayKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d) { return addDays(d, -((d.getDay() + 6) % 7)); } // weeks start on Monday
function minutesOn(d) { return (state.history[dayKey(d)] || 0) / 60000; }

function minutesBetween(start, end) { // inclusive
  let total = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) total += minutesOn(d);
  return total;
}

function fmtDuration(min) { return fmtMinutes(Math.round(min)); }
// Compact form for the big stat numbers: "3h 54m".
function fmtShort(min) {
  min = Math.round(min);
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}
const LOCALE = 'en-GB';
function fmtDay(d) { return d.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }); }

function streaks() {
  const today = new Date();
  // Today only breaks the streak once it's over, so count back from yesterday until you study.
  let d = minutesOn(today) >= STREAK_MIN ? today : addDays(today, -1);
  let cur = 0;
  while (minutesOn(d) >= STREAK_MIN) { cur++; d = addDays(d, -1); }

  let best = 0, run = 0, prev = null;
  for (const k of Object.keys(state.history).sort()) {
    if (state.history[k] < STREAK_MIN * 60000) continue;
    run = prev && dayKey(addDays(prev, 1)) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = parseKey(k);
  }
  return { cur, best: Math.max(best, cur), studiedToday: minutesOn(today) >= STREAK_MIN };
}

// Level L is reached after L·(L−1) hours: 2 h, 6 h, 12 h, 20 h, 30 h…
function levelInfo(totalMin) {
  const hours = totalMin / 60;
  let level = 1;
  while (hours >= (level + 1) * level) level++;
  const from = level * (level - 1) * 60, to = (level + 1) * level * 60;
  return {
    level,
    title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
    fraction: (totalMin - from) / (to - from),
    toNext: to - totalMin,
  };
}

function totalMinutes() { return Object.values(state.history).reduce((a, b) => a + b, 0) / 60000; }

function renderTodayCard() {
  const goal = state.settings.dailyGoal;
  const today = minutesOn(new Date());
  const { cur, studiedToday } = streaks();
  $('streakNum').textContent = cur;
  $('todayText').textContent = `${fmtDuration(today)} / ${fmtDuration(goal)}`;
  $('todayMeter').style.width = `${Math.min(100, (today / goal) * 100)}%`;
  $('todayCard').classList.toggle('cold', !studiedToday);
  $('streakHint').textContent = today >= goal
    ? 'Daily goal reached. Great work!'
    : studiedToday
      ? `${fmtDuration(goal - today)} to reach today's goal.`
      : cur
        ? `Study ${STREAK_MIN} min today to keep your ${cur}-day streak alive.`
        : `Study ${STREAK_MIN} min today to start a streak.`;
}

function renderStats() {
  const today = new Date();
  const weekStart = startOfWeek(today);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const goal = state.settings.dailyGoal;

  const todayMin = minutesOn(today);
  const weekMin = minutesBetween(weekStart, today);
  const monthMin = minutesBetween(monthStart, today);
  const total = totalMinutes();
  // Same span of last week (Monday up to the same weekday), so the comparison is fair.
  const lastWeekMin = minutesBetween(addDays(weekStart, -7), addDays(today, -7));
  const daysIntoMonth = today.getDate();

  $('statToday').textContent = fmtShort(todayMin);
  $('statTodaySub').textContent = `${Math.round((todayMin / goal) * 100)}% of daily goal`;
  $('statWeek').textContent = fmtShort(weekMin);
  const diff = weekMin - lastWeekMin;
  $('statWeekSub').textContent = Math.abs(diff) < 1
    ? 'Same as this point last week'
    : `${diff > 0 ? '▲' : '▼'} ${fmtDuration(Math.abs(diff))} vs this point last week`;
  $('statWeekSub').className = 'tile-sub ' + (diff >= 1 ? 'up' : diff <= -1 ? 'down' : '');
  $('statMonth').textContent = fmtShort(monthMin);
  $('statMonthSub').textContent = `${fmtDuration(monthMin / daysIntoMonth)} a day on average`;
  $('statTotal').textContent = fmtShort(total);
  $('statTotalSub').textContent = `${state.sessionCount} session${state.sessionCount === 1 ? '' : 's'}`;

  const { cur, best, studiedToday } = streaks();
  $('streakCur').textContent = cur;
  $('streakBest').textContent = `Best: ${best} day${best === 1 ? '' : 's'}`;
  $('streakCard').classList.toggle('cold', !studiedToday);
  $('motivation').textContent =
    !total ? 'Your first session is the hardest one. Start with just 25 minutes.'
    : diff >= 1 ? `You're ${fmtDuration(diff)} ahead of last week. Keep it going!`
    : !studiedToday && cur ? `Don't break the chain: ${STREAK_MIN} minutes today keeps your streak alive.`
    : diff <= -1 ? `${fmtDuration(-diff)} behind last week. One more session closes the gap.`
    : 'Consistency beats intensity. A little every day adds up.';

  const lvl = levelInfo(total);
  $('levelName').textContent = `Level ${lvl.level} · ${lvl.title}`;
  $('levelMeter').style.width = `${lvl.fraction * 100}%`;
  $('levelNext').textContent = `${fmtDuration(lvl.toNext)} of study to reach level ${lvl.level + 1}`;

  renderBars(today, goal);
  renderHeatmap(today, goal);

  let bestDay = null;
  for (const [k, ms] of Object.entries(state.history)) if (!bestDay || ms > bestDay[1]) bestDay = [k, ms];
  $('recordDay').textContent = bestDay ? `${fmtDuration(bestDay[1] / 60000)} on ${fmtDay(parseKey(bestDay[0]))}` : '—';
  $('goalInput').value = goal;
}

// Last 14 days, one bar per day, with the daily goal as a reference line.
function renderBars(today, goal) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const values = days.map(minutesOn);
  const max = Math.max(goal, ...values) * 1.1;
  const el = $('bars');
  el.innerHTML = '';
  days.forEach((d, i) => {
    const col = document.createElement('div');
    col.className = 'bar-col';
    col.dataset.tip = `${fmtDay(d)} · ${fmtDuration(values[i])}`;
    const bar = document.createElement('div');
    bar.className = 'bar' + (values[i] >= goal ? ' met' : '');
    bar.style.height = values[i] ? `max(3px, ${(values[i] / max) * 100}%)` : '0';
    const label = document.createElement('span');
    label.className = 'bar-label';
    label.textContent = i === 13 ? 'Today' : d.toLocaleDateString(LOCALE, { weekday: 'narrow' });
    col.append(bar, label);
    el.appendChild(col);
  });
  const line = document.createElement('div');
  line.className = 'goal-line';
  line.style.bottom = `${(goal / max) * 140 + 20}px`; // plot is 140px tall above a 20px label row
  line.innerHTML = `<span>Goal ${fmtDuration(goal)}</span>`;
  el.appendChild(line);
}

// Calendar of the last 20 weeks; darker means closer to (or past) the daily goal.
function renderHeatmap(today, goal) {
  const el = $('heatmap');
  el.innerHTML = '';
  const start = addDays(startOfWeek(today), -19 * 7);
  for (let w = 0; w < 20; w++) {
    const col = document.createElement('div');
    col.className = 'heat-col';
    for (let dow = 0; dow < 7; dow++) {
      const d = addDays(start, w * 7 + dow);
      const cell = document.createElement('div');
      if (d > today) {
        cell.className = 'heat-cell future';
      } else {
        const min = minutesOn(d);
        const lvl = min <= 0 ? 0 : min < goal / 3 ? 1 : min < (goal * 2) / 3 ? 2 : min < goal ? 3 : 4;
        cell.className = `heat-cell l${lvl}`;
        cell.dataset.tip = `${fmtDay(d)} · ${fmtDuration(min)}`;
      }
      col.appendChild(cell);
    }
    el.appendChild(col);
  }
}

function initStats() {
  $('statsBtn').addEventListener('click', () => show('stats'));
  $('doneStatsBtn').addEventListener('click', () => show('stats'));
  $('statsBack').addEventListener('click', () => show(state.session ? 'session' : 'setup'));
  $('resetStatsBtn').addEventListener('click', async () => {
    const reset = await askConfirm({
      title: 'Reset all stats?',
      text: 'This deletes your study history, streak, level and session count. ' +
        'Your tasks and settings stay. This can’t be undone.',
      yes: 'Reset stats',
      no: 'Cancel',
    });
    if (!reset) return;
    state.history = {};
    state.sessionCount = 0;
    if (state.session) state.session.focusedMs = 0; // a running session starts counting from now
    save();
    renderStats();
  });
  $('goalInput').addEventListener('change', () => {
    const v = parseInt($('goalInput').value, 10);
    state.settings.dailyGoal = Number.isFinite(v) ? Math.min(720, Math.max(5, v)) : 60;
    save();
    renderStats();
  });

  // One shared tooltip for every chart mark with a data-tip.
  const tip = $('tooltip');
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.dataset.tip;
    tip.hidden = false;
    const r = t.getBoundingClientRect();
    const left = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2));
    tip.style.left = `${left}px`;
    tip.style.top = `${r.top - tip.offsetHeight - 8}px`;
  });
}

// ---------- Boot ----------

bindTaskForm('taskForm', 'taskInput');
bindTaskForm('taskFormLive', 'taskInputLive');
initSetup();
initSession();
initStats();
renderTasks();
renderTodayCard();
// A session saved while the app wasn't running (crash, battery died): stop the clock where the
// app last was, so time spent with the app closed isn't counted as study. It reopens paused.
function freezeStaleSession() {
  const s = state.session;
  if (s.pausedRemaining != null || !s.lastSeen || Date.now() - s.lastSeen < 30000) return;
  while (s.lastSeen >= s.endsAt && s.index < s.blocks.length - 1) {
    creditFocus(s.blocks[s.index].min * 60000);
    s.index++;
    s.endsAt += s.blocks[s.index].min * 60000;
  }
  s.pausedRemaining = Math.max(0, s.endsAt - s.lastSeen);
  save();
}

if (state.session) {
  freezeStaleSession();
  unlockAudio();
  runSession(); // resume a session that was open when the app closed
}
