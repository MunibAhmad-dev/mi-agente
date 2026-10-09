/**
 * Social Intelligence Logger
 * ==========================
 * Structured logging with context for all social intelligence operations.
 */

const config = require('./config');

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

class SILogger {
  constructor(module) {
    this.module = module;
    this.level = LOG_LEVELS[config.logging.level] || 1;
  }

  _log(level, message, data = {}) {
    if (LOG_LEVELS[level] < this.level) return;
    const entry = {
      ts: new Date().toISOString(),
      level,
      module: this.module,
      msg: message,
      ...data,
    };
    const line = JSON.stringify(entry);
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  debug(msg, data) { this._log('debug', msg, data); }
  info(msg, data) { this._log('info', msg, data); }
  warn(msg, data) { this._log('warn', msg, data); }
  error(msg, data) { this._log('error', msg, data); }

  child(subModule) {
    return new SILogger(`${this.module}:${subModule}`);
  }
}

function createLogger(module) {
  return new SILogger(module);
}

module.exports = { createLogger, SILogger };
