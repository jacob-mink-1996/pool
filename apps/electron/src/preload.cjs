const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("floopDesktop", {
  platform: process.platform,
  desktop: true,
  pickDirectory: () => ipcRenderer.invoke("floop:pick-directory"),
});
