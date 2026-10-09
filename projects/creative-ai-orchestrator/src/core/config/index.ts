// ============================================================================
// Configuration System
// ============================================================================
// Loads from environment + optional config file.
// No magic — explicit configuration only.
// ============================================================================

import path from "node:path";
import fs from "node:fs";
import { type AutonomyLevel, type NetworkPolicy } from "../types/index.js";

export interface CaioConfig {
  // Server
  port: number;
  host: string;

  // Paths
  dataDir: string;
  dbPath: string;
  modelsDir: string;
  outputsDir: string;
  projectsDir: string;
  cacheDir: string;

  // LLM
  openaiApiKey: string;
  anthropicApiKey: string;
  googleApiKey: string;
  xaiApiKey: string;
  deepseekApiKey: string;
  openrouterApiKey: string;
  localLlmUrl: string;
  localLlmModel: string;

  // Discovery
  githubToken: string;
  huggingfaceToken: string;
  civitaiApiKey: string;

  // ComfyUI
  comfyuiPath: string;
  comfyuiPort: number;

  // Security
  autonomyLevel: AutonomyLevel;
  maxDownloadSizeMb: number;
  sandboxEnabled: boolean;

  // Telemetry
  telemetryEnabled: boolean;
}

function getEnv(key: string, fallback: string = ""): string {
  return process.env[key] || fallback;
}

function getEnvInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (!val) return fallback;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? fallback : parsed;
}

function getEnvBool(key: string, fallback: boolean): boolean {
  const val = process.env[key]?.toLowerCase();
  if (!val) return fallback;
  return val === "true" || val === "1" || val === "yes";
}

function getDataDir(): string {
  const envDir = process.env.DATA_DIR;
  if (envDir) return path.resolve(envDir);
  // Default: ./data relative to cwd
  return path.resolve(process.cwd(), "data");
}

export function loadConfig(configPath?: string): CaioConfig {
  // Load .env file if present (dotenv-style)
  const envPath = configPath || path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }

  const dataDir = getDataDir();

  return {
    port: getEnvInt("PORT", 3456),
    host: getEnv("HOST", "127.0.0.1"),

    dataDir,
    dbPath: getEnv("DB_PATH", path.join(dataDir, "caio.db")),
    modelsDir: getEnv("MODELS_DIR", path.join(dataDir, "models")),
    outputsDir: getEnv("OUTPUTS_DIR", path.join(dataDir, "outputs")),
    projectsDir: getEnv("PROJECTS_DIR", path.join(dataDir, "projects")),
    cacheDir: getEnv("CACHE_DIR", path.join(dataDir, "cache")),

    openaiApiKey: getEnv("OPENAI_API_KEY"),
    anthropicApiKey: getEnv("ANTHROPIC_API_KEY"),
    googleApiKey: getEnv("GOOGLE_API_KEY"),
    xaiApiKey: getEnv("XAI_API_KEY"),
    deepseekApiKey: getEnv("DEEPSEEK_API_KEY"),
    openrouterApiKey: getEnv("OPENROUTER_API_KEY"),
    localLlmUrl: getEnv("LOCAL_LLM_URL", "http://127.0.0.1:11434"),
    localLlmModel: getEnv("LOCAL_LLM_MODEL", "llama3"),

    githubToken: getEnv("GITHUB_TOKEN"),
    huggingfaceToken: getEnv("HUGGINGFACE_TOKEN"),
    civitaiApiKey: getEnv("CIVITAI_API_KEY"),

    comfyuiPath: getEnv("COMFYUI_PATH"),
    comfyuiPort: getEnvInt("COMFYUI_PORT", 8188),

    autonomyLevel: getEnv("AUTONOMY_LEVEL", "assisted") as AutonomyLevel,
    maxDownloadSizeMb: getEnvInt("MAX_DOWNLOAD_SIZE_MB", 4096),
    sandboxEnabled: getEnvBool("SANDBOX_ENABLED", true),

    telemetryEnabled: getEnvBool("TELEMETRY_ENABLED", false),
  };
}

// Singleton
let _config: CaioConfig | undefined;

export function getConfig(): CaioConfig {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

export function setConfig(config: CaioConfig): void {
  _config = config;
}
