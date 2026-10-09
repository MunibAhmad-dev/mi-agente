// ============================================================================
// ComfyUI Installer — Enhanced with venv isolation + OS detection
// ============================================================================
// Detects OS, Python, GPU, creates isolated venv, installs ComfyUI.
// ============================================================================

import { execSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface InstallPlan {
  os: string;
  python: string;
  pip: string;
  venvPath: string;
  comfyuiPath: string;
  gpuType: "nvidia" | "amd" | "apple" | "cpu";
  cudaAvailable: boolean;
  steps: string[];
}

export interface InstallProgress {
  step: string;
  current: number;
  total: number;
  message: string;
}

export class ComfyUIInstaller {
  /**
   * Detect the full environment and create an install plan.
   */
  async detectEnvironment(targetDir: string): Promise<InstallPlan> {
    const os = process.platform;
    const steps: string[] = [];

    // Detect Python
    let python = "python3";
    let pip = "pip3";

    if (os === "win32") {
      python = "python";
      pip = "pip";
    }

    // Verify Python exists
    try {
      const ver = execSync(`${python} --version`, { encoding: "utf-8", timeout: 5000 }).trim();
      steps.push(`✓ Python found: ${ver}`);
    } catch {
      steps.push("✗ Python not found — will try to detect alternative paths");
      // Try common Windows paths
      if (os === "win32") {
        const winPaths = [
          "C:\\Python312\\python.exe",
          "C:\\Python311\\python.exe",
          "C:\\Python310\\python.exe",
          `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python312\\python.exe`,
          `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python311\\python.exe`,
        ];
        for (const p of winPaths) {
          if (fs.existsSync(p)) {
            python = p;
            pip = p.replace("python.exe", "pip.exe");
            steps.push(`✓ Found Python at ${p}`);
            break;
          }
        }
      }
    }

    // Detect GPU
    let gpuType: InstallPlan["gpuType"] = "cpu";
    let cudaAvailable = false;

    try {
      if (os === "win32" || os === "linux") {
        const nvidiaSmi = execSync("nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null", { encoding: "utf-8", timeout: 5000 }).trim();
        if (nvidiaSmi) {
          gpuType = "nvidia";
          steps.push(`✓ GPU detected: ${nvidiaSmi}`);
          try {
            const cudaVer = execSync("nvcc --version 2>/dev/null | grep release", { encoding: "utf-8", timeout: 5000 });
            cudaAvailable = !!cudaVer;
            if (cudaAvailable) steps.push("✓ CUDA available");
            else steps.push("⚠ CUDA not found — will install CPU-only PyTorch");
          } catch {
            steps.push("⚠ CUDA not found — will install CPU-only PyTorch");
          }
        }
      } else if (os === "darwin") {
        gpuType = "apple";
        steps.push("✓ Apple Silicon detected — using MPS backend");
      }
    } catch {
      steps.push("ℹ No NVIDIA GPU detected — will use CPU");
    }

    // Paths
    const venvPath = path.join(targetDir, ".venv");
    const comfyuiPath = path.join(targetDir, "ComfyUI");

    // Build steps
    if (!fs.existsSync(venvPath)) {
      steps.push(`→ Create venv at ${venvPath}`);
    }
    steps.push(`→ Clone ComfyUI to ${comfyuiPath}`);
    steps.push(`→ Install PyTorch (${gpuType})`);
    steps.push(`→ Install ComfyUI dependencies`);
    steps.push(`→ Run health check`);

    return { os, python, pip, venvPath, comfyuiPath, gpuType, cudaAvailable, steps };
  }

  /**
   * Execute the install plan.
   */
  async install(
    plan: InstallPlan,
    onProgress?: (progress: InstallProgress) => void
  ): Promise<{ success: boolean; error?: string }> {
    const report = (step: string, current: number, total: number, message: string) => {
      onProgress?.({ step, current, total, message });
    };

    const totalSteps = 5;

    try {
      // Step 1: Create venv
      report("venv", 1, totalSteps, "Creating virtual environment...");
      if (!fs.existsSync(plan.venvPath)) {
        execSync(`${plan.python} -m venv "${plan.venvPath}"`, { timeout: 60000 });
      }
      const venvPython = this.getVenvPython(plan);
      const venvPip = this.getVenvPip(plan);

      // Step 2: Upgrade pip
      report("pip", 2, totalSteps, "Upgrading pip...");
      execSync(`"${venvPip}" install --upgrade pip`, { timeout: 60000, stdio: "pipe" });

      // Step 3: Install PyTorch
      report("pytorch", 3, totalSteps, `Installing PyTorch for ${plan.gpuType}...`);
      const torchCmd = this.getPyTorchInstallCommand(plan);
      execSync(`"${venvPip}" install ${torchCmd}`, { timeout: 300000, stdio: "pipe" });

      // Step 4: Clone ComfyUI
      report("clone", 4, totalSteps, "Cloning ComfyUI...");
      if (!fs.existsSync(plan.comfyuiPath)) {
        execSync(`git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git "${plan.comfyuiPath}"`, { timeout: 120000, stdio: "pipe" });
      }

      // Step 5: Install dependencies
      report("deps", 5, totalSteps, "Installing ComfyUI dependencies...");
      execSync(`"${venvPip}" install -r "${path.join(plan.comfyuiPath, "requirements.txt")}"`, {
        timeout: 300000, stdio: "pipe",
      });

      // Health check
      report("verify", 5, totalSteps, "Running health check...");
      const mainPy = path.join(plan.comfyuiPath, "main.py");
      if (!fs.existsSync(mainPy)) {
        return { success: false, error: "ComfyUI main.py not found after installation" };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Start ComfyUI using the isolated venv.
   */
  startComfyUI(plan: InstallPlan, port: number = 8188): ChildProcess {
    const venvPython = this.getVenvPython(plan);
    const mainPy = path.join(plan.comfyuiPath, "main.py");

    const args = [mainPy, "--port", String(port), "--listen", "127.0.0.1"];
    return spawn(venvPython, args, {
      cwd: plan.comfyuiPath,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }

  private getVenvPython(plan: InstallPlan): string {
    if (plan.os === "win32") {
      return path.join(plan.venvPath, "Scripts", "python.exe");
    }
    return path.join(plan.venvPath, "bin", "python3");
  }

  private getVenvPip(plan: InstallPlan): string {
    if (plan.os === "win32") {
      return path.join(plan.venvPath, "Scripts", "pip.exe");
    }
    return path.join(plan.venvPath, "bin", "pip3");
  }

  private getPyTorchInstallCommand(plan: InstallPlan): string {
    if (plan.gpuType === "nvidia" && plan.cudaAvailable) {
      return "torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121";
    }
    if (plan.gpuType === "apple") {
      return "torch torchvision torchaudio";
    }
    return "torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu";
  }
}
