/**
 * AI Creative OS - Core Infrastructure
 * Event Bus, Config, Storage, Logger, ID Generation
 */

import { nanoid } from "nanoid";
import type { UniqueId, Timestamp, SystemEvent, SystemConfig } from "../types/index.js";

// ─── ID Generation ───────────────────────────────────────────────────────────

export function generateId(): UniqueId {
  return nanoid(21);
}

export function generateShortId(): UniqueId {
  return nanoid(10);
}

export function timestamp(): Timestamp {
  return Date.now();
}

// ─── Event Bus ───────────────────────────────────────────────────────────────

type EventHandler = (event: SystemEvent) => void | Promise<void>;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private history: SystemEvent[] = [];
  private maxHistory = 1000;

  on(eventType: string, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
    return () => this.off(eventType, handler);
  }

  off(eventType: string, handler: EventHandler): void {
    this.handlers.get(eventType)?.delete(handler);
  }

  async emit(eventType: string, source: string, data: Record<string, unknown> = {}): Promise<void> {
    const event: SystemEvent = {
      type: eventType,
      timestamp: timestamp(),
      source,
      data,
      id: generateId(),
    };

    this.history.push(event);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    const handlers = this.handlers.get(eventType);
    const globalHandlers = this.handlers.get("*");

    if (handlers) {
      await Promise.allSettled([...handlers].map((h) => h(event)));
    }
    if (globalHandlers) {
      await Promise.allSettled([...globalHandlers].map((h) => h(event)));
    }
  }

  getHistory(eventType?: string, limit = 50): SystemEvent[] {
    const filtered = eventType
      ? this.history.filter((e) => e.type === eventType)
      : this.history;
    return filtered.slice(-limit);
  }

  clearHistory(): void {
    this.history = [];
  }

  listenerCount(eventType: string): number {
    return this.handlers.get(eventType)?.size ?? 0;
  }
}

// ─── Configuration ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG: SystemConfig = {
  dataDirectory: "./data",
  cacheDirectory: "./data/cache",
  modelDirectory: "./data/models",
  projectDirectory: "./data/projects",
  logLevel: "info",
  maxConcurrentTasks: 4,
  maxVRAMUsage: 90,
  maxRAMUsage: 80,
  autoHealthCheck: true,
  healthCheckInterval: 60000,
  defaultQuality: "balanced" as any,
  offlineMode: false,
  proxyEnabled: false,
  licenseAgreed: {},
};

export class Config {
  private data: SystemConfig;
  private filePath: string;

  constructor(filePath = "./data/config.json") {
    this.filePath = filePath;
    this.data = { ...DEFAULT_CONFIG };
  }

  get<K extends keyof SystemConfig>(key: K): SystemConfig[K] {
    return this.data[key];
  }

  set<K extends keyof SystemConfig>(key: K, value: SystemConfig[K]): void {
    this.data[key] = value;
  }

  getAll(): Readonly<SystemConfig> {
    return { ...this.data };
  }

  merge(partial: Partial<SystemConfig>): void {
    Object.assign(this.data, partial);
  }

