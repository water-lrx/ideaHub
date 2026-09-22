const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ideahubDesktop", {
  isDesktop: true,
  quitApp: () => ipcRenderer.invoke("ideahub:quit"),
  chooseResearchFolder: () => ipcRenderer.invoke("ideahub:choose-research-folder"),
  openResearchFile: (filePath) => ipcRenderer.invoke("ideahub:open-research-file", filePath),
});
