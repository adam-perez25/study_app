// Mini timer: shows the countdown sent by the main app and passes button clicks back to it.

const $ = (id) => document.getElementById(id);
let timer = null; // { type, label, blockText, endsAt, pausedRemaining, totalMs }

function fmtClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mmss = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return h ? `${h}:${mmss}` : mmss;
}

function render() {
  if (!timer) return;
  const paused = timer.pausedRemaining != null;
  const remaining = paused ? timer.pausedRemaining : timer.endsAt - Date.now();
  // Waiting after a break stays in the focus colour (not paused grey) so it catches your eye.
  document.body.className = `${timer.type}${paused && !timer.waiting ? ' paused' : ''}`;
  $('phase').textContent = timer.waiting ? 'Break’s over' : paused ? 'Paused' : timer.label;
  $('block').textContent = timer.waiting ? '· Press ▶'
    : timer.blockText ? `· ${timer.blockText}` : '';
  $('time').textContent = fmtClock(remaining);
  $('fill').style.width = `${Math.min(100, (1 - remaining / timer.totalMs) * 100)}%`;
  $('pauseBtn').textContent = paused ? '▶' : '⏸';
  $('pauseBtn').title = timer.waiting ? 'I’m back' : paused ? 'Resume' : 'Pause';
  document.title = timer.waiting ? 'Break’s over' : `${fmtClock(remaining)} · ${timer.label}`;
}

window.desktop.onTimer((snapshot) => {
  timer = snapshot;
  render();
});

$('pauseBtn').addEventListener('click', () => window.desktop.sendCommand('pause'));
$('skipBtn').addEventListener('click', () => window.desktop.sendCommand('skip'));
$('openBtn').addEventListener('click', () => window.desktop.sendCommand('open'));
$('closeBtn').addEventListener('click', () => window.desktop.sendCommand('close'));

setInterval(render, 250);
