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
state.history ??= {};        // { 'YYYY-MM-DD': { subjectId | 'none': focused milliseconds } }
state.sessionCount ??= 0;
state.settings.dailyGoal ??= 60; // minutes
state.settings.autoStartFocus ??= true; // off: after a break, the next focus block waits for "I'm back"
state.settings.theme ??= 'system'; // 'system' (match Windows), 'light' or 'dark'
state.subjects ??= [];       // { id, name, color (0–7, see --subj-N in styles.css), hidden }
state.settings.subjectId ??= null; // last subject picked on the start screen
state.sessionLog ??= [];     // 'YYYY-MM-DD' of each completed session (older sessions weren't logged)
state.achievements ??= {};   // { achievementId: ISO date it was unlocked }
// Session details the history doesn't keep, for achievements. Only counted from this version on.
state.records = { tasksDone: 0, earlyStarts: 0, lateStarts: 0, longestSessionMs: 0, ...state.records };
state.settings.sound ??= {};       // chime: a key of CHIMES; volume: 0–1
state.settings.sound.chime ??= 'bells';
state.settings.sound.volume ??= 0.7;
state.settings.sound.muted ??= false;
// Days saved before subjects existed were plain totals; keep them as "no subject".
for (const [k, v] of Object.entries(state.history)) {
  if (typeof v === 'number') state.history[k] = { none: v };
}

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
  $('autoStartFocus').checked = state.settings.autoStartFocus;
  $('autoStartFocus').addEventListener('change', () => {
    state.settings.autoStartFocus = $('autoStartFocus').checked;
    save();
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

// ---------- Subjects ----------

const SUBJECT_COLORS = 8;
let newSubjectColor = 0;

function subjectById(id) { return state.subjects.find((s) => s.id === id) || null; }
function subjectColor(id) { const s = subjectById(id); return s ? `var(--subj-${s.color})` : 'var(--subj-none)'; }
function subjectName(id) { return subjectById(id)?.name || 'No subject'; }

// The picked subject, if it still exists and isn't hidden.
function currentSubjectId() {
  const s = subjectById(state.settings.subjectId);
  return s && !s.hidden ? s.id : null;
}

// First colour no visible subject uses yet, so new subjects look different from the others.
function nextFreeColor() {
  const used = new Set(state.subjects.filter((s) => !s.hidden).map((s) => s.color));
  for (let i = 0; i < SUBJECT_COLORS; i++) if (!used.has(i)) return i;
  return state.subjects.length % SUBJECT_COLORS;
}

function renderSubjectPicker() {
  const el = $('subjectPicker');
  el.innerHTML = '';
  const picked = currentSubjectId();
  for (const s of state.subjects.filter((x) => !x.hidden)) {
    const chip = document.createElement('button');
    chip.className = 'chip' + (s.id === picked ? ' selected' : '');
    chip.style.setProperty('--chip-color', subjectColor(s.id));
    chip.setAttribute('aria-pressed', s.id === picked);
    chip.innerHTML = `<span class="dot" style="background:${subjectColor(s.id)}"></span>`;
    chip.append(s.name);
    chip.addEventListener('click', () => {
      state.settings.subjectId = s.id === picked ? null : s.id; // click again to clear
      save();
      renderSubjectPicker();
    });
    el.appendChild(chip);
  }
  const add = document.createElement('button');
  add.className = 'chip add';
  add.textContent = '+ New subject';
  add.addEventListener('click', openSubjectForm);
  el.appendChild(add);

  // Only needed until the first subject exists; the chips explain themselves after that.
  const hasSubjects = state.subjects.some((s) => !s.hidden);
  $('subjectHint').hidden = hasSubjects;
  $('subjectHint').textContent = 'Optional. Add a subject to see how much time each one gets in your stats.';
  $('subjectPicker').title = picked ? 'Click the selected subject again to study without one' : '';
}

function renderSwatches() {
  const el = $('subjectSwatches');
  el.innerHTML = '';
  for (let i = 0; i < SUBJECT_COLORS; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = `var(--subj-${i})`;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', i === newSubjectColor);
    b.setAttribute('aria-label', `Colour ${i + 1}`);
    b.addEventListener('click', () => { newSubjectColor = i; renderSwatches(); });
    el.appendChild(b);
  }
}

function openSubjectForm() {
  newSubjectColor = nextFreeColor();
  renderSwatches();
  $('subjectForm').classList.remove('hidden');
  $('subjectName').value = '';
  $('subjectName').focus();
}

function initSubjects() {
  $('subjectForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('subjectName').value.trim();
    if (!name) return $('subjectName').focus();
    // Same name as an existing subject: show it again and pick it instead of adding a duplicate.
    let s = state.subjects.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (s) s.hidden = false;
    else {
      s = { id: `s${Date.now()}`, name, color: newSubjectColor, hidden: false };
      state.subjects.push(s);
    }
    state.settings.subjectId = s.id;
    save();
    $('subjectForm').classList.add('hidden');
    renderSubjectPicker();
  });
  $('subjectCancel').addEventListener('click', () => $('subjectForm').classList.add('hidden'));
  renderSubjectPicker();
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

const SCREENS = ['setup', 'session', 'done', 'stats', 'settings'];
function currentScreen() { return SCREENS.find((id) => !$(id).classList.contains('hidden')); }

function show(screen) {
  for (const id of SCREENS) $(id).classList.toggle('hidden', id !== screen);
  if (screen !== 'session') {
    document.title = 'Study Timer';
    setAccent('focus');
  }
  if (screen === 'setup') { renderTodayCard(); renderSubjectPicker(); }
  if (screen === 'stats') renderStats();
  if (screen === 'settings') { renderSettings(); renderSound(); }
  window.scrollTo(0, 0);
}

function setAccent(type) {
  document.documentElement.style.setProperty('--accent', `var(${COLORS[type]})`);
}

function startSession() {
  const blocks = buildPlan(state.settings);
  if (!blocks.length) return;
  state.session = { blocks, index: 0, endsAt: Date.now() + blocks[0].min * 60000, pausedRemaining: null, startedAt: Date.now(), focusedMs: 0, subjectId: currentSubjectId() };
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
  const day = (state.history[dayKey(new Date())] ??= {});
  const sid = s.subjectId || 'none';
  day[sid] = (day[sid] || 0) + elapsedMs;
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
    advanced = true;
    const next = s.blocks[s.index];
    if (next.type === 'focus' && !state.settings.autoStartFocus) {
      // Break's over: hold the focus block until "I'm back", so it doesn't run while you're away.
      s.waiting = true;
      s.pausedRemaining = next.min * 60000;
      break;
    }
    s.endsAt += next.min * 60000;
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
  $('phaseLabel').textContent = s.waiting ? 'Break’s over'
    : s.pausedRemaining != null ? `${LABELS[block.type]} · paused` : LABELS[block.type];
  $('timeLeft').textContent = fmtClock(remaining);
  $('ringProgress').style.strokeDasharray = RING_LEN;
  $('ringProgress').style.strokeDashoffset = RING_LEN * fraction;

  const focusIdx = s.blocks.slice(0, s.index + 1).filter((b) => b.type === 'focus').length;
  const focusTotal = s.blocks.filter((b) => b.type === 'focus').length;
  $('blockCount').textContent = s.waiting ? `Block ${focusIdx} of ${focusTotal} starts when you’re back`
    : block.type === 'focus' ? `Block ${focusIdx} of ${focusTotal}`
    : `Next: block ${focusIdx + 1} of ${focusTotal}`;

  const pill = $('subjectPill');
  pill.hidden = !s.subjectId;
  if (s.subjectId && pill.dataset.id !== s.subjectId) {
    pill.dataset.id = s.subjectId;
    pill.innerHTML = `<span class="dot" style="background:${subjectColor(s.subjectId)}"></span>`;
    pill.append(subjectName(s.subjectId));
  }

  const laterMs = s.blocks.slice(s.index + 1).reduce((a, b) => a + b.min * 60000, 0);
  $('totalLeft').textContent = `${fmtClock(remaining + laterMs)} left in the session`;

  renderPlanBar($('planLive'), s.blocks, s.index, fraction);
  $('pauseBtn').textContent = s.waiting ? 'I’m back' : s.pausedRemaining != null ? 'Resume' : 'Pause';
  document.body.classList.toggle('paused', s.pausedRemaining != null && !s.waiting);
  document.title = s.waiting ? 'Break’s over · Study Timer' : `${fmtClock(remaining)} · ${LABELS[block.type]}`;

  publishTimer({
    type: block.type,
    // Shorter wording so it fits the small window
    label: block.type === 'short' ? 'Break' : LABELS[block.type],
    blockText: block.type !== 'focus' ? ''
      : s.subjectId ? `${subjectName(s.subjectId)} · ${focusIdx}/${focusTotal}`
      : $('blockCount').textContent,
    endsAt: s.endsAt,
    pausedRemaining: s.pausedRemaining,
    waiting: !!s.waiting,
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

// Also "I'm back" when a focus block is waiting after a break.
function togglePause() {
  const s = state.session;
  if (s.pausedRemaining != null) {
    s.endsAt = Date.now() + s.pausedRemaining;
    s.pausedRemaining = null;
    s.waiting = false;
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
  // Skipping a focus block that was waiting means you're here: start the next block right away.
  if (s.pausedRemaining != null && !s.waiting) s.pausedRemaining = ms;
  else { s.pausedRemaining = null; s.endsAt = Date.now() + ms; }
  s.waiting = false;
  save();
  announce(s.blocks[s.index]);
  tick();
}

// Start time and length of a completed session, for "Early bird", "Night owl" and "Deep focus".
function recordSession(s) {
  const r = state.records;
  const h = new Date(s.startedAt).getHours();
  if (h >= 4 && h < 8) r.earlyStarts++;
  if (h >= 22 || h < 4) r.lateStarts++;
  r.longestSessionMs = Math.max(r.longestSessionMs, s.focusedMs);
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
  if (s.focusedMs > 0) {
    state.sessionCount++;
    state.sessionLog.push(dayKey(new Date()));
    recordSession(s);
  }
  // Each finished task counts once, even if it is unticked and ticked again before "New session".
  for (const t of state.tasks) {
    if (t.done && !t.counted) { t.counted = true; state.records.tasksDone++; }
  }
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
  const unlocked = checkAchievements();
  const list = $('doneAchievements');
  list.innerHTML = '';
  for (const a of unlocked) {
    const li = document.createElement('li');
    li.textContent = `${a.emoji} Achievement unlocked: ${a.name}!`;
    list.appendChild(li);
  }
  list.hidden = !unlocked.length;
  if (unlocked.length) {
    notify(unlocked.length === 1 ? 'Achievement unlocked 🏅' : `${unlocked.length} achievements unlocked 🏅`,
      unlocked.map((a) => a.name).join(', '));
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
    // Full screen and Do not disturb: also desktop only. The app leaves full screen when the session ends.
    $('fullscreenBtn').addEventListener('click', () => window.desktop.toggleFullScreen());
    window.desktop.onFullScreen((on) => {
      document.body.classList.toggle('fullscreen', on);
      $('fullscreenBtn').textContent = on ? '✕ Exit full screen' : '⛶ Full screen';
    });
    $('dndBtn').addEventListener('click', () => window.desktop.openDndSettings());
  } else {
    for (const id of ['miniBtn', 'miniHint', 'fullscreenBtn', 'dndBtn', 'dndHint']) $(id).hidden = true;
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
    // Esc leaves full screen, unless it is closing one of the app's popups.
    if (e.key === 'Escape' && document.body.classList.contains('fullscreen') && !$('confirmDialog').open) {
      window.desktop.exitFullScreen();
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

// Synthesized chimes, so no sound files are needed. Each one rises for focus, falls for a break
// and plays a longer phrase when the session is done. A note is one oscillator per voice
// (freq × mult, peak gain), with `step` seconds between notes, an `attack` and a fade out by `decay`.
const CHIMES = {
  bells: {
    name: 'Bells',
    notes: { focus: [523, 659, 784], break: [784, 659, 523], done: [523, 659, 784, 1047] },
    voices: [{ type: 'sine', mult: 1, gain: 0.3 }],
    step: 0.18, attack: 0.02, decay: 0.5,
  },
  soft: {
    name: 'Soft',
    notes: { focus: [262, 330, 392], break: [392, 330, 262], done: [262, 330, 392, 523] },
    voices: [{ type: 'triangle', mult: 1, gain: 0.25 }, { type: 'sine', mult: 2, gain: 0.05 }],
    step: 0.3, attack: 0.12, decay: 1.1,
  },
  digital: {
    name: 'Digital',
    notes: { focus: [880, 1320], break: [1320, 880], done: [880, 880, 1320, 1320, 1760] },
    voices: [{ type: 'square', mult: 1, gain: 0.07 }], // square waves sound much louder than sines
    step: 0.13, attack: 0.005, decay: 0.09,
  },
  marimba: {
    name: 'Marimba',
    notes: { focus: [392, 494, 587, 784], break: [784, 587, 494, 392], done: [392, 494, 587, 784, 587, 784] },
    // A quiet overtone four times higher gives the woody "tok" of a marimba bar.
    voices: [{ type: 'sine', mult: 1, gain: 0.32 }, { type: 'sine', mult: 4, gain: 0.06, decay: 0.08 }],
    step: 0.13, attack: 0.005, decay: 0.4,
  },
};

// Plays kind ('focus' | 'break' | 'done') with the chosen chime, unless sound is muted.
function chime(kind, chimeKey = state.settings.sound.chime) {
  const { volume, muted } = state.settings.sound;
  if (!audioCtx || muted || volume <= 0) return;
  const c = CHIMES[chimeKey] || CHIMES.bells;
  const level = volume / 0.7; // the default 70% plays each chime at its designed loudness
  c.notes[kind].forEach((freq, i) => {
    const t = audioCtx.currentTime + i * c.step;
    for (const v of c.voices) {
      const decay = v.decay ?? c.decay;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = v.type;
      osc.frequency.value = freq * v.mult;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, v.gain * level), t + c.attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + decay + 0.05);
    }
  });
}

// Sound card on the Settings screen, plus the quick mute button on the timer screen.
function setMuted(muted) {
  state.settings.sound.muted = muted;
  save();
  renderSound();
}

function renderSound() {
  const { chime: picked, volume, muted } = state.settings.sound;
  const btn = $('muteBtn');
  btn.textContent = muted ? '🔕' : '🔔';
  btn.title = muted ? 'Sound is off. Click to turn chimes back on' : 'Mute chimes (library mode)';
  btn.setAttribute('aria-pressed', muted);
  $('soundMuted').checked = muted;
  $('soundVolume').value = Math.round(volume * 100);
  $('soundVolumeText').textContent = `${Math.round(volume * 100)}%`;
  document.querySelectorAll('#chimeList input').forEach((r) => { r.checked = r.value === picked; });
  document.querySelectorAll('#chimeList .play').forEach((b) => {
    b.disabled = muted;
    b.title = muted ? 'Sound is muted' : 'Play a preview';
  });
}

function initSound() {
  const list = $('chimeList');
  for (const [key, c] of Object.entries(CHIMES)) {
    const li = document.createElement('li');
    const label = document.createElement('label');
    label.className = 'check';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'chime';
    radio.value = key;
    radio.addEventListener('change', () => {
      state.settings.sound.chime = key;
      save();
      unlockAudio();
      chime('focus', key);
    });
    label.append(radio, c.name);
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'play';
    play.textContent = '▶ Play';
    play.setAttribute('aria-label', `Play ${c.name}`);
    play.addEventListener('click', () => { unlockAudio(); chime('focus', key); });
    li.append(label, play);
    list.appendChild(li);
  }
  $('soundVolume').addEventListener('input', () => {
    state.settings.sound.volume = parseInt($('soundVolume').value, 10) / 100;
    $('soundVolumeText').textContent = `${$('soundVolume').value}%`;
    save();
  });
  // Preview once the slider is let go, so dragging it doesn't play a burst of chimes.
  $('soundVolume').addEventListener('change', () => { unlockAudio(); chime('focus'); });
  $('soundMuted').addEventListener('change', () => setMuted($('soundMuted').checked));
  $('muteBtn').addEventListener('click', () => setMuted(!state.settings.sound.muted));
  renderSound();
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
  if (block.type === 'focus' && state.session?.waiting) notify('Break’s over', 'Click “I’m back” when you’re ready to focus.');
  else if (block.type === 'focus') notify('Back to focus', `${block.min} minutes of study. You've got this.`);
  else notify(`${LABELS[block.type]} time`, `Take ${block.min} minutes to rest.`);
}

// ---------- Progress & stats ----------

const STREAK_MIN = 10; // minutes of focus needed for a day to count toward the streak
const LEVEL_TITLES = [
  'Beginner', 'Apprentice', 'Learner', 'Student', 'Scholar', 'Expert', 'Master', 'Sage', 'Legend', 'Grandmaster',
  'Virtuoso', 'Luminary', 'Oracle', 'Titan', 'Mythic', 'Ascendant', 'Immortal', 'Celestial', 'Eternal', 'Transcendent',
];
// Every 4 levels the level badge changes colour (see --tier-* in styles.css); Diamond is the last one.
const LEVEL_TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];
const pad = (n) => String(n).padStart(2, '0');

function dayKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d) { return addDays(d, -((d.getDay() + 6) % 7)); } // weeks start on Monday
function dayMs(k) { return Object.values(state.history[k] || {}).reduce((a, b) => a + b, 0); }
function minutesOn(d) { return dayMs(dayKey(d)) / 60000; }

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

  return { cur, best: Math.max(longestRun(STREAK_MIN * 60000), cur), studiedToday: minutesOn(today) >= STREAK_MIN };
}

// Most days in a row with at least minMs of focus each.
function longestRun(minMs) {
  let best = 0, run = 0, prev = null;
  for (const k of Object.keys(state.history).sort()) {
    if (dayMs(k) < minMs) continue;
    run = prev && dayKey(addDays(prev, 1)) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = parseKey(k);
  }
  return best;
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
    tier: LEVEL_TIERS[Math.min(Math.floor((level - 1) / 4), LEVEL_TIERS.length - 1)],
    fraction: (totalMin - from) / (to - from),
    toNext: to - totalMin,
  };
}

function totalMinutes() { return Object.keys(state.history).reduce((a, k) => a + dayMs(k), 0) / 60000; }

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
  $('levelTier').textContent = lvl.tier;
  $('levelCard').dataset.tier = lvl.tier.toLowerCase();
  $('levelMeter').style.width = `${lvl.fraction * 100}%`;
  $('levelNext').textContent = `${fmtDuration(lvl.toNext)} of study to reach level ${lvl.level + 1}`;

  renderBars(today, goal);
  renderHeatmap(today, goal);
  renderSubjectStats(today);
  renderAchievements();
  renderShareCard();

  let bestDay = null;
  for (const k of Object.keys(state.history)) if (!bestDay || dayMs(k) > bestDay[1]) bestDay = [k, dayMs(k)];
  $('recordDay').textContent = bestDay ? `${fmtDuration(bestDay[1] / 60000)} on ${fmtDay(parseKey(bestDay[0]))}` : '—';
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

let subjectPeriod = 'week';

// Focused time per subject between two days (inclusive), or over all time.
function subjectTotals(start, end) {
  const from = start ? dayKey(start) : '', to = end ? dayKey(end) : '9999';
  const totals = {};
  for (const [k, day] of Object.entries(state.history)) {
    if (k < from || k > to) continue;
    for (const [sid, ms] of Object.entries(day)) totals[sid] = (totals[sid] || 0) + ms;
  }
  return totals;
}

// One row per subject: visible subjects always (0 shows the one you're skipping),
// hidden ones and "No subject" only when they have time in the period.
function renderSubjectStats(today) {
  const start = subjectPeriod === 'week' ? startOfWeek(today)
    : subjectPeriod === 'month' ? new Date(today.getFullYear(), today.getMonth(), 1) : null;
  const totals = subjectTotals(start, start && today);
  const rows = state.subjects
    .filter((s) => !s.hidden || totals[s.id] > 0)
    .map((s) => ({ id: s.id, ms: totals[s.id] || 0 }));
  if (totals.none > 0) rows.push({ id: null, ms: totals.none });
  rows.sort((a, b) => b.ms - a.ms);

  const sum = rows.reduce((a, r) => a + r.ms, 0);
  const max = Math.max(1, ...rows.map((r) => r.ms));
  const el = $('subjectBars');
  el.innerHTML = '';
  if (!rows.length || (!sum && !state.subjects.length)) {
    el.innerHTML = '<div class="empty">Add subjects on the start screen to see where your time goes.</div>';
    return;
  }
  const period = { week: 'this week', month: 'this month', all: 'in total' }[subjectPeriod];
  for (const r of rows) {
    const min = r.ms / 60000;
    const pct = sum ? Math.round((r.ms / sum) * 100) : 0;
    const name = document.createElement('div');
    name.className = 'name';
    name.innerHTML = `<span class="dot" style="background:${subjectColor(r.id)}"></span>`;
    name.append(subjectName(r.id));
    const track = document.createElement('div');
    track.className = 'track';
    track.dataset.tip = `${subjectName(r.id)} · ${fmtDuration(min)} ${period}`;
    track.innerHTML = r.ms ? `<div class="fill" style="width:${(r.ms / max) * 100}%;background:${subjectColor(r.id)}"></div>` : '';
    const value = document.createElement('div');
    value.className = 'value';
    value.textContent = r.ms ? `${fmtShort(min)} · ${pct}%` : '0m';
    el.append(name, track, value);
  }
}

// Rename, recolour (click the dot to cycle) or hide subjects. Hiding keeps past time in stats.
function renderSubjectEdit() {
  const ul = $('subjectEditList');
  ul.innerHTML = '';
  if (!state.subjects.length) {
    ul.innerHTML = '<li class="empty">No subjects yet. Add one below.</li>';
    return;
  }
  for (const s of state.subjects) {
    const li = document.createElement('li');
    li.classList.toggle('is-hidden', s.hidden);
    const color = document.createElement('button');
    color.className = 'swatch';
    color.style.background = `var(--subj-${s.color})`;
    color.title = 'Change colour';
    color.setAttribute('aria-label', `Change colour of ${s.name}`);
    color.addEventListener('click', () => {
      s.color = (s.color + 1) % SUBJECT_COLORS;
      save();
      renderSubjectEdit();
    });
    const name = document.createElement('input');
    name.value = s.name;
    name.maxLength = 30;
    name.setAttribute('aria-label', 'Subject name');
    name.addEventListener('change', () => {
      const v = name.value.trim();
      if (v) s.name = v; else name.value = s.name;
      save();
    });
    const hide = document.createElement('button');
    hide.textContent = s.hidden ? 'Show' : 'Hide';
    hide.title = s.hidden ? 'Show it on the start screen again' : 'Remove it from the start screen (its time stays in your stats)';
    hide.addEventListener('click', () => {
      s.hidden = !s.hidden;
      if (s.hidden && state.settings.subjectId === s.id) state.settings.subjectId = null;
      save();
      renderSubjectEdit();
    });
    const del = document.createElement('button');
    del.className = 'danger';
    del.textContent = 'Delete';
    del.title = 'Delete it for good (its time stays in your stats as “No subject”)';
    del.addEventListener('click', () => deleteSubject(s));
    li.append(color, name, hide, del);
    ul.appendChild(li);
  }
}

// Removes a subject. The time studied for it moves to "No subject", so totals, streak and badges stay.
async function deleteSubject(s) {
  const ok = await askConfirm({
    title: `Delete “${s.name}”?`,
    text: 'The subject is removed everywhere. The time you studied for it stays in your stats as “No subject”. ' +
      'This can’t be undone.',
    yes: 'Delete subject',
    no: 'Cancel',
  });
  if (!ok) return;
  for (const day of Object.values(state.history)) {
    if (!day[s.id]) continue;
    day.none = (day.none || 0) + day[s.id];
    delete day[s.id];
  }
  state.subjects = state.subjects.filter((x) => x !== s);
  if (state.settings.subjectId === s.id) state.settings.subjectId = null;
  if (state.session?.subjectId === s.id) state.session.subjectId = null; // the rest of this session counts as "No subject"
  save();
  renderSubjectEdit();
  renderSubjectPicker();
}

// ---------- Achievements ----------

// Each badge unlocks once its metric (see achievementMetrics) reaches the goal.
const ACHIEVEMENTS = [
  ...[1, 10, 25, 50, 100, 250, 500, 1000].map((n) => ({
    id: `hours${n}`, emoji: '⏳', metric: 'hours', goal: n, unit: 'h',
    name: n === 1 ? '1 hour' : `${n} hours`, tip: `Focus for ${n} hour${n === 1 ? '' : 's'} in total`,
  })),
  ...[3, 7, 14, 30, 60, 100].map((n) => ({
    id: `streak${n}`, emoji: '🔥', metric: 'streak', goal: n, unit: 'days',
    name: `${n}-day streak`, tip: `Study at least ${STREAK_MIN} min a day for ${n} days in a row`,
  })),
  ...[1, 10, 50, 100, 250].map((n) => ({
    id: `sessions${n}`, emoji: '✅', metric: 'sessions', goal: n, unit: n === 1 ? 'session' : 'sessions',
    name: n === 1 ? 'First session' : `${n} sessions`, tip: n === 1 ? 'Complete your first session' : `Complete ${n} sessions`,
  })),
  { id: 'week5', emoji: '📅', metric: 'bestWeek', goal: 5, unit: 'sessions',
    name: 'Busy week', tip: 'Complete 5 sessions in one week (Monday to Sunday)' },
  { id: 'week10', emoji: '📅', metric: 'bestWeek', goal: 10, unit: 'sessions',
    name: 'Super busy week', tip: 'Complete 10 sessions in one week (Monday to Sunday)' },
  { id: 'goal7', emoji: '🎯', metric: 'goalDays', goal: 7, unit: 'days',
    name: 'Goal getter', tip: 'Reach your daily goal on 7 different days' },
  { id: 'goal30', emoji: '🎯', metric: 'goalDays', goal: 30, unit: 'days',
    name: 'Goal crusher', tip: 'Reach your daily goal on 30 different days' },
  { id: 'perfectWeek', emoji: '🗓️', metric: 'goalRun', goal: 7, unit: 'days',
    name: 'Perfect week', tip: 'Reach your daily goal 7 days in a row' },
  { id: 'earlyBird', emoji: '🌅', metric: 'earlyStarts', goal: 1, unit: 'session',
    name: 'Early bird', tip: 'Start a session between 4:00 and 8:00' },
  { id: 'nightOwl', emoji: '🦉', metric: 'lateStarts', goal: 1, unit: 'session',
    name: 'Night owl', tip: 'Start a session between 22:00 and 4:00' },
  { id: 'deepFocus', emoji: '🧠', metric: 'longestSession', goal: 90, unit: 'min',
    name: 'Deep focus', tip: 'Focus for 90 minutes in one session' },
  { id: 'marathon', emoji: '🏔️', metric: 'longestSession', goal: 180, unit: 'min',
    name: 'Marathon', tip: 'Focus for 3 hours in one session' },
  { id: 'bigDay', emoji: '💪', metric: 'bestDay', goal: 4, unit: 'h',
    name: 'Big day', tip: 'Focus for 4 hours in a single day' },
  { id: 'subjects3', emoji: '📚', metric: 'subjects', goal: 3, unit: 'subjects',
    name: 'Explorer', tip: 'Study 3 different subjects' },
  { id: 'subjects5', emoji: '📚', metric: 'subjects', goal: 5, unit: 'subjects',
    name: 'Polymath', tip: 'Study 5 different subjects' },
  { id: 'specialist', emoji: '🎓', metric: 'bestSubject', goal: 25, unit: 'h',
    name: 'Specialist', tip: 'Study one subject for 25 hours in total' },
  { id: 'weekend', emoji: '🎉', metric: 'weekends', goal: 1, unit: 'weekend',
    name: 'Weekend warrior', tip: `Study at least ${STREAK_MIN} min on both Saturday and Sunday of the same weekend` },
  { id: 'comeback', emoji: '🔄', metric: 'comebacks', goal: 1, unit: 'comeback',
    name: 'Comeback', tip: 'Study again after a break of 7 days or more' },
  ...[25, 100].map((n) => ({
    id: `tasks${n}`, emoji: '✔️', metric: 'tasksDone', goal: n, unit: 'tasks',
    name: n === 25 ? 'Task tackler' : 'Task master', tip: `Finish ${n} tasks`,
  })),
];

function achievementMetrics() {
  const perWeek = {};
  for (const k of state.sessionLog) {
    const w = dayKey(startOfWeek(parseKey(k)));
    perWeek[w] = (perWeek[w] || 0) + 1;
  }
  const goalMs = state.settings.dailyGoal * 60000;
  const studied = Object.keys(state.history).filter((k) => dayMs(k) >= STREAK_MIN * 60000).sort();
  const studiedSet = new Set(studied);
  const DAY = 86400000;
  const subjects = Object.entries(subjectTotals(null, null)).filter(([id, ms]) => id !== 'none' && ms > 0);
  return {
    hours: totalMinutes() / 60,
    streak: streaks().best,
    sessions: state.sessionCount,
    bestWeek: Math.max(0, ...Object.values(perWeek)),
    goalDays: Object.keys(state.history).filter((k) => dayMs(k) >= goalMs).length,
    goalRun: longestRun(goalMs),
    earlyStarts: state.records.earlyStarts,
    lateStarts: state.records.lateStarts,
    longestSession: state.records.longestSessionMs / 60000,
    bestDay: Math.max(0, ...Object.keys(state.history).map(dayMs)) / 3600000,
    subjects: subjects.length,
    bestSubject: Math.max(0, ...subjects.map(([, ms]) => ms)) / 3600000,
    // Saturdays studied whose Sunday was studied too.
    weekends: studied.filter((k) => parseKey(k).getDay() === 6 && studiedSet.has(dayKey(addDays(parseKey(k), 1)))).length,
    // Studied days with 7 or more days off before them (rounded: a DST change makes a day 23 or 25 h).
    comebacks: studied.filter((k, i) => i > 0 && Math.round((parseKey(k) - parseKey(studied[i - 1])) / DAY) > 7).length,
    tasksDone: state.records.tasksDone,
  };
}

// Records badges that are newly reached and returns them. Unlocked badges stay unlocked,
// even if the metric drops later (a broken streak, a reset goal).
function checkAchievements() {
  const m = achievementMetrics();
  const fresh = ACHIEVEMENTS.filter((a) => !state.achievements[a.id] && m[a.metric] >= a.goal);
  if (!fresh.length) return [];
  const now = new Date().toISOString();
  for (const a of fresh) state.achievements[a.id] = now;
  save();
  return fresh;
}

function renderAchievements() {
  const m = achievementMetrics();
  const el = $('achievementGrid');
  el.innerHTML = '';
  let count = 0;
  for (const a of ACHIEVEMENTS) {
    const value = m[a.metric];
    // Reached during a running session but not recorded yet: show it, the done screen announces it.
    const when = state.achievements[a.id] || (value >= a.goal ? new Date().toISOString() : null);
    if (when) count++;
    const badge = document.createElement('div');
    badge.className = 'badge' + (when ? ' unlocked' : '');
    const icon = document.createElement('div');
    icon.className = 'badge-icon';
    icon.textContent = a.emoji;
    const name = document.createElement('div');
    name.className = 'badge-name';
    name.textContent = a.name;
    const sub = document.createElement('div');
    sub.className = 'badge-sub';
    badge.append(icon, name, sub);
    if (when) {
      const date = new Date(when).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
      sub.textContent = date;
      badge.dataset.tip = `${a.tip} · unlocked ${date}`;
    } else {
      // Hours under 10 get one decimal, so the first badges show progress early on.
      const shown = a.unit === 'h' && value < 10 ? Math.floor(value * 10) / 10 : Math.floor(value);
      sub.textContent = `${shown}/${a.goal} ${a.unit}`;
      badge.dataset.tip = a.tip;
      const meter = document.createElement('div');
      meter.className = 'meter';
      meter.innerHTML = `<div class="meter-fill" style="width:${Math.min(100, (value / a.goal) * 100)}%"></div>`;
      badge.appendChild(meter);
    }
    el.appendChild(badge);
  }
  $('achievementCount').textContent = `${count} of ${ACHIEVEMENTS.length}`;
}

// ---------- Share cards ----------

// An image (and a text version) of your week or all-time stats, to send to friends.
let sharePeriod = 'week';
// Same colours as the level tiers in styles.css.
const TIER_COLORS = { Bronze: '#cd8a4f', Silver: '#9ea8b6', Gold: '#e6b422', Platinum: '#4fc3d9', Diamond: '#a78bfa' };

// Name of the subject with the most time between start and end (null, null: all time), or '—'.
function topSubjectName(start, end) {
  const top = Object.entries(subjectTotals(start, end))
    .filter(([id, ms]) => id !== 'none' && ms > 0)
    .sort((a, b) => b[1] - a[1])[0];
  return top ? subjectName(top[0]) : '—';
}

function shareData(period) {
  const today = new Date();
  const total = totalMinutes();
  const level = levelInfo(total);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const { cur, best } = streaks();

  if (period === 'week') {
    const start = startOfWeek(today);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const minutes = days.map(minutesOn);
    const keys = days.map(dayKey);
    const weekMin = minutes.reduce((a, b) => a + b, 0);
    return {
      period,
      title: 'My study week',
      range: `${fmtDay(start)} – ${fmtDay(days[6])}`,
      big: fmtShort(weekMin),
      bigLabel: 'of focus this week',
      stats: [
        ['Sessions', String(state.sessionLog.filter((k) => keys.includes(k)).length)],
        ['Days studied', `${minutes.filter((m) => m >= STREAK_MIN).length}/7`],
        ['Daily goal met', `${minutes.filter((m) => m >= state.settings.dailyGoal).length}/7`],
        ['Current streak', plural(cur, 'day')],
        ['Best day', fmtShort(Math.max(...minutes))],
        ['Top subject', topSubjectName(start, days[6])],
      ],
      bars: days.map((d, i) => ({ label: d.toLocaleDateString(LOCALE, { weekday: 'short' }), min: minutes[i] })),
      level,
    };
  }

  const first = Object.keys(state.history).filter((k) => dayMs(k) > 0).sort()[0];
  const studiedDays = Object.keys(state.history).filter((k) => dayMs(k) >= STREAK_MIN * 60000).length;
  return {
    period,
    title: 'My study journey',
    range: first ? `Since ${fmtDay(parseKey(first))}` : 'Just getting started',
    big: fmtShort(total),
    bigLabel: 'of focus in total',
    stats: [
      ['Sessions', String(state.sessionCount)],
      ['Days studied', String(studiedDays)],
      ['Best streak', plural(best, 'day')],
      ['Achievements', `${ACHIEVEMENTS.filter((a) => state.achievements[a.id]).length}/${ACHIEVEMENTS.length}`],
      ['Best day', fmtShort(Math.max(0, ...Object.keys(state.history).map(dayMs)) / 60000)],
      ['Top subject', topSubjectName(null, null)],
    ],
    bars: null,
    level,
  };
}

// The same card as plain text, for chats that don't take images.
function shareText(data) {
  return [
    `📚 ${data.title} (${data.range})`,
    `⏱️ ${data.big} ${data.bigLabel}`,
    ...data.stats.map(([label, value]) => `• ${label}: ${value}`),
    `⭐ Level ${data.level.level} · ${data.level.title} (${data.level.tier})`,
    '— Study Timer',
  ].join('\n');
}

// Draws the card on a 1080×1080 canvas, a square that fits most chat apps.
function drawShareCard(canvas, data) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return; // no canvas support (tests)
  const W = 1080, PAD = 80, FONT = '"Segoe UI", system-ui, sans-serif';
  const accent = TIER_COLORS[data.level.tier];
  canvas.width = canvas.height = W;

  const bg = ctx.createLinearGradient(0, 0, W, W);
  bg.addColorStop(0, '#1d2330');
  bg.addColorStop(1, '#2d3a57');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, W);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 14);

  const text = (str, x, y, size, color, { weight = 400, align = 'left' } = {}) => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(str, x, y);
  };
  const MUTED = '#9aa1ad', WHITE = '#ffffff';

  text('STUDY TIMER', PAD, 110, 28, accent, { weight: 700 });
  text(data.title, PAD, 190, 64, WHITE, { weight: 700 });
  text(data.range, PAD, 245, 34, MUTED);
  text(data.big, PAD, 420, 150, WHITE, { weight: 700 });
  text(data.bigLabel, PAD, 480, 38, MUTED);

  // Stats: 3 columns, 2 rows.
  const colW = (W - PAD * 2) / 3;
  data.stats.forEach(([label, value], i) => {
    const x = PAD + (i % 3) * colW, y = 590 + Math.floor(i / 3) * 120;
    let shown = value;
    ctx.font = `700 46px ${FONT}`;
    while (shown.length > 1 && ctx.measureText(shown).width > colW - 20) shown = shown.slice(0, -2) + '…';
    text(shown, x, y, 46, WHITE, { weight: 700 });
    text(label, x, y + 42, 26, MUTED);
  });

  const levelLine = `Level ${data.level.level} · ${data.level.title}`;
  if (data.bars) {
    // This week's days as bars; days that met the daily goal get the tier colour.
    const goal = state.settings.dailyGoal;
    const max = Math.max(goal, ...data.bars.map((b) => b.min));
    const top = 810, height = 120, slot = (W - PAD * 2) / 7, barW = slot * 0.6;
    data.bars.forEach((b, i) => {
      const x = PAD + i * slot + (slot - barW) / 2;
      const h = b.min ? Math.max(6, (b.min / max) * height) : 3;
      ctx.fillStyle = b.min >= goal ? accent : '#5b6578';
      ctx.fillRect(x, top + height - h, barW, h);
      text(b.label, x + barW / 2, top + height + 36, 24, MUTED, { align: 'center' });
    });
    text(levelLine, PAD, 1035, 30, WHITE, { weight: 600 });
  } else {
    // All time: the level with its progress bar.
    text(levelLine, PAD, 860, 48, WHITE, { weight: 700 });
    ctx.fillStyle = '#3a4560';
    ctx.fillRect(PAD, 890, W - PAD * 2, 22);
    ctx.fillStyle = accent;
    ctx.fillRect(PAD, 890, (W - PAD * 2) * data.level.fraction, 22);
    text(`${fmtDuration(data.level.toNext)} to level ${data.level.level + 1}`, PAD, 955, 28, MUTED);
  }
  // Tier pill, bottom right.
  ctx.font = `700 26px ${FONT}`;
  const pillW = ctx.measureText(data.level.tier.toUpperCase()).width + 40;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(W - PAD - pillW, 1000, pillW, 46, 23);
  ctx.fill();
  text(data.level.tier.toUpperCase(), W - PAD - pillW / 2, 1032, 26, '#1d2330', { weight: 700, align: 'center' });
}

