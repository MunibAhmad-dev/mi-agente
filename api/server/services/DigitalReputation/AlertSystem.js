'use strict';

/**
 * AlertSystem — Face 19-20.
 * Alert system for new reputation mentions and sentiment spikes.
 * Supports keyword-based rules, webhook delivery, and in-memory alert history.
 */

const EventEmitter = require('events');

const ALERT_TYPES = ['mention', 'sentiment_spike', 'new_dispute', 'claim_detected', 'source_flagged', 'threshold_breach'];
const SEVERITY_LEVELS = ['info', 'warning', 'critical'];

class AlertSystem extends EventEmitter {
  constructor() {
    super();
    this._rules = new Map();
    this._alerts = [];
    this._webhooks = [];
    this._stats = { total: 0, by_type: {}, by_severity: {} };
  }

  addRule({ id, name, type = 'mention', keywords = [], severity = 'info', enabled = true, subject_id = null, threshold = null }) {
    const ruleId = id || `rule_${Date.now()}`;
    const rule = { id: ruleId, name, type, keywords, severity, enabled, subject_id, threshold, created_at: new Date().toISOString() };
    this._rules.set(ruleId, rule);
    return rule;
  }

  removeRule(id) { return this._rules.delete(id); }
  getRule(id) { return this._rules.get(id) || null; }
  listRules() { return Array.from(this._rules.values()); }

  addWebhook({ url, secret = null, events = [] }) {
    const hook = { id: `wh_${Date.now()}`, url, secret, events, active: true, added_at: new Date().toISOString() };
    this._webhooks.push(hook);
    return hook;
  }

  /**
   * Process content/event and fire matching alerts.
   * @param {object} event - { type, content, subject_id, score, metadata }
   * @returns {Array} fired alerts
   */
  async process(event) {
    const fired = [];
    for (const rule of this._rules.values()) {
      if (!rule.enabled) continue;
      if (rule.subject_id && event.subject_id !== rule.subject_id) continue;
      if (rule.type !== event.type && event.type !== 'any') continue;

      let matches = false;
      if (rule.keywords.length === 0) {
        matches = true;
      } else {
        const content = (event.content || '').toLowerCase();
        matches = rule.keywords.some((kw) => content.includes(kw.toLowerCase()));
      }

      if (rule.threshold !== null && event.score !== undefined) {
        matches = matches && Math.abs(event.score) >= rule.threshold;
      }

      if (matches) {
        const alert = this._createAlert({ rule, event });
        fired.push(alert);
        this.emit('alert', alert);
        await this._deliverToWebhooks(alert);
      }
    }
    return fired;
  }

  _createAlert({ rule, event }) {
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      rule_id: rule.id,
      rule_name: rule.name,
      type: rule.type,
      severity: rule.severity,
      subject_id: event.subject_id || null,
      content_preview: (event.content || '').substring(0, 200),
      score: event.score,
      metadata: event.metadata || {},
      triggered_at: new Date().toISOString(),
      acknowledged: false,
    };
    this._alerts.push(alert);
    this._stats.total++;
    this._stats.by_type[alert.type] = (this._stats.by_type[alert.type] || 0) + 1;
    this._stats.by_severity[alert.severity] = (this._stats.by_severity[alert.severity] || 0) + 1;
    if (this._alerts.length > 10000) this._alerts.shift();
    return alert;
  }

  async _deliverToWebhooks(alert) {
    const axios = require('axios');
    for (const wh of this._webhooks) {
      if (!wh.active) continue;
      if (wh.events.length && !wh.events.includes(alert.type)) continue;
      try {
        await axios.post(wh.url, { alert }, { timeout: 5000 });
      } catch {}
    }
  }

  acknowledge(alertId) {
    const alert = this._alerts.find((a) => a.id === alertId);
    if (!alert) throw new Error(`Alert not found: ${alertId}`);
    alert.acknowledged = true;
    alert.acknowledged_at = new Date().toISOString();
    return alert;
  }

  getAlerts({ severity, type, unacknowledged, limit = 50 } = {}) {
    let items = [...this._alerts];
    if (severity) items = items.filter((a) => a.severity === severity);
    if (type) items = items.filter((a) => a.type === type);
    if (unacknowledged) items = items.filter((a) => !a.acknowledged);
    return items.slice(-limit).reverse();
  }

  getStats() { return { ...this._stats, rule_count: this._rules.size, alert_count: this._alerts.length }; }
}

let _instance = null;
function getAlertSystem() {
  if (!_instance) _instance = new AlertSystem();
  return _instance;
}

module.exports = { AlertSystem, getAlertSystem, ALERT_TYPES, SEVERITY_LEVELS };
