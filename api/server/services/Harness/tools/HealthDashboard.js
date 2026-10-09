/**
 * HealthDashboard — System monitoring and metrics
 * License: MIT — Zero cost
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

class HealthDashboard {
  constructor(options = {}) {
    this.metricsPath = options.metricsPath || path.join(process.cwd(), 'data', 'metrics.json');
    this.metrics = { requests: 0, errors: 0, tokens: 0, latency: [], uptime: Date.now() };
    this.initialized = false;
  }

  initialize() {
    this.initialized = true;
    this._loadMetrics();
    return { status: 'ok', module: 'HealthDashboard' };
  }

  /**
   * Get system health overview
   */
  getHealth() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        uptime: Math.floor((Date.now() - this.metrics.uptime) / 1000),
        memory: {
          total: Math.round(os.totalmem() / 1024 / 1024),
          free: Math.round(os.freemem() / 1024 / 1024),
          used: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024),
          usagePercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100)
        },
        cpu: {
          cores: os.cpus().length,
          model: os.cpus()[0]?.model || 'unknown',
          usage: os.loadavg()
        }
      },
      metrics: {
        totalRequests: this.metrics.requests,
        totalErrors: this.metrics.errors,
        errorRate: this.metrics.requests > 0 ? (this.metrics.errors / this.metrics.requests * 100).toFixed(2) + '%' : '0%',
        totalTokens: this.metrics.tokens,
        avgLatency: this.metrics.latency.length > 0 ? Math.round(this.metrics.latency.reduce((a, b) => a + b, 0) / this.metrics.latency.length) : 0
      }
    };
  }

  /**
   * Record a metric
   */
  record({ type, value, metadata = {} }) {
    if (type === 'request') this.metrics.requests++;
    else if (type === 'error') this.metrics.errors++;
    else if (type === 'tokens') this.metrics.tokens += value;
    else if (type === 'latency') { this.metrics.latency.push(value); if (this.metrics.latency.length > 1000) this.metrics.latency = this.metrics.latency.slice(-500); }
    this._saveMetrics();
  }

  /**
   * Get module status
   */
  getModuleStatus() {
    const modules = [
      'CognitiveEngine', 'MemoryEngine', 'LearningEngine', 'KnowledgeGraph',
      'RAGEngine', 'UniversalLLMRouter', 'TokenOptimizationEngine',
      'HookSystem', 'BrowserManager', 'CanvasManager', 'PluginMarketplace',
      'CloudAgent', 'PlanModeManager', 'CompanionManager', 'PlaybookManager',
      'DesktopController', 'CollectionsEngine', 'CredentialVault',
      'GoalManager', 'DoctorModule', 'DeeperSearchV2', 'LLMGateway'
    ];
    const base = path.join(process.cwd(), 'api/server/services/Harness');
    return modules.map(mod => {
      try { require(path.join(base, mod.includes('/') ? mod : `tools/${mod}`)); return { name: mod, status: 'loaded' }; }
      catch { try { require(path.join(base, `cognitive/${mod}`)); return { name: mod, status: 'loaded' }; }
      catch { return { name: mod, status: 'not_found' }; } }
    });
  }

  _loadMetrics() {
    try {
      if (fs.existsSync(this.metricsPath)) {
        const data = JSON.parse(fs.readFileSync(this.metricsPath, 'utf8'));
        this.metrics = { ...this.metrics, ...data };
      }
    } catch (e) { /* ignore */ }
  }

  _saveMetrics() {
    try {
      const dir = path.dirname(this.metricsPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.metricsPath, JSON.stringify(this.metrics, null, 2));
    } catch (e) { /* ignore */ }
  }

  getStats() { return { initialized: this.initialized, ...this.metrics }; }
}

module.exports = HealthDashboard;