function renderShareCard() {
  drawShareCard($('shareCanvas'), shareData(sharePeriod));
}

// Shows a short message next to the share buttons ("Copied!").
let shareStatusTimer = null;
function shareStatus(msg) {
  $('shareStatus').textContent = msg;
  clearTimeout(shareStatusTimer);
  shareStatusTimer = setTimeout(() => { $('shareStatus').textContent = ''; }, 2500);
}

function initShare() {
  document.querySelectorAll('#sharePeriod button').forEach((b) => {
    b.addEventListener('click', () => {
      sharePeriod = b.dataset.period;
      document.querySelectorAll('#sharePeriod button').forEach((x) => x.classList.toggle('active', x === b));
      renderShareCard();
    });
  });
  const fileName = () => `study-${sharePeriod === 'week' ? 'week' : 'all-time'}-${dayKey(new Date())}.png`;

  // The desktop app copies and saves through Electron; a plain browser uses its own clipboard and downloads.
  $('shareCopyImage').addEventListener('click', async () => {
    const url = $('shareCanvas').toDataURL('image/png');
    try {
      if (window.desktop) window.desktop.copyImage(url);
      else {
        const blob = await (await fetch(url)).blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      }
      shareStatus('Image copied! Paste it in a chat.');
    } catch { shareStatus('Couldn’t copy the image. Try Save image.'); }
  });
  $('shareSaveImage').addEventListener('click', async () => {
    const url = $('shareCanvas').toDataURL('image/png');
    if (window.desktop) {
      try {
        if (await window.desktop.saveImage(url, fileName())) shareStatus('Image saved.');
      } catch { shareStatus('Couldn’t save the image.'); }
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName();
      a.click();
    }
  });
  $('shareCopyText').addEventListener('click', async () => {
    const str = shareText(shareData(sharePeriod));
    try {
      if (window.desktop) window.desktop.copyText(str);
      else await navigator.clipboard.writeText(str);
      shareStatus('Text copied!');
    } catch { shareStatus('Couldn’t copy the text.'); }
  });
}

