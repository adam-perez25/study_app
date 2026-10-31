// Loads src/index.html + src/app.js into a fake browser page (jsdom), with a clock the test controls.
// app.js is used exactly as the app runs it, so nothing in the app had to change for the tests.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const SRC = path.join(__dirname, '..', '..', 'src');
const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');
const STORAGE_KEY = 'study-timer-v1';

// Wednesday 28 Oct 2026, 12:00 local time: away from midnight and week edges.
const DEFAULT_NOW = new Date(2026, 9, 28, 12, 0, 0).getTime();

// saved: data to put in storage before the app starts; rawSaved: the same, as a raw string.
// desktop: a stand-in for the Electron bridge (window.desktop); without it the app runs as in a plain browser.
function loadApp({ saved = null, rawSaved = null, now = DEFAULT_NOW, desktop = null } = {}) {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only' });
  const { window } = dom;

  // A Date whose "now" the test sets; new Date(y, m, d) etc. still work normally.
  window.eval(`(() => {
    const Real = Date;
    let now = ${now};
    class FakeDate extends Real {
      constructor(...a) { if (a.length) super(...a); else super(now); }
      static now() { return now; }
    }
    window.Date = FakeDate;
    window.__getNow = () => now;
    window.__setNow = (t) => { now = t; };
  })()`);

  // Browser bits jsdom doesn't have.
  window.scrollTo = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    if (this.onclose) this.onclose();
  };

  if (desktop) window.desktop = desktop;
  if (saved) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  if (rawSaved != null) window.localStorage.setItem(STORAGE_KEY, rawSaved);
  // Run as a real script (not eval), so top-level consts like `state` stay reachable afterwards.
  vm.runInContext(appJs, dom.getInternalVMContext(), { filename: 'app.js' });

  const app = {
    window,
    $: (id) => window.document.getElementById(id),
    run: (code) => window.eval(code),        // reach top-level functions and `state`
    get state() { return window.eval('state'); },
    saved: () => JSON.parse(window.localStorage.getItem(STORAGE_KEY)),
    now: () => window.__getNow(),
    setNow: (t) => window.__setNow(t),
    // Moves the clock forward and lets the timer notice, like the app's 250 ms tick does.
    advance(ms) { window.__setNow(window.__getNow() + ms); window.eval('tick()'); },
    close: () => window.close(),
  };
  return app;
}

const MIN = 60000;
// 'YYYY-MM-DD' for a day `offset` days from `now`, in local time (same format the app uses).
function dayKeyOffset(offset, now = DEFAULT_NOW) {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

module.exports = { loadApp, dayKeyOffset, DEFAULT_NOW, MIN, STORAGE_KEY };
