// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL WEB RECONSTRUCTION ENGINE — Core Utilities
// ═══════════════════════════════════════════════════════════════════════════════

import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// ─── ID Generation ────────────────────────────────────────────────────────────

export function genId(prefix = '') {
  const id = randomUUID().slice(0, 12);
  return prefix ? `${prefix}-${id}` : id;
}

export function timestamp() {
  return new Date().toISOString();
}

// ─── File System ──────────────────────────────────────────────────────────────

export function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function readJSON(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function writeJSON(path, data) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
  return path;
}

export function projectDir(projectId) {
  return join(PROJECT_ROOT, 'projects', projectId);
}

// ─── Scores ──────────────────────────────────────────────────────────────────

export function createEmptyScore(iteration = 0) {
  return {
    iteration,
    timestamp: timestamp(),
    overall: 0, pixel: 0, visual: 0, layout: 0, geometry: 0,
    color: 0, typography: 0, shadow: 0, asset: 0,
    responsive: 0, interaction: 0, animation: 0,
    accessibility: 0, security: 0, diffs: []
  };
}

export function computeOverallScore(score) {
  const weights = {
    visual: 0.20, pixel: 0.15, layout: 0.15, geometry: 0.10,
    color: 0.10, typography: 0.08, shadow: 0.04, asset: 0.05,
    responsive: 0.05, interaction: 0.05, animation: 0.02, accessibility: 0.01
  };
  let total = 0;
  let weightSum = 0;
  for (const [key, w] of Object.entries(weights)) {
    if (score[key] !== undefined) {
      total += score[key] * w;
      weightSum += w;
    }
  }
  return weightSum > 0 ? Math.round((total / weightSum) * 100) / 100 : 0;
}

// ─── Default Configs ─────────────────────────────────────────────────────────

export function defaultBrowserConfig() {
  return {
    browser: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezone: 'UTC',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  };
}

export function defaultProjectConfig() {
  return {
    targetFramework: 'auto',
    cssFramework: 'auto',
    maxIterations: 10,
    qualityThreshold: 95,
    enableAutoRepair: true,
    enableMultiAgent: true,
    enableSkillDiscovery: true,
    browserConfig: defaultBrowserConfig()
  };
}

// ─── Common Viewports ────────────────────────────────────────────────────────

export const VIEWPORTS = {
  desktop_hd: { width: 1920, height: 1080 },
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1366, height: 768 },
  tablet_landscape: { width: 1024, height: 768 },
  tablet_portrait: { width: 768, height: 1024 },
  mobile_landscape: { width: 667, height: 375 },
  mobile: { width: 375, height: 812 },
  mobile_small: { width: 320, height: 568 },
};

// ─── Logger ───────────────────────────────────────────────────────────────────

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
let currentLogLevel = LOG_LEVELS.info;

export function setLogLevel(level) {
  currentLogLevel = LOG_LEVELS[level] ?? LOG_LEVELS.info;
}

export function createLogger(context) {
  const prefix = (level) => `[${new Date().toISOString()}] [${level.toUpperCase()}] [${context}]`;
  return {
    debug: (msg, ...args) => currentLogLevel <= 0 && console.log(`${prefix('debug')} ${msg}`, ...args),
    info: (msg, ...args) => currentLogLevel <= 1 && console.log(`${prefix('info')} ${msg}`, ...args),
    warn: (msg, ...args) => currentLogLevel <= 2 && console.warn(`${prefix('warn')} ${msg}`, ...args),
    error: (msg, ...args) => currentLogLevel <= 3 && console.error(`${prefix('error')} ${msg}`, ...args),
  };
}

// ─── Event Emitter ────────────────────────────────────────────────────────────

export class EventBus {
  #listeners = new Map();

  on(event, fn) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    this.#listeners.get(event)?.delete(fn);
  }

  emit(event, data) {
    const handlers = this.#listeners.get(event);
    if (handlers) {
      for (const fn of handlers) {
        try { fn(data); } catch (e) { console.error(`EventBus error on '${event}':`, e); }
      }
    }
  }

  once(event, fn) {
    const wrapper = (data) => { this.off(event, wrapper); fn(data); };
    return this.on(event, wrapper);
  }
}

export const globalBus = new EventBus();
