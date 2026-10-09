// ============================================================================
// Electron Preload Script
// ============================================================================
// Exposes safe IPC methods to the renderer process via contextBridge.
// ============================================================================

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("caio", {
  // App info
  getVersion: () => ipcRenderer.invoke("app:version"),
  getPlatform: () => ipcRenderer.invoke("app:platform"),

  // Window controls
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),

  // File dialogs
  openFile: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke("dialog:openFile", filters),
  saveFile: (defaultName?: string) =>
    ipcRenderer.invoke("dialog:saveFile", defaultName),
  openDirectory: () =>
    ipcRenderer.invoke("dialog:openDirectory"),

  // Notifications
  notify: (title: string, body: string) =>
    ipcRenderer.send("notify", title, body),
});
