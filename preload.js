// Bridge between the pages and Electron. Pages see it as `window.desktop`;
// in a plain browser it doesn't exist and the app works without the mini timer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  // Main app
  updateTimer: (snapshot) => ipcRenderer.send('timer:update', snapshot),
  toggleMini: () => ipcRenderer.send('mini:toggle'),
  onCommand: (cb) => ipcRenderer.on('command', (_e, cmd) => cb(cmd)),
  answerClose: (endAndClose) => ipcRenderer.send('close:answer', endAndClose),
  // Mini timer
  onTimer: (cb) => ipcRenderer.on('timer', (_e, snapshot) => cb(snapshot)),
  sendCommand: (cmd) => ipcRenderer.send('mini:command', cmd),
});
