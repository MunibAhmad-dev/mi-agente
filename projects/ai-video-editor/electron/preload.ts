/**
 * AI Creative OS - Preload Script
 * Exposes safe IPC bridge to the renderer process.
 */

import { contextBridge, ipcRenderer } from "electron";

const api = {
  // System
  system: {
    status: () => ipcRenderer.invoke("system:status"),
    initialize: () => ipcRenderer.invoke("system:initialize"),
  },

  // Creative Pipeline
  creative: {
    process: (intent: string, options?: any) => ipcRenderer.invoke("creative:process", intent, options),
    parse: (intent: string) => ipcRenderer.invoke("creative:parse", intent),
    simulate: (intent: string) => ipcRenderer.invoke("creative:simulate", intent),
  },

  // Capabilities
  capabilities: {
    list: () => ipcRenderer.invoke("capabilities:list"),
  },

  // Providers & Models
  providers: {
    list: () => ipcRenderer.invoke("providers:list"),
  },
  models: {
    list: () => ipcRenderer.invoke("models:list"),
  },
  catalog: {
    list: () => ipcRenderer.invoke("catalog:list"),
  },

  // Adapters
  adapters: {
    detect: () => ipcRenderer.invoke("adapters:detect"),
  },

  // Hardware
  hardware: {
    detect: () => ipcRenderer.invoke("hardware:detect"),
  },

  // Style
  style: {
    analyze: (params: any) => ipcRenderer.invoke("style:analyze", params),
    compare: (dnaA: any, dnaB: any) => ipcRenderer.invoke("style:compare", dnaA, dnaB),
    learn: (videoPath: string) => ipcRenderer.invoke("style:learn", videoPath),
  },

  // Color
  color: {
    analyze: (path: string) => ipcRenderer.invoke("color:analyze", path),
    correct: (input: string, output: string, options: any) => ipcRenderer.invoke("color:correct", input, output, options),
    applyLUT: (input: string, output: string, lutPath: string) => ipcRenderer.invoke("color:applyLUT", input, output, lutPath),
  },

  // Voice
  voice: {
    transcribe: (path: string, options?: any) => ipcRenderer.invoke("voice:transcribe", path, options),
    noiseReduce: (input: string, output: string, intensity?: string) => ipcRenderer.invoke("voice:noiseReduce", input, output, intensity),
    tts: (text: string, output: string, options?: any) => ipcRenderer.invoke("voice:tts", text, output, options),
  },

  // Thumbnail
  thumbnail: {
    extract: (video: string, output: string, options?: any) => ipcRenderer.invoke("thumbnail:extract", video, output, options),
  },

  // OCR
  ocr: {
    analyze: (path: string, options?: any) => ipcRenderer.invoke("ocr:analyze", path, options),
  },

  // Tasks
  tasks: {
    list: () => ipcRenderer.invoke("tasks:list"),
    submit: (task: any) => ipcRenderer.invoke("tasks:submit", task),
  },

  // Projects
  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    create: (name: string) => ipcRenderer.invoke("projects:create", name),
  },

  // Dialogs
  dialog: {
    openFile: (options?: any) => ipcRenderer.invoke("dialog:openFile", options),
    openFiles: (options?: any) => ipcRenderer.invoke("dialog:openFiles", options),
    saveFile: (options?: any) => ipcRenderer.invoke("dialog:saveFile", options),
    openDirectory: () => ipcRenderer.invoke("dialog:openDirectory"),
  },

  // Shell
  shell: {
    openPath: (p: string) => ipcRenderer.invoke("shell:openPath", p),
  },
};

contextBridge.exposeInMainWorld("api", api);

export type AICreativeOSAPI = typeof api;
