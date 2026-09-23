const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('eloDesktop', {
  getConfig: () => ipcRenderer.invoke('elo:config'),
  saveServer: url => ipcRenderer.invoke('elo:server', url),
  connectLol: code => ipcRenderer.invoke('elo:lol', code),
  disconnectLol: () => ipcRenderer.invoke('elo:stop'),
  settings: () => ipcRenderer.invoke('elo:settings')
});
