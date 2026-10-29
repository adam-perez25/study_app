// Run with Electron (see make-shortcut.ps1). Creates the desktop and Start Menu shortcuts
// with the app's ID. Windows takes the taskbar icon from the Start Menu shortcut that has
// the app's ID, so without it the taskbar shows Electron's icon.
const { app, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const startMenu = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
const links = [
  path.join(app.getPath('desktop'), 'Study Timer.lnk'),
  path.join(startMenu, 'Study Timer.lnk'),
];

app.whenReady().then(() => {
  for (const link of links) {
    const ok = shell.writeShortcutLink(link, 'create', {
      target: process.execPath, // electron.exe
      args: `"${root}"`,
      cwd: root,
      icon: path.join(root, 'assets', 'icon.ico'),
      iconIndex: 0,
      description: 'Study Timer',
      appUserModelId: 'study-timer', // must match app.setAppUserModelId in main.js
    });
    console.log(ok ? `Created ${link}` : `Could not create ${link}`);
  }
  // Electron makes this one by itself (with its own icon) if the app shows a notification
  // before a proper shortcut exists. Remove it if it points at this app.
  const stray = path.join(startMenu, 'Electron.lnk');
  try {
    if (fs.existsSync(stray) && shell.readShortcutLink(stray).appUserModelId === 'study-timer') {
      fs.unlinkSync(stray);
      console.log(`Removed ${stray}`);
    }
  } catch { /* not ours or unreadable: leave it */ }
  app.quit();
});
