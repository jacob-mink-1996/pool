const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("poolDesktop", {
  platform: process.platform,
  desktop: true,
  pickDirectory: () => ipcRenderer.invoke("pool:pick-directory"),
});
