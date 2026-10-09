// ============================================================================
// Electron Main Process
// ============================================================================
// Launches the CAIO API server, loads the GUI, handles auto-update.
// ============================================================================

import { app, BrowserWindow, shell, dialog, ipcMain, nativeTheme } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let updaterInterval: ReturnType<typeof setInterval> | null = null;
const SERVER_PORT = 3456;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const GITHUB_REPO = "proyectos-aoi/mi-agente";
const CURRENT_VERSION = app.getVersion();

// ============================================================================
// IPC Handlers
// ============================================================================

function registerIpcHandlers() {
  // Window controls
  ipcMain.on("window:minimize", () => mainWindow?.minimize());
  ipcMain.on("window:maximize", () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on("window:close", () => mainWindow?.close());

  // App info
  ipcMain.handle("app:version", () => CURRENT_VERSION);
  ipcMain.handle("app:platform", () => process.platform);
  ipcMain.handle("app:is-dark", () => nativeTheme.shouldUseDarkColors);

  // File dialogs
  ipcMain.handle("dialog:openFile", async (_e, filters?: { name: string; extensions: string[] }[]) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openFile"],
      filters: filters || [{ name: "All Files", extensions: ["*"] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("dialog:saveFile", async (_e, defaultName?: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: defaultName,
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle("dialog:openDirectory", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Auto-update check
  ipcMain.handle("update:check", async () => checkForUpdates());
  ipcMain.handle("update:install", () => {
    // In production, quit and re-launch (installer replaces files)
    app.quit();
  });
}

// ============================================================================
// Auto-Updater (GitHub Releases)
// ============================================================================

async function checkForUpdates(): Promise<{
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  downloadUrl?: string;
  releaseNotes?: string;
}> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { "User-Agent": `CAIO/${CURRENT_VERSION}` } }
    );
    if (!res.ok) return { available: false, currentVersion: CURRENT_VERSION };

    const release = await res.json() as any;
    const latestVersion = release.tag_name?.replace(/^v/, "");
    if (!latestVersion) return { available: false, currentVersion: CURRENT_VERSION };

    const available = latestVersion !== CURRENT_VERSION;
    const platformAsset = release.assets?.find((a: any) => {
      const name = a.name?.toLowerCase() || "";
      if (process.platform === "win32") return name.endsWith(".exe") || name.endsWith(".msi");
      if (process.platform === "darwin") return name.endsWith(".dmg");
      return name.endsWith(".appimage");
    });

    return {
      available,
      currentVersion: CURRENT_VERSION,
      latestVersion,
      downloadUrl: platformAsset?.browser_download_url,
      releaseNotes: release.body?.substring(0, 500),
    };
  } catch {
    return { available: false, currentVersion: CURRENT_VERSION };
  }
}

function startAutoUpdateCheck() {
  // Check every 30 minutes
  updaterInterval = setInterval(async () => {
    const update = await checkForUpdates();
    if (update.available && mainWindow) {
      mainWindow.webContents.send("update:available", update);
    }
  }, 30 * 60 * 1000);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: "Creative AI Orchestrator",
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    backgroundColor: "#11111b",
    titleBarStyle: process.platform === "win32" ? "default" : "hiddenInset",
    frame: process.platform !== "darwin",
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL(SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // In production, serve the UI from the bundled dist folder
    const uiPath = path.join(__dirname, "..", "ui", "index.html");
    if (fs.existsSync(uiPath)) {
      mainWindow.loadFile(uiPath);
    } else {
      mainWindow.loadURL(SERVER_URL);
    }
  }

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Forward progress events to renderer
  mainWindow.webContents.on("did-finish-load", () => {
    startAutoUpdateCheck();
  });
}

async function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, "..", "dist", "index.js");

    serverProcess = fork(serverPath, [], {
      env: { ...process.env, PORT: String(SERVER_PORT), ELECTRON: "1" },
      stdio: isDev ? "inherit" : "ignore",
    });

    serverProcess.on("error", (err) => {
      console.error("Server failed to start:", err);
      dialog.showErrorBox("Server Error", `Failed to start CAIO server: ${err.message}`);
      reject(err);
    });

    serverProcess.on("exit", (code) => {
      if (code !== null && code !== 0) {
        dialog.showErrorBox("Server Error", `CAIO server exited with code ${code}`);
      }
    });

    // Wait for server to be ready
    const checkReady = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/api/health`);
        if (res.ok) {
          resolve();
        } else {
          setTimeout(checkReady, 500);
        }
      } catch {
        setTimeout(checkReady, 500);
      }
    };

    setTimeout(checkReady, 1000);
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
}

// ============================================================================
// App Lifecycle
// ============================================================================

app.whenReady().then(async () => {
  try {
    registerIpcHandlers();
    await startServer();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (err) {
    app.quit();
  }
});

app.on("window-all-closed", () => {
  stopServer();
  if (updaterInterval) clearInterval(updaterInterval);
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopServer();
  if (updaterInterval) clearInterval(updaterInterval);
});
