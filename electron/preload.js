const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ideahubDesktop", {
  isDesktop: true,
  quitApp: () => ipcRenderer.invoke("ideahub:quit"),
});
