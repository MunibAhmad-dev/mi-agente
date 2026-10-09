/**
 * AlertManager — System alerts and notifications
 * License: MIT — Zero cost
 */

const EventEmitter = require('events');

class AlertManager extends EventEmitter {
  constructor() {
    super();
    this.alerts = new Map();
    this.rules = new Map();
    this.history = [];
    this.initialized = false;
    this.stats = { triggered: 0, resolved: 0 };
  }

  initialize() { this.initialized = true; return { status: 'ok', module: 'AlertManager' }; }

  /**
   * Create an alert
   */
  create({ id, severity = 'info', title, message, source, metadata = {} }) {
    const alertId = id || `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const alert = {
      id: alertId, severity, title, message, source, metadata,
      status: 'active', createdAt: new Date().toISOString(), resolvedAt: null
    };
    this.alerts.set(alertId, alert);
    this.history.push(alert);
    this.stats.triggered++;
    this.emit('alert', alert);
    return alert;
  }

  /**
   * Resolve an alert
   */
  resolve(alertId) {
    const alert = this.alerts.get(alertId);
    if (!alert) return null;
    alert.status = 'resolved';
    alert.resolvedAt = new Date().toISOString();
    this.stats.resolved++;
    this.emit('alert:resolved', alert);
    return alert;
  }

  /**
   * Add a monitoring rule
   */
  addRule({ name, condition, action = 'create_alert', severity = 'warning' }) {
    this.rules.set(name, { name, condition, action, severity, enabled: true });
    return { success: true, name };
  }

  /**
   * Check rules against metrics
   */
  checkRules(metrics = {}) {
    const { safeEvalCondition } = require('./safeEval');
    const triggered = [];
    for (const [name, rule] of this.rules) {
      if (!rule.enabled) continue;
      try {
        let expr = rule.condition;
        for (const [k, v] of Object.entries(metrics)) {
          expr = expr.replace(new RegExp(`\\b${k}\\b`, 'g'), JSON.stringify(v));
        }
        if (safeEvalCondition(expr)) {
          const alert = this.create({ severity: rule.severity, title: `Rule: ${name}`, message: `Condition met: ${rule.condition}` });
          triggered.push({ rule: name, alert: alert.id });
        }
      } catch (e) {}
    }
    return triggered;
  }

  /**
   * Get active alerts
   */
  getActive() { return Array.from(this.alerts.values()).filter(a => a.status === 'active'); }

  /**
   * Get alert history
   */
  getHistory({ limit = 50 } = {}) { return this.history.slice(-limit); }

  getStats() { return { ...this.stats, activeAlerts: this.getActive().length, rules: this.rules.size }; }
}

module.exports = AlertManager;