function initStats() {
  document.querySelectorAll('#subjectPeriod button').forEach((b) => {
    b.addEventListener('click', () => {
      subjectPeriod = b.dataset.period;
      document.querySelectorAll('#subjectPeriod button').forEach((x) => x.classList.toggle('active', x === b));
      renderSubjectStats(new Date());
    });
  });
  $('editSubjectsBtn').addEventListener('click', () => {
    openSettings();
    $('subjectsCard').scrollIntoView({ block: 'start' });
  });
  $('statsBtn').addEventListener('click', () => show('stats'));
  $('doneStatsBtn').addEventListener('click', () => show('stats'));
  $('statsBack').addEventListener('click', () => show(state.session ? 'session' : 'setup'));

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

// ---------- Settings ----------

// 'system' follows Windows' light/dark mode for apps; 'light' and 'dark' force one.
function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

let settingsReturn = 'setup'; // the screen Back goes to
function openSettings() {
  const from = currentScreen();
  if (from !== 'settings') settingsReturn = from;
  show('settings');
}

function renderSettings() {
  document.querySelectorAll('#themeChoice button').forEach((b) => {
    const on = b.dataset.theme === state.settings.theme;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on);
  });
  renderSubjectEdit();
  $('autoStartFocusSettings').checked = state.settings.autoStartFocus;
  $('goalInput').value = state.settings.dailyGoal;
}

