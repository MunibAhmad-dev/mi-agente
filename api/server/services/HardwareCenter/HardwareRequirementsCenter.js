'use strict';

/**
 * HardwareRequirementsCenter — Face 13.
 * Hardware specifications per model: RAM, VRAM, CPU, disk, compute requirements.
 * Used by the model browser to show viability for the current system.
 */

const DEFAULT_SPECS = {
  'llama3.2:1b': { vram_gb: 1, ram_gb: 4, disk_gb: 1.3, cpu_cores: 4, tier: 'minimal', gpu_required: false },
  'llama3.2:3b': { vram_gb: 2, ram_gb: 8, disk_gb: 2.0, cpu_cores: 4, tier: 'light', gpu_required: false },
  'llama3.2:8b': { vram_gb: 6, ram_gb: 16, disk_gb: 4.7, cpu_cores: 8, tier: 'standard', gpu_required: false },
  'llama3.2:70b': { vram_gb: 40, ram_gb: 64, disk_gb: 40, cpu_cores: 16, tier: 'heavy', gpu_required: true },
  'llama3.1:8b': { vram_gb: 6, ram_gb: 16, disk_gb: 4.7, cpu_cores: 8, tier: 'standard', gpu_required: false },
  'llama3.1:70b': { vram_gb: 40, ram_gb: 64, disk_gb: 40, cpu_cores: 16, tier: 'heavy', gpu_required: true },
  'mistral:7b': { vram_gb: 5, ram_gb: 16, disk_gb: 4.1, cpu_cores: 8, tier: 'standard', gpu_required: false },
  'codellama:7b': { vram_gb: 5, ram_gb: 16, disk_gb: 4.1, cpu_cores: 8, tier: 'standard', gpu_required: false },
  'codellama:34b': { vram_gb: 20, ram_gb: 32, disk_gb: 20, cpu_cores: 12, tier: 'heavy', gpu_required: true },
  'gemma2:2b': { vram_gb: 2, ram_gb: 8, disk_gb: 1.6, cpu_cores: 4, tier: 'light', gpu_required: false },
  'gemma2:9b': { vram_gb: 6, ram_gb: 16, disk_gb: 5.4, cpu_cores: 8, tier: 'standard', gpu_required: false },
  'phi3:mini': { vram_gb: 2, ram_gb: 8, disk_gb: 2.3, cpu_cores: 4, tier: 'light', gpu_required: false },
  'phi3:medium': { vram_gb: 10, ram_gb: 16, disk_gb: 8.0, cpu_cores: 8, tier: 'standard', gpu_required: false },
  'qwen2:7b': { vram_gb: 5, ram_gb: 16, disk_gb: 4.4, cpu_cores: 8, tier: 'standard', gpu_required: false },
  'deepseek-coder:6.7b': { vram_gb: 5, ram_gb: 16, disk_gb: 3.8, cpu_cores: 8, tier: 'standard', gpu_required: false },
  'nomic-embed-text': { vram_gb: 0.5, ram_gb: 4, disk_gb: 0.3, cpu_cores: 2, tier: 'minimal', gpu_required: false },
  'mxbai-embed-large': { vram_gb: 1, ram_gb: 4, disk_gb: 0.7, cpu_cores: 2, tier: 'minimal', gpu_required: false },
  'llava:7b': { vram_gb: 6, ram_gb: 16, disk_gb: 4.7, cpu_cores: 8, tier: 'standard', gpu_required: false },
  'llava:34b': { vram_gb: 20, ram_gb: 32, disk_gb: 20, cpu_cores: 12, tier: 'heavy', gpu_required: true },
};

const TIERS = ['minimal', 'light', 'standard', 'heavy'];

class HardwareRequirementsCenter {
  constructor() {
    this._specs = new Map(Object.entries(DEFAULT_SPECS));
    this._system = null;
  }

  getSpecs(modelId) {
    return this._specs.get(modelId) || this._inferSpecs(modelId);
  }

  addSpecs(modelId, specs) {
    const full = { vram_gb: 0, ram_gb: 8, disk_gb: 2, cpu_cores: 4, tier: 'standard', gpu_required: false, ...specs };
    this._specs.set(modelId, full);
    return full;
  }

