'use strict';

/**
 * HardwareDetector — queries local hardware info using Node.js built-ins.
 * No external dependencies. Returns CPU, RAM, GPU estimate, storage.
 */

const os = require('os');
const { execSync } = require('child_process');

function safeExec(cmd, timeout = 3000) {
  try {
    return execSync(cmd, { timeout, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

function detectGPUWindows() {
  const raw = safeExec(
    'powershell -Command "Get-WmiObject Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json"',
  );
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items
      .filter((g) => g && g.Name)
      .map((g) => ({
        name: g.Name,
        vramMB: g.AdapterRAM ? Math.round(g.AdapterRAM / 1024 / 1024) : null,
        vramGB: g.AdapterRAM ? +(g.AdapterRAM / 1024 / 1024 / 1024).toFixed(1) : null,
      }));
  } catch {
    return [];
  }
}

function detectGPULinux() {
  const nvidia = safeExec('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits');
  if (nvidia) {
    return nvidia
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, memMiB] = line.split(',').map((s) => s.trim());
        const vramMB = parseInt(memMiB, 10) || null;
        return { name, vramMB, vramGB: vramMB ? +(vramMB / 1024).toFixed(1) : null };
      });
  }
  const amd = safeExec('rocm-smi --showmeminfo vram --json');
  if (amd) {
    try {
      const data = JSON.parse(amd);
      return Object.values(data).map((gpu) => ({
        name: gpu['GPU ID'] || 'AMD GPU',
        vramMB: gpu['VRAM Total Memory (B)'] ? Math.round(gpu['VRAM Total Memory (B)'] / 1024 / 1024) : null,
        vramGB: gpu['VRAM Total Memory (B)']
          ? +(gpu['VRAM Total Memory (B)'] / 1024 / 1024 / 1024).toFixed(1)
          : null,
      }));
    } catch {
      return [];
    }
  }
  return [];
}

function detectGPU() {
  const platform = process.platform;
  if (platform === 'win32') return detectGPUWindows();
  if (platform === 'linux') return detectGPULinux();
  if (platform === 'darwin') {
    const raw = safeExec(
      'system_profiler SPDisplaysDataType -json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); [print(g.get(\'spdisplays_vendor\',\'Apple GPU\'), g.get(\'spdisplays_vram\',\'?\')) for g in d.get(\'SPDisplaysDataType\',[])]"',
    );
    if (raw) {
      return raw
        .split('\n')
        .filter(Boolean)
        .map((line) => ({ name: line, vramMB: null, vramGB: null }));
    }
  }
  return [];
}

function getHardwareInfo() {
  const cpus = os.cpus();
  const totalRamBytes = os.totalmem();
  const freeRamBytes = os.freemem();
  const usedRamBytes = totalRamBytes - freeRamBytes;

  const gpus = detectGPU();
  const primaryGPU = gpus[0] || null;
  const vramGB = primaryGPU?.vramGB || null;

  return {
    cpu: {
      model: cpus[0]?.model || 'Unknown',
      cores: cpus.length,
      speedMHz: cpus[0]?.speed || null,
    },
    ram: {
      totalGB: +(totalRamBytes / 1024 / 1024 / 1024).toFixed(1),
      usedGB: +(usedRamBytes / 1024 / 1024 / 1024).toFixed(1),
      freeGB: +(freeRamBytes / 1024 / 1024 / 1024).toFixed(1),
    },
    gpu: primaryGPU,
    gpus,
    vramGB,
    os: {
      platform: process.platform,
      version: os.release(),
      arch: process.arch,
    },
  };
}

/**
 * Check if a model with the given requirements can run on this hardware.
 * @param {{ vramGB?: number, ramGB?: number, params?: string }} requirements
 */
function checkCompatibility(requirements = {}) {
  const hw = getHardwareInfo();
  const issues = [];
  const checks = {};

  if (requirements.vramGB && hw.vramGB !== null) {
    checks.vram = { required: requirements.vramGB, available: hw.vramGB };
    if (hw.vramGB < requirements.vramGB) {
      issues.push(
        `VRAM insuficiente: disponible ${hw.vramGB} GB, requerida ${requirements.vramGB} GB (faltan ${+(requirements.vramGB - hw.vramGB).toFixed(1)} GB)`,
      );
    }
  } else if (requirements.vramGB && hw.vramGB === null) {
    checks.vram = { required: requirements.vramGB, available: 'unknown' };
    issues.push('No se pudo detectar la VRAM disponible');
  }

  if (requirements.ramGB) {
    checks.ram = { required: requirements.ramGB, available: hw.ram.freeGB };
    if (hw.ram.freeGB < requirements.ramGB) {
      issues.push(
        `RAM libre insuficiente: disponible ${hw.ram.freeGB} GB, requerida ${requirements.ramGB} GB`,
      );
    }
  }

  let status = 'compatible';
  if (issues.length > 0 && issues.some((i) => i.includes('insuficiente'))) {
    status = 'incompatible';
  } else if (issues.length > 0) {
    status = 'compatible_with_limitations';
  }

  return { status, issues, checks, hardware: hw };
}

module.exports = { getHardwareInfo, checkCompatibility };
