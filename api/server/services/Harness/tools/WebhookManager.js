/**
 * WebhookManager — Event-driven webhook notifications
 * License: MIT — Zero cost
 */

const https = require('https');
const http = require('http');
const EventEmitter = require('events');

class WebhookManager extends EventEmitter {
  constructor() {
    super();
    this.webhooks = new Map();
    this.initialized = false;
    this.stats = { registered: 0, triggered: 0, failed: 0 };
  }

  initialize() { this.initialized = true; return { status: 'ok', module: 'WebhookManager' }; }

  register({ id, url, events = ['*'], secret, headers = {} }) {
    const hookId = id || `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.webhooks.set(hookId, { id: hookId, url, events, secret, headers, active: true, createdAt: new Date().toISOString() });
    this.stats.registered++;
    return { success: true, id: hookId };
  }

  async trigger(event, payload = {}) {
    const hooks = Array.from(this.webhooks.values()).filter(h => h.active && (h.events.includes('*') || h.events.includes(event)));
    const results = [];
    for (const hook of hooks) {
      try {
        await this._send(hook, { event, payload, timestamp: new Date().toISOString() });
        this.stats.triggered++;
        results.push({ id: hook.id, success: true });
      } catch (err) {
        this.stats.failed++;
        results.push({ id: hook.id, success: false, error: err.message });
      }
    }
    this.emit('webhooks:triggered', { event, results });
    return results;
  }

  async _send(hook, data) {
    return new Promise((resolve, reject) => {
      const url = new URL(hook.url);
      const client = url.protocol === 'https:' ? https : http;
      const body = JSON.stringify(data);
      const opts = {
        hostname: url.hostname, port: url.port, path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...hook.headers },
        timeout: 10000
      };
      const req = client.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  unregister(id) { return this.webhooks.delete(id); }
  list() { return Array.from(this.webhooks.values()); }
  getStats() { return { ...this.stats, totalWebhooks: this.webhooks.size }; }
}

module.exports = WebhookManager;
