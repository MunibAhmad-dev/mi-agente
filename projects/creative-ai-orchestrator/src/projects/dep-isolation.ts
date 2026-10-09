// ============================================================================
// Dependency Isolation
// ============================================================================
// Manages isolated Python environments per project to handle
// conflicting dependency versions between projects.
// ============================================================================

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface IsolatedEnvironment {
  projectId: string;
  venvPath: string;
  pythonPath: string;
  pipPath: string;
  status: "not_created" | "created" | "active";
}

export class DependencyIsolation {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.join(baseDir, "environments");
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  /**
   * Create an isolated environment for a project.
   */
  createEnvironment(projectId: string): IsolatedEnvironment {
    const venvPath = path.join(this.baseDir, projectId);
    const isWindows = process.platform === "win32";

    if (!fs.existsSync(venvPath)) {
      const python = isWindows ? "python" : "python3";
      execSync(`${python} -m venv "${venvPath}"`, { timeout: 60000 });
    }

    return {
      projectId,
      venvPath,
      pythonPath: isWindows ? path.join(venvPath, "Scripts", "python.exe") : path.join(venvPath, "bin", "python3"),
      pipPath: isWindows ? path.join(venvPath, "Scripts", "pip.exe") : path.join(venvPath, "bin", "pip3"),
      status: "created",
    };
  }

  /**
   * Install dependencies in an isolated environment.
   */
  installDependencies(projectId: string, requirements: string[]): { success: boolean; error?: string } {
    const env = this.createEnvironment(projectId);

    try {
      // Create temporary requirements.txt
      const reqPath = path.join(env.venvPath, "requirements.txt");
      fs.writeFileSync(reqPath, requirements.join("\n"));

      execSync(`"${env.pipPath}" install -r "${reqPath}"`, { timeout: 300000, stdio: "pipe" });

      fs.unlinkSync(reqPath);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Check if environment exists.
   */
  environmentExists(projectId: string): boolean {
    const venvPath = path.join(this.baseDir, projectId);
    return fs.existsSync(venvPath);
  }

  /**
   * Delete an environment.
   */
  deleteEnvironment(projectId: string): boolean {
    const venvPath = path.join(this.baseDir, projectId);
    if (fs.existsSync(venvPath)) {
      fs.rmSync(venvPath, { recursive: true, force: true });
      return true;
    }
    return false;
  }

  /**
   * Get disk usage of all environments.
   */
  getDiskUsage(): { totalMb: number; count: number } {
    if (!fs.existsSync(this.baseDir)) return { totalMb: 0, count: 0 };

    const entries = fs.readdirSync(this.baseDir);
    let totalBytes = 0;
    for (const entry of entries) {
      const entryPath = path.join(this.baseDir, entry);
      const stat = fs.statSync(entryPath);
      if (stat.isDirectory()) totalBytes += this.dirSize(entryPath);
    }

    return { totalMb: Math.round(totalBytes / 1024 / 1024), count: entries.length };
  }

  private dirSize(dir: string): number {
    let size = 0;
    try {
      const files = fs.readdirSync(dir, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) size += this.dirSize(fullPath);
        else size += fs.statSync(fullPath).size;
      }
    } catch {}
    return size;
  }
}
