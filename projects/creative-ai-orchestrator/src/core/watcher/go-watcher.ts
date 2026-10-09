// ============================================================================
// Go File Watcher Integration
// ============================================================================
// Spawns caiotool watch as a child process and bridges events to Node.js EventEmitter.
// Uses fsnotify underneath — 10-100x more efficient than fs.watch.
// ============================================================================

import { EventEmitter } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";

export interface WatchEvent {
  type: string;
  path: string;
  time: string;
}

function getGoBinary(): string {
  const base = path.join(process.cwd(), "dist");
  const ext = process.platform === "win32" ? ".exe" : "";
  const binPath = path.join(base, `caiotool${ext}`);
  if (existsSync(binPath)) return binPath;
  const rootPath = path.join(process.cwd(), "..", "dist", `caiotool${ext}`);
  if (existsSync(rootPath)) return rootPath;
  return "";
}

/**
 * GoFileWatcher — wraps caiotool watch for efficient directory monitoring.
 *
 * Usage:
 *   const watcher = new GoFileWatcher("/path/to/dir", { extensions: [".png", ".json"] });
 *   watcher.on("file:created", (event) => console.log(event.path));
 *   watcher.on("file:modified", (event) => console.log(event.path));
 *   watcher.start();
 *   // ... later
 *   watcher.stop();
 */
export class GoFileWatcher extends EventEmitter {
  private proc: ChildProcess | null = null;
  private dir: string;
  private extensions: string[];
  private _running = false;

  constructor(dir: string, opts?: { extensions?: string[] }) {
    super();
    this.dir = dir;
    this.extensions = opts?.extensions ?? [];
  }

  get running(): boolean {
    return this._running;
  }

  start(): void {
    if (this._running) return;

    const bin = getGoBinary();
    if (!bin) {
      this.emit("error", new Error("Go binary not found — run: cd cmd/caiotool && go build"));
      return;
    }

    const args = ["watch", this.dir];
    if (this.extensions.length > 0) {
      args.push("--ext", this.extensions.join(","));
    }

    this.proc = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    this._running = true;

    // Parse JSON events from stdout
    let buffer = "";
    this.proc.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event: WatchEvent = JSON.parse(line);
          this.emit(event.type, event);
          this.emit("event", event);
        } catch {
          this.emit("raw", line);
        }
      }
    });

    this.proc.stderr?.on("data", (chunk: Buffer) => {
      this.emit("stderr", chunk.toString().trim());
    });

    this.proc.on("exit", (code) => {
      this._running = false;
      this.emit("exit", code);
    });

    this.proc.on("error", (err) => {
      this._running = false;
      this.emit("error", err);
    });
  }

  stop(): void {
    if (this.proc) {
      this.proc.kill("SIGTERM");
      this.proc = null;
    }
    this._running = false;
  }
}

/**
 * One-shot file watch for a duration (returns collected events).
 */
export async function watchForDuration(
  dir: string,
  durationMs: number,
  opts?: { extensions?: string[] },
): Promise<WatchEvent[]> {
  return new Promise((resolve) => {
    const watcher = new GoFileWatcher(dir, opts);
    const events: WatchEvent[] = [];

    watcher.on("event", (e: WatchEvent) => events.push(e));
    watcher.on("error", () => {});

    watcher.start();
    setTimeout(() => {
      watcher.stop();
      resolve(events);
    }, durationMs);
  });
}
