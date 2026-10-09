/**
 * LogManager — Structured logging with levels and persistence
 * License: MIT — Zero cost
 */

const fs = require('fs');
const path = require('path');

class LogManager {
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(process.cwd(), 'data', 'logs');
    this.level = options.level || 'info';
    this.levels = { error: 0, warn: 1, info: 2, debug: 3 };
    this.logs = [];
    this.maxLogs = options.maxLogs || 10000;
    this.initialized = false;
  }

  initialize() {
    if (!fs.existsSync(this.logDir)) fs.mkdirSync(this.logDir, { recursive: true });
    this.initialized = true;
    return { status: 'ok', module: 'LogManager' };
  }

  _shouldLog(level) { return (this.levels[level] || 0) <= (this.levels[this.level] || 2); }

  _log(level, message, meta = {}) {
    if (!this._shouldLog(level)) return;
    const entry = { level, message, meta, timestamp: new Date().toISOString(), pid: process.pid };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs = this.logs.slice(-this.maxLogs / 2);
    // Also write to file
    try {
      const date = new Date().toISOString().split('T')[0];
      const filePath = path.join(this.logDir, `${date}.log`);
      fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');
    } catch (e) {}
    // Console output
    const prefix = { error: '❌', warn: '⚠️', info: 'ℹ️', debug: '🔍' }[level] || 'ℹ️';
    console.log(`${prefix} [${entry.timestamp}] ${message}`, Object.keys(meta).length > 0 ? meta : '');
  }

  error(msg, meta) { this._log('error', msg, meta); }
  warn(msg, meta) { this._log('warn', msg, meta); }
  info(msg, meta) { this._log('info', msg, meta); }
  debug(msg, meta) { this._log('debug', msg, meta); }

  getLogs({ level, limit = 100, since } = {}) {
    let logs = [...this.logs];
    if (level) logs = logs.filter(l => l.level === level);
    if (since) logs = logs.filter(l => new Date(l.timestamp) >= new Date(since));
    return logs.slice(-limit);
  }

  clear() { this.logs = []; return { success: true }; }
  getStats() { return { ...this.levels, totalLogs: this.logs.length, level: this.level }; }
}

module.exports = LogManager;
