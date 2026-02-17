const { contextBridge, ipcRenderer } = require("electron");

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
  checkForUpdates: () => ipcRenderer.invoke("ea:checkForUpdates"),
  updater: {
    check: () => ipcRenderer.invoke("updater:check"),
    download: () => ipcRenderer.invoke("updater:download"),
    install: () => ipcRenderer.invoke("updater:install"),
    getVersion: () => ipcRenderer.invoke("updater:getVersion"),
    onStatus: (handler) => {
      ipcRenderer.on("updater:status", (_event, data) => handler(data));
    },
    offStatus: (handler) => {
      ipcRenderer.removeListener("updater:status", handler);
    },
  },
});
