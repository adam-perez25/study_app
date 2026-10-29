// Electron entry point: opens the app in its own desktop window, plus the floating mini timer.
const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

// Default window size, never larger than the screen's free space (minus the title bar).
const WIDTH = 1000;
const HEIGHT = 764;
const MINI_WIDTH = 280;
const MINI_HEIGHT = 112;

let mainWin = null;
let miniWin = null;
let miniAuto = false;   // true when the mini timer opened because the app was minimized
let miniPos = null;     // where the user last dragged the mini timer
let timer = null;       // latest timer snapshot from the app, or null when no session is running

const preload = path.join(__dirname, 'preload.js');

function createWindow() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  mainWin = new BrowserWindow({
    width: Math.min(WIDTH, area.width - 40),
    height: Math.min(HEIGHT, area.height - 60),
    useContentSize: true, // width/height are the page area, not counting the window frame
    minWidth: 420,
    minHeight: 560,
    title: 'Study Timer',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      preload,
      backgroundThrottling: false, // keep blocks switching on time while minimized
    },
  });
  mainWin.loadFile(path.join(__dirname, 'src', 'index.html'));
  // Icon and name Windows uses for this window's taskbar button (and when pinning it)
  mainWin.setAppDetails({
    appId: 'study-timer',
    appIconPath: path.join(__dirname, 'assets', 'icon.ico'),
    relaunchCommand: `"${process.execPath}" "${__dirname}"`,
    relaunchDisplayName: 'Study Timer',
  });

  mainWin.on('minimize', () => {
    if (timer && !miniWin) openMini(true);
  });
  mainWin.on('restore', () => {
    if (miniAuto) closeMini();
  });
  // Closing during a session: the app asks (in its own silent popup) whether to end the
  // session, saving the time studied, or keep going. It answers through 'close:answer'.
  let allowClose = false;
  mainWin.on('close', (e) => {
    if (allowClose || !timer) return;
    e.preventDefault();
    showMain();
    mainWin.webContents.send('command', 'confirm-close');
  });
  ipcMain.on('close:answer', (_e, endAndClose) => {
    if (!endAndClose || !mainWin) return;
    allowClose = true;
    mainWin.close();
  });
  mainWin.on('closed', () => {
    mainWin = null;
    closeMini();
  });
}

function openMini(auto) {
  if (miniWin) return miniWin.focus();
  miniAuto = auto;
  const area = screen.getPrimaryDisplay().workArea;
  miniWin = new BrowserWindow({
    width: MINI_WIDTH,
    height: MINI_HEIGHT,
    // Bottom-right corner by default, or wherever it was dragged last time
    x: miniPos ? miniPos.x : area.x + area.width - MINI_WIDTH - 16,
    y: miniPos ? miniPos.y : area.y + area.height - MINI_HEIGHT - 16,
    frame: false,
    thickFrame: false, // no invisible resize border around the frameless window
    resizable: false,
    minWidth: MINI_WIDTH, maxWidth: MINI_WIDTH,
    minHeight: MINI_HEIGHT, maxHeight: MINI_HEIGHT,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'Study Timer',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: { contextIsolation: true, preload },
  });
  miniWin.setAlwaysOnTop(true, 'floating');
  miniWin.loadFile(path.join(__dirname, 'src', 'mini.html'));
  miniWin.webContents.on('did-finish-load', () => miniWin?.webContents.send('timer', timer));
  // Stop at the screen edges while dragging, instead of sliding off screen
  miniWin.on('will-move', (e, newBounds) => {
    const fitted = fitOnScreen(newBounds);
    if (fitted.x !== newBounds.x || fitted.y !== newBounds.y) {
      e.preventDefault();
      miniWin.setBounds(fitted);
    }
  });
  miniWin.on('moved', () => {
    miniPos = fitOnScreen(miniWin.getBounds());
    miniWin.setBounds(miniPos);
  });
  miniWin.setBounds(fitOnScreen(miniWin.getBounds())); // in case the screen changed since last time
  miniWin.on('closed', () => { miniWin = null; });
}

// Pushes bounds back inside the free area (not under the taskbar) of the screen the
// mouse is on, so the mini timer can still be dragged across to a second monitor.
// Always returns the fixed size too: on scaled displays, reusing the reported size
// makes the window grow a little with every move.
function fitOnScreen(b) {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  return {
    x: Math.round(Math.min(Math.max(b.x, area.x), area.x + area.width - MINI_WIDTH)),
    y: Math.round(Math.min(Math.max(b.y, area.y), area.y + area.height - MINI_HEIGHT)),
    width: MINI_WIDTH,
    height: MINI_HEIGHT,
  };
}

function closeMini() {
  if (miniWin) miniWin.close();
  miniWin = null;
  miniAuto = false;
}

function showMain() {
  if (!mainWin) return;
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
}

// The app sends a snapshot whenever the timer changes (new block, pause, skip, end).
ipcMain.on('timer:update', (_e, snapshot) => {
  timer = snapshot;
  if (!timer) return closeMini();
  miniWin?.webContents.send('timer', timer);
});

ipcMain.on('mini:toggle', () => (miniWin ? closeMini() : openMini(false)));

// Buttons on the mini timer.
ipcMain.on('mini:command', (_e, cmd) => {
  if (cmd === 'open') {
    closeMini();
    showMain();
  } else if (cmd === 'close') {
    closeMini();
  } else {
    mainWin?.webContents.send('command', cmd); // pause / skip are handled by the app
  }
});

// Lets Windows group the taskbar button under the app's own name and icon.
app.setAppUserModelId('study-timer');

// Saved data has always lived in %APPDATA%\study-timer; keep it there now that the app
// has a display name ("Study Timer"), which would otherwise pick a new, empty folder.
if (path.basename(app.getPath('userData')) === app.getName()) {
  app.setPath('userData', path.join(app.getPath('appData'), 'study-timer'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
