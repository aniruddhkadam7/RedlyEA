const { contextBridge, ipcRenderer } = require("electron");

// Map renderer handlers to their IPC wrappers so offStatus can unregister them.
const _statusListenerMap = new WeakMap();

contextBridge.exposeInMainWorld("eaDesktop", {
  saveProject: (args) => ipcRenderer.invoke("ea:saveProject", args),
  openProject: () => ipcRenderer.invoke("ea:openProject"),
  openProjectAtPath: (filePath) =>
    ipcRenderer.invoke("ea:openProjectAtPath", { filePath }),
  openFileDialog: () => ipcRenderer.invoke("ea:openProject"),
  pickProjectFolder: () => ipcRenderer.invoke("ea:pickProjectFolder"),
  listManagedRepositories: () =>
    ipcRenderer.invoke("ea:listManagedRepositories"),
  loadManagedRepository: (repositoryId) =>
    ipcRenderer.invoke("ea:loadManagedRepository", { repositoryId }),
  saveManagedRepository: (args) =>
    ipcRenderer.invoke("ea:saveManagedRepository", args),
  exportRepository: (args) => ipcRenderer.invoke("ea:exportRepository", args),
  consumePendingRepositoryImports: () =>
    ipcRenderer.invoke("ea:consumePendingRepositoryImports"),
  onRepositoryPackageImport: (handler) => {
    ipcRenderer.on("ea:repositoryPackageImport", (_event, payload) =>
      handler(payload),
    );
  },
  importLegacyProjectAtPath: (filePath) =>
    ipcRenderer.invoke("ea:importLegacyProjectAtPath", { filePath }),
  openDevTools: () => ipcRenderer.invoke("ea:openDevTools"),
  setTitleBarTheme: (args) => ipcRenderer.invoke("ea:setTitleBarTheme", args),

  // Auto-updater methods
  updater: {
    check: () => ipcRenderer.invoke("updater:check"),
    download: () => ipcRenderer.invoke("updater:download"),
    install: () => ipcRenderer.invoke("updater:install"),
    getVersion: () => ipcRenderer.invoke("updater:getVersion"),
    onStatus: (handler) => {
      // Wrap the handler so we can remove it later by reference.
      const wrapped = (_event, data) => handler(data);
      _statusListenerMap.set(handler, wrapped);
      ipcRenderer.on("updater:status", wrapped);
    },
    offStatus: (handler) => {
      const wrapped = _statusListenerMap.get(handler);
      if (wrapped) {
        ipcRenderer.removeListener("updater:status", wrapped);
        _statusListenerMap.delete(handler);
      }
    },
  },
});
