const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eaDevtoolsControl', {
  openDevTools: () => ipcRenderer.invoke('ea:openDevTools'),
});
