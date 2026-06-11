const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("poolDesktop", {
  platform: process.platform,
  desktop: true,
});
