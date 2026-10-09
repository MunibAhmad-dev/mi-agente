/**
 * ClipboardManager — Clipboard operations for desktop integration
 * License: MIT — Zero cost
 */

const { execSync } = require('child_process');

class ClipboardManager {
  constructor() {
    this.initialized = false;
    this.history = [];
    this.maxHistory = 50;
  }

  initialize() { this.initialized = true; return { status: 'ok', module: 'ClipboardManager' }; }

  /**
   * Copy text to clipboard
   */
  copy(text) {
    try {
      if (process.platform === 'win32') execSync('clip', { input: text });
      else if (process.platform === 'darwin') execSync('pbcopy', { input: text });
      else execSync('xclip -selection clipboard', { input: text });
      this.history.push({ text: text.slice(0, 200), timestamp: new Date().toISOString() });
      if (this.history.length > this.maxHistory) this.history = this.history.slice(-this.maxHistory);
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  }

  /**
   * Paste from clipboard
   */
  paste() {
    try {
      let text;
      if (process.platform === 'win32') text = execSync('powershell -command "Get-Clipboard"', { encoding: 'utf8' }).trim();
      else if (process.platform === 'darwin') text = execSync('pbpaste', { encoding: 'utf8' }).trim();
      else text = execSync('xclip -selection clipboard -o', { encoding: 'utf8' }).trim();
      return { success: true, text };
    } catch (e) { return { success: false, error: e.message }; }
  }

  getHistory() { return this.history; }
  clearHistory() { this.history = []; return { success: true }; }
  getStats() { return { historySize: this.history.length, initialized: this.initialized }; }
}

module.exports = ClipboardManager;
