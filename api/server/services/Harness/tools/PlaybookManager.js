/**
 * PlaybookManager — Reusable Workflow Sequences
 * Equivalent to Manus Playbooks
 * 
 * License: MIT — Zero cost, custom implementation
 */

const path = require('path');
const fs = require('fs');

class PlaybookManager {
  constructor(options = {}) {
    this.dataPath = options.dataPath || path.join(process.cwd(), 'data', 'playbooks.json');
    this.playbooks = new Map();
    this.initialized = false;
    this.stats = { created: 0, executed: 0 };
  }

  initialize() {
    this._load();
    this.initialized = true;
    return { status: 'ok', module: 'PlaybookManager', count: this.playbooks.size };
  }

  /**
   * Create a playbook (reusable workflow)
   */
  create({ name, description, steps, triggers = [], variables = {}, tags = [] }) {
    const id = `playbook_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const playbook = {
      id, name, description,
      steps: steps || [], // [{ action, params, condition, onFail }]
      triggers, // ['manual', 'schedule:*/5 * * * *', 'event:task_complete']
      variables,
      tags,
      version: 1,
      stats: { runs: 0, successes: 0, failures: 0, avgDuration: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastRun: null
    };
    this.playbooks.set(id, playbook);
    this.stats.created++;
    this._save();
    return playbook;
  }

  /**
   * Execute a playbook
   */
  async execute(playbookId, { variables = {}, dryRun = false } = {}) {
    const pb = this.playbooks.get(playbookId);
    if (!pb) throw new Error('Playbook not found');
    
    const mergedVars = { ...pb.variables, ...variables };
    const result = { playbookId, steps: [], startTime: Date.now(), success: true };
    
    for (const step of pb.steps) {
      if (step.condition && !this._evaluateCondition(step.condition, mergedVars)) {
        result.steps.push({ ...step, status: 'skipped' });
        continue;
      }
      if (dryRun) {
        result.steps.push({ ...step, status: 'dry-run', wouldExecute: true });
        continue;
      }
      // Execute the step action using available tools
      try {
        const stepResult = await this._executeStep(step, mergedVars);
        result.steps.push({ ...step, status: stepResult.success ? 'completed' : 'failed', result: stepResult });
        if (!stepResult.success && step.onFail === 'abort') { result.success = false; break; }
      } catch (e) {
        result.steps.push({ ...step, status: 'error', error: e.message });
        if (step.onFail === 'abort') { result.success = false; break; }
      }
    }

    result.endTime = Date.now();
    result.duration = result.endTime - result.startTime;
    pb.stats.runs++;
    pb.lastRun = new Date().toISOString();
    this.stats.executed++;
    this._save();
    return result;
  }

  /**
   * Execute a single playbook step using available system tools.
   */
  async _executeStep(step, vars) {
    const action = (step.action || '').toLowerCase();
    const params = { ...step.params };

    // Substitute variables in params
    for (const [k, v] of Object.entries(vars)) {
      for (const pk of Object.keys(params)) {
        if (typeof params[pk] === 'string') {
          params[pk] = params[pk].replace(new RegExp(`\{\{${k}\}\}`, 'g'), v);
        }
      }
    }

    try {
      // File operations
      if (action === 'read_file' || action === 'read') {
        const fs = require('fs');
        const content = fs.readFileSync(params.path || params.file, 'utf8');
        return { success: true, data: content.substring(0, 5000) };
      }
      if (action === 'write_file' || action === 'write') {
        const fs = require('fs');
        const dir = require('path').dirname(params.path || params.file);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(params.path || params.file, params.content || params.data || '');
        return { success: true, path: params.path || params.file };
      }
      if (action === 'list_directory' || action === 'list') {
        const fs = require('fs');
        const items = fs.readdirSync(params.path || params.dir || '.');
        return { success: true, items };
      }

      // Shell operations — use execFile with structured args (no shell injection)
      if (action === 'execute_command' || action === 'shell' || action === 'run') {
        const { execFileSync } = require('child_process');
        const rawCmd = params.command || params.cmd || '';
        const args = rawCmd.trim().split(/\s+/);
        const cmd = args.shift();
        if (!cmd) return { success: false, error: 'No command specified' };
        const output = execFileSync(cmd, args, { timeout: 30000, encoding: 'utf8' });
        return { success: true, output };
      }

      // Search operations — use structured execFile args
      if (action === 'grep' || action === 'search') {
        const { execFileSync } = require('child_process');
        const pattern = String(params.pattern || '');
        const searchPath = String(params.path || '.');
        const output = execFileSync('grep', ['-rn', '--', pattern, searchPath], { timeout: 10000, encoding: 'utf8' });
        return { success: true, matches: output.split('\n').filter(Boolean) };
      }

      // Git operations — use structured execFile args
      if (action === 'git') {
        const { execFileSync } = require('child_process');
        const gitArgs = String(params.command || 'status').trim().split(/\s+/);
        const output = execFileSync('git', gitArgs, { timeout: 10000, encoding: 'utf8' });
        return { success: true, output };
      }

      // HTTP operations
      if (action === 'fetch' || action === 'http') {
        const response = await fetch(params.url);
        const data = await response.text();
        return { success: true, status: response.status, data: data.substring(0, 5000) };
      }

      // Delay/wait
      if (action === 'wait' || action === 'delay') {
        await new Promise(r => setTimeout(r, params.ms || params.seconds * 1000 || 1000));
        return { success: true, waited: params.ms || params.seconds * 1000 };
      }

      // Unknown action — report it
      return { success: false, error: `Unknown action: ${action}. Supported: read_file, write_file, execute_command, grep, git, fetch, wait` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  _evaluateCondition(condition, vars) {
    const { safeEvalCondition } = require('./safeEval');
    try {
      let expr = condition;
      for (const [k, v] of Object.entries(vars)) {
        expr = expr.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), JSON.stringify(v));
      }
      return safeEvalCondition(expr);
    } catch { return true; }
  }

  /**
   * List playbooks
   */
  list({ tag, limit = 50 } = {}) {
    let pbs = Array.from(this.playbooks.values());
    if (tag) pbs = pbs.filter(p => p.tags.includes(tag));
    return pbs.slice(0, limit);
  }

  get(playbookId) { return this.playbooks.get(playbookId) || null; }
  
  delete(playbookId) { const d = this.playbooks.delete(playbookId); if (d) this._save(); return d; }

  /**
   * Convert a successful task execution into a playbook
   */
  extractFromExecution({ taskType, steps, tools, success = true }) {
    if (!success) return null;
    return this.create({
      name: `Auto: ${taskType}`,
      description: `Auto-generated from successful ${taskType} execution`,
      steps: steps.map((s, i) => ({ order: i + 1, action: s.action || s.tool, params: s.params || {} })),
      tags: ['auto-generated', taskType],
      variables: {}
    });
  }

  getStats() { return { ...this.stats, totalPlaybooks: this.playbooks.size }; }

  _load() {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
        for (const [id, p] of Object.entries(data)) this.playbooks.set(id, p);
      }
    } catch (e) { /* ignore */ }
  }

  async validate(playbookId) {
    const playbook = this.playbooks.get(playbookId);
    if (!playbook) return { valid: false, errors: ['Playbook not found'] };
    const errors = [];
    if (!playbook.name) errors.push('Missing name');
    if (!Array.isArray(playbook.steps) || playbook.steps.length === 0) errors.push('No steps defined');
    for (const [i, step] of (playbook.steps || []).entries()) {
      if (!step.action) errors.push(`Step ${i + 1} missing action`);
    }
    return { valid: errors.length === 0, errors, stepCount: (playbook.steps || []).length };
  }

  _save() {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.dataPath, JSON.stringify(Object.fromEntries(this.playbooks), null, 2));
    } catch (e) { /* ignore */ }
  }
}

module.exports = PlaybookManager;