  async load(): Promise<void> {
    try {
      const { readFileSync } = await import("node:fs");
      const raw = readFileSync(this.filePath, "utf-8");
      this.data = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {
      // File doesn't exist yet, use defaults
    }
  }

  async save(): Promise<void> {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}

// ─── Logger ──────────────────────────────────────────────────────────────────

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

export class Logger {
  private level: LogLevel;
  private prefix: string;

  constructor(prefix: string, level: LogLevel = "info") {
    this.prefix = prefix;
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private format(level: LogLevel, message: string, data?: unknown): string {
    const time = new Date().toISOString();
    const base = `[${time}] [${level.toUpperCase()}] [${this.prefix}] ${message}`;
    if (data !== undefined) {
      return `${base} ${JSON.stringify(data, null, 0)}`;
    }
    return base;
  }

  trace(message: string, data?: unknown): void {
    if (this.shouldLog("trace")) console.debug(this.format("trace", message, data));
  }
  debug(message: string, data?: unknown): void {
    if (this.shouldLog("debug")) console.debug(this.format("debug", message, data));
  }
  info(message: string, data?: unknown): void {
    if (this.shouldLog("info")) console.info(this.format("info", message, data));
  }
  warn(message: string, data?: unknown): void {
    if (this.shouldLog("warn")) console.warn(this.format("warn", message, data));
  }
  error(message: string, data?: unknown): void {
    if (this.shouldLog("error")) console.error(this.format("error", message, data));
  }
  fatal(message: string, data?: unknown): void {
    if (this.shouldLog("fatal")) console.error(this.format("fatal", message, data));
  }

  child(prefix: string): Logger {
    return new Logger(`${this.prefix}:${prefix}`, this.level);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

// ─── Storage Engine ──────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";

export class StorageEngine {
  private basePath: string;
  private logger: Logger;

  constructor(basePath: string, logger?: Logger) {
    this.basePath = basePath;
    this.logger = logger ?? new Logger("Storage");
  }

  private ensureDir(subPath: string): string {
    const full = join(this.basePath, subPath);
    mkdirSync(dirname(full), { recursive: true });
    return full;
  }

  read<T>(subPath: string): T | null {
    try {
      const filePath = join(this.basePath, subPath);
      if (!existsSync(filePath)) return null;
      return JSON.parse(readFileSync(filePath, "utf-8")) as T;
    } catch (err) {
      this.logger.error(`Failed to read ${subPath}`, err);
      return null;
    }
  }

  write<T>(subPath: string, data: T): boolean {
    try {
      const filePath = this.ensureDir(subPath);
      writeFileSync(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (err) {
      this.logger.error(`Failed to write ${subPath}`, err);
      return false;
    }
  }

  delete(subPath: string): boolean {
    try {
      const filePath = join(this.basePath, subPath);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (err) {
      this.logger.error(`Failed to delete ${subPath}`, err);
      return false;
    }
  }

  list(subPath: string, ext?: string): string[] {
    try {
      const dirPath = join(this.basePath, subPath);
      if (!existsSync(dirPath)) return [];
      const files = readdirSync(dirPath);
      return ext ? files.filter((f) => f.endsWith(ext)) : files;
    } catch {
      return [];
    }
  }

  exists(subPath: string): boolean {
    return existsSync(join(this.basePath, subPath));
  }
}

// ─── Generic In-Memory Registry ──────────────────────────────────────────────

export class Registry<T extends { id: UniqueId }> {
  protected items = new Map<UniqueId, T>();
  protected name: string;

  constructor(name: string) {
    this.name = name;
  }

  register(item: T): void {
    this.items.set(item.id, item);
  }

  unregister(id: UniqueId): boolean {
    return this.items.delete(id);
  }

  get(id: UniqueId): T | undefined {
    return this.items.get(id);
  }

  getAll(): T[] {
    return [...this.items.values()];
  }

  count(): number {
    return this.items.size;
  }

  has(id: UniqueId): boolean {
    return this.items.has(id);
  }

  clear(): void {
    this.items.clear();
  }

  find(predicate: (item: T) => boolean): T | undefined {
    return this.getAll().find(predicate);
  }

  filter(predicate: (item: T) => boolean): T[] {
    return this.getAll().filter(predicate);
  }
}

// ─── Retry / Resilience ─────────────────────────────────────────────────────

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULT_RETRY, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < opts.maxRetries) {
        const delay = Math.min(
          opts.baseDelay * Math.pow(opts.backoffMultiplier, attempt),
          opts.maxDelay,
        );
        const jittered = opts.jitter ? delay * (0.5 + Math.random() * 0.5) : delay;
        await new Promise((r) => setTimeout(r, jittered));
      }
    }
  }
  throw lastError;
}

// ─── Process Execution ───────────────────────────────────────────────────────

import { execSync, spawn } from "node:child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export function execCommand(
  command: string,
  options: { timeout?: number; cwd?: string; env?: Record<string, string> } = {},
): ExecResult {
  const start = Date.now();
  try {
    const stdout = execSync(command, {
      timeout: options.timeout ?? 30000,
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, stderr: "", exitCode: 0, duration: Date.now() - start };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "",
      exitCode: err.status ?? 1,
      duration: Date.now() - start,
    };
  }
}

export function commandExists(cmd: string): boolean {
  const result = execCommand(
    process.platform === "win32" ? `where ${cmd}` : `which ${cmd}`,
  );
  return result.exitCode === 0;
}

// ─── Platform Detection ──────────────────────────────────────────────────────

export function getPlatform(): "windows" | "linux" | "macos" | "unknown" {
  switch (process.platform) {
    case "win32": return "windows";
    case "linux": return "linux";
    case "darwin": return "macos";
    default: return "unknown";
  }
}

// ─── File Hash ───────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";

export function fileHash(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
