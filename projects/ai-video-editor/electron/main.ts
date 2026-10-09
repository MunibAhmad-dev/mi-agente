/**
 * AI Creative OS - Electron Main Process
 * Creates the desktop window and bridges IPC to the TypeScript backend.
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import * as path from "path";

let mainWindow: BrowserWindow | null = null;

// We'll use dynamic import for the backend since it's ESM
let osInstance: any = null;

async function getOS() {
  if (!osInstance) {
    const mod = await import("../src/index.js");
    const OS = mod.AICreativeOS;
    osInstance = new OS(path.join(app.getPath("userData"), "data"));
    await osInstance.initialize();
  }
  return osInstance;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: "AI Creative OS",
    backgroundColor: "#0a0a0f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
  });

  // Load the React app
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../gui/dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

function setupIPC() {
  // System
  ipcMain.handle("system:status", async () => {
    const os = await getOS();
    return os.getStatus();
  });

  ipcMain.handle("system:initialize", async () => {
    const os = await getOS();
    return await os.initialize();
  });

  // Creative Pipeline
  ipcMain.handle("creative:process", async (_e, intent: string, options?: any) => {
    const os = await getOS();
    return await os.processCreativeRequest(intent, options);
  });

  ipcMain.handle("creative:parse", async (_e, intent: string) => {
    const os = await getOS();
    const { specification, analysis } = await os.creativeCompiler.compile(intent);
    return { specification, analysis };
  });

  ipcMain.handle("creative:simulate", async (_e, intent: string) => {
    const os = await getOS();
    const session = await os.processCreativeRequest(intent);
    return session.plan;
  });

  // Capabilities
  ipcMain.handle("capabilities:list", async () => {
    const os = await getOS();
    return os.capabilityRegistry.getAll();
  });

  // Providers & Models
  ipcMain.handle("providers:list", async () => {
    const os = await getOS();
    return os.providerRegistry.getAll();
  });

  ipcMain.handle("models:list", async () => {
    const os = await getOS();
    return os.modelManager.getAll();
  });

  ipcMain.handle("catalog:list", async () => {
    const os = await getOS();
    return os.catalog.getAll();
  });

  // Adapters
  ipcMain.handle("adapters:detect", async () => {
    const os = await getOS();
    return await os.adapterRegistry.detectAll();
  });

  // Hardware
  ipcMain.handle("hardware:detect", async () => {
    const os = await getOS();
    return await os.hardware.detect();
  });

  // Style
  ipcMain.handle("style:analyze", async (_e, params: any) => {
    const os = await getOS();
    return os.styleAnalyzer.createFromParameters(params);
  });

  ipcMain.handle("style:compare", async (_e, dnaA: any, dnaB: any) => {
    const os = await getOS();
    return os.styleComparator.compare(dnaA, dnaB);
  });

  ipcMain.handle("style:learn", async (_e, videoPath: string) => {
    const os = await getOS();
    return await os.captionLearning.learnFromVideo(videoPath);
  });

  // Color
  ipcMain.handle("color:analyze", async (_e, path: string) => {
    const os = await getOS();
    return await os.color.analyzeColor(path);
  });

  ipcMain.handle("color:correct", async (_e, input: string, output: string, options: any) => {
    const os = await getOS();
    return await os.color.correct(input, output, options);
  });

  ipcMain.handle("color:applyLUT", async (_e, input: string, output: string, lutPath: string) => {
    const os = await getOS();
    return await os.color.applyLUT(input, output, { lutPath });
  });

  // Voice
  ipcMain.handle("voice:transcribe", async (_e, path: string, options?: any) => {
    const os = await getOS();
    return await os.audio.transcribe(path, options);
  });

  ipcMain.handle("voice:noiseReduce", async (_e, input: string, output: string, intensity?: string) => {
    const os = await getOS();
    return await os.voice.reduceNoise(input, output, { intensity: intensity ?? "medium", preserveVoice: true, adaptiveNoiseFloor: true });
  });

  ipcMain.handle("voice:tts", async (_e, text: string, output: string, options?: any) => {
    const os = await getOS();
    return await os.voice.textToSpeech(text, output, options);
  });

  // Thumbnail
  ipcMain.handle("thumbnail:extract", async (_e, video: string, output: string, options?: any) => {
    const os = await getOS();
    return await os.thumbnail.extractBest(video, output, options);
  });

  // OCR
  ipcMain.handle("ocr:analyze", async (_e, path: string, options?: any) => {
    const os = await getOS();
    return await os.ocr.analyzeVideo(path, options);
  });

  // Tasks
  ipcMain.handle("tasks:list", async () => {
    const os = await getOS();
    return os.taskManager.getAll();
  });

  ipcMain.handle("tasks:submit", async (_e, task: any) => {
    const os = await getOS();
    return os.taskManager.submit(task);
  });

  // Projects
  ipcMain.handle("projects:list", async () => {
    const os = await getOS();
    return os.projects.list();
  });

  ipcMain.handle("projects:create", async (_e, name: string) => {
    const os = await getOS();
    return os.projects.create({ name });
  });

  // File dialogs
  ipcMain.handle("dialog:openFile", async (_e, options?: any) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: options?.filters ?? [{ name: "All Files", extensions: ["*"] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("dialog:openFiles", async (_e, options?: any) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile", "multiSelections"],
      filters: options?.filters ?? [{ name: "All Files", extensions: ["*"] }],
    });
    return result.canceled ? null : result.filePaths;
  });

  ipcMain.handle("dialog:saveFile", async (_e, options?: any) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: options?.filters ?? [{ name: "All Files", extensions: ["*"] }],
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle("dialog:openDirectory", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Shell
  ipcMain.handle("shell:openPath", async (_e, p: string) => {
    await shell.openPath(p);
  });
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  setupIPC();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
