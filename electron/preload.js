// Lok overlay preload — exposes a tiny, safe mascotAPI to the overlay renderer
// (move the window, show, hide). Nothing else from Node/Electron leaks in.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mascotAPI', {
  move: (x, y) => ipcRenderer.send('mascot:move', Math.round(x), Math.round(y)),
  show: () => ipcRenderer.send('mascot:show'),
  hide: () => ipcRenderer.send('mascot:hide'),
})