function initSettings() {
  $('settingsBtn').addEventListener('click', openSettings);
  $('settingsBack').addEventListener('click', () => show(settingsReturn));

  document.querySelectorAll('#themeChoice button').forEach((b) => {
    b.addEventListener('click', () => {
      state.settings.theme = b.dataset.theme;
      save();
      applyTheme(state.settings.theme);
      renderSettings();
    });
  });

  $('settingsSubjectForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('settingsSubjectName').value.trim();
    if (!name) return $('settingsSubjectName').focus();
    const existing = state.subjects.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (existing) existing.hidden = false; // same name: show it again instead of adding a duplicate
    else state.subjects.push({ id: `s${Date.now()}`, name, color: nextFreeColor(), hidden: false });
    save();
    $('settingsSubjectName').value = '';
    renderSubjectEdit();
  });

  // Same setting as the tick box in Block settings on the start screen; keep both in step.
  $('autoStartFocusSettings').addEventListener('change', () => {
    state.settings.autoStartFocus = $('autoStartFocusSettings').checked;
    $('autoStartFocus').checked = state.settings.autoStartFocus;
    save();
  });

  $('resetStatsBtn').addEventListener('click', async () => {
    const reset = await askConfirm({
      title: 'Reset all stats?',
      text: 'This deletes your study history, streak, level, session count and achievements. ' +
        'Your tasks and settings stay. This can’t be undone.',
      yes: 'Reset stats',
      no: 'Cancel',
    });
    if (!reset) return;
    state.history = {};
    state.sessionCount = 0;
    state.sessionLog = [];
    state.achievements = {};
    state.records = { tasksDone: 0, earlyStarts: 0, lateStarts: 0, longestSessionMs: 0 };
    if (state.session) state.session.focusedMs = 0; // a running session starts counting from now
    save();
  });
  $('goalInput').addEventListener('change', () => {
    const v = parseInt($('goalInput').value, 10);
    state.settings.dailyGoal = Number.isFinite(v) ? Math.min(720, Math.max(5, v)) : 60;
    $('goalInput').value = state.settings.dailyGoal;
    save();
    if (!state.session) checkAchievements(); // a lower goal can complete "Goal getter" right away
  });
}

// ---------- Boot ----------

applyTheme(state.settings.theme);
bindTaskForm('taskForm', 'taskInput');
bindTaskForm('taskFormLive', 'taskInputLive');
initSetup();
initSubjects();
initSession();
initStats();
initShare();
initSettings();
initSound();
renderTasks();
renderTodayCard();
// Give badges you already qualify for without announcing them (e.g. the first run after updating).
// If a session is being resumed, they wait so its done screen can announce them.
if (!state.session) checkAchievements();
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
