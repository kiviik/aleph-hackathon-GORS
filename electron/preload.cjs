const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("baEstacionaDesktop", {
  platform: process.platform,
  isDesktop: true,
});
