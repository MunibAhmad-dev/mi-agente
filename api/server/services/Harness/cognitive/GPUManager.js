/**
 * GPUManager.js — GPU Detection & Management
 * 
 * Detects and manages GPU resources:
 * - Detect GPUs
 * - Monitor VRAM
 * - Select optimal GPU
 * - Track usage
 * 
 * License: MIT
 * RAM: ~2MB
 */

const { execSync } = require('child_process');

class GPUManager {
    constructor(config = {}) {
        this._name = 'GPUManager';
        this._gpus = [];
        this._lastScan = null;
    }

    detect() {
        this._gpus = [];
        try {
            const output = execSync('nvidia-smi --query-gpu=name,memory.total,memory.free,utilization.gpu --format=csv,noheader,nounits', { encoding: 'utf8', timeout: 5000 });
            const lines = output.trim().split('\n');
            for (const line of lines) {
                const [name, total, free, utilization] = line.split(',').map(s => s.trim());
                this._gpus.push({ name, totalVRAM: parseInt(total), freeVRAM: parseInt(free), utilization: parseInt(utilization), driver: 'NVIDIA' });
            }
        } catch {
            this._gpus = [{ name: 'CPU Only', totalVRAM: 0, freeVRAM: 0, utilization: 0, driver: 'none' }];
        }
        this._lastScan = Date.now();
        return this._gpus;
    }

    getBestGPU(requiredVRAM = 0) {
        if (this._gpus.length === 0) this.detect();
        const available = this._gpus.filter(g => g.freeVRAM >= requiredVRAM && g.utilization < 90);
        return available.sort((a, b) => b.freeVRAM - a.freeVRAM)[0] || null;
    }

    getStats() { return { gpus: this._gpus.length, lastScan: this._lastScan, gpus: this._gpus }; }
}

module.exports = { GPUManager };
module.exports.default = GPUManager;