  listAll() {
    return Array.from(this._specs.entries()).map(([id, specs]) => ({ model_id: id, ...specs }));
  }

  getByTier(tier) {
    if (!TIERS.includes(tier)) throw new Error(`Invalid tier: ${tier}`);
    return Array.from(this._specs.entries())
      .filter(([, s]) => s.tier === tier)
      .map(([id, s]) => ({ model_id: id, ...s }));
  }

  /**
   * Set current system specs for viability checking.
   */
  setSystem({ vram_gb, ram_gb, cpu_cores, has_gpu = false, disk_free_gb = 100 }) {
    this._system = { vram_gb, ram_gb, cpu_cores, has_gpu, disk_free_gb };
    return this._system;
  }

  /**
   * Check if a model can run on the registered system specs.
   * @param {string} modelId
   * @returns {{ viable: boolean, issues: string[], score: number }}
   */
  checkViability(modelId) {
    const model = this.getSpecs(modelId);
    if (!this._system) return { viable: null, issues: ['System specs not registered'], score: 0 };

    const issues = [];
    const sys = this._system;

    if (model.gpu_required && !sys.has_gpu) issues.push(`Requires GPU (no GPU detected)`);
    if (model.vram_gb > (sys.vram_gb || 0)) issues.push(`Needs ${model.vram_gb}GB VRAM, have ${sys.vram_gb || 0}GB`);
    if (model.ram_gb > sys.ram_gb) issues.push(`Needs ${model.ram_gb}GB RAM, have ${sys.ram_gb}GB`);
    if (model.cpu_cores > sys.cpu_cores) issues.push(`Needs ${model.cpu_cores} CPU cores, have ${sys.cpu_cores}`);
    if (model.disk_gb > sys.disk_free_gb) issues.push(`Needs ${model.disk_gb}GB disk, have ${sys.disk_free_gb}GB free`);

    const score = issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 25);
    return { viable: issues.length === 0, issues, score, model_id: modelId, specs: model };
  }

  /**
   * Rank models by viability for the registered system.
   */
  rankByViability() {
    if (!this._system) return [];
    return Array.from(this._specs.keys())
      .map((id) => ({ model_id: id, ...this.checkViability(id) }))
      .sort((a, b) => b.score - a.score);
  }

  _inferSpecs(modelId) {
    const lower = modelId.toLowerCase();
    if (lower.includes('70b') || lower.includes('65b')) return { vram_gb: 40, ram_gb: 64, disk_gb: 40, cpu_cores: 16, tier: 'heavy', gpu_required: true };
    if (lower.includes('34b') || lower.includes('33b')) return { vram_gb: 20, ram_gb: 32, disk_gb: 20, cpu_cores: 12, tier: 'heavy', gpu_required: true };
    if (lower.includes('13b') || lower.includes('14b')) return { vram_gb: 8, ram_gb: 16, disk_gb: 8, cpu_cores: 8, tier: 'standard', gpu_required: false };
    if (lower.includes('7b') || lower.includes('8b')) return { vram_gb: 5, ram_gb: 16, disk_gb: 5, cpu_cores: 8, tier: 'standard', gpu_required: false };
    if (lower.includes('3b') || lower.includes('2b')) return { vram_gb: 2, ram_gb: 8, disk_gb: 2, cpu_cores: 4, tier: 'light', gpu_required: false };
    if (lower.includes('1b') || lower.includes('embed')) return { vram_gb: 1, ram_gb: 4, disk_gb: 1, cpu_cores: 2, tier: 'minimal', gpu_required: false };
    return { vram_gb: 4, ram_gb: 8, disk_gb: 4, cpu_cores: 4, tier: 'standard', gpu_required: false };
  }
}

let _instance = null;
function getHardwareRequirementsCenter() {
  if (!_instance) _instance = new HardwareRequirementsCenter();
  return _instance;
}

module.exports = { HardwareRequirementsCenter, getHardwareRequirementsCenter, TIERS, DEFAULT_SPECS };
