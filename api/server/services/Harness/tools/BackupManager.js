/**
 * BackupManager — Data backup and restore
 * License: MIT — Zero cost
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class BackupManager {
  constructor(options = {}) {
    this.backupDir = options.backupDir || path.join(process.cwd(), 'data', 'backups');
    this.maxBackups = options.maxBackups || 10;
    this.initialized = false;
    this.stats = { backups: 0, restores: 0 };
  }

  initialize() {
    if (!fs.existsSync(this.backupDir)) fs.mkdirSync(this.backupDir, { recursive: true });
    this.initialized = true;
    return { status: 'ok', module: 'BackupManager' };
  }

  /**
   * Create a backup
   */
  createBackup({ name, includePaths = [] } = {}) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = name || `backup_${timestamp}`;
    const backupPath = path.join(this.backupDir, `${backupName}.json`);
    
    const data = {
      name: backupName,
      timestamp: new Date().toISOString(),
      version: '1.0',
      contents: {}
    };

    for (const p of includePaths) {
      try {
        if (fs.existsSync(p)) {
          data.contents[p] = JSON.parse(fs.readFileSync(p, 'utf8'));
        }
      } catch (e) { /* skip */ }
    }

    // Also backup common data directories
    const dataDir = path.join(process.cwd(), 'data');
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          data.contents[`data/${file}`] = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
        } catch (e) { /* skip */ }
      }
    }

    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
    this.stats.backups++;
    this._cleanupOldBackups();
    return { success: true, name: backupName, path: backupPath, size: fs.statSync(backupPath).size };
  }

  /**
   * Restore from backup
   */
  restoreBackup(backupName) {
    const backupPath = path.join(this.backupDir, `${backupName}.json`);
    if (!fs.existsSync(backupPath)) return { success: false, error: 'Backup not found' };
    
    const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    let restored = 0;
    for (const [filePath, content] of Object.entries(data.contents || {})) {
      try {
        const fullPath = path.join(process.cwd(), filePath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, JSON.stringify(content, null, 2));
        restored++;
      } catch (e) { /* skip */ }
    }
    this.stats.restores++;
    return { success: true, name: backupName, restoredFiles: restored };
  }

  /**
   * List backups
   */
  list() {
    if (!fs.existsSync(this.backupDir)) return [];
    return fs.readdirSync(this.backupDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const stat = fs.statSync(path.join(this.backupDir, f));
        return { name: f.replace('.json', ''), path: path.join(this.backupDir, f), size: stat.size, created: stat.mtime };
      })
      .sort((a, b) => b.created - a.created);
  }

  _cleanupOldBackups() {
    const backups = this.list();
    if (backups.length > this.maxBackups) {
      for (const b of backups.slice(this.maxBackups)) {
        try { fs.unlinkSync(b.path); } catch (e) {}
      }
    }
  }

  getStats() { return { ...this.stats, totalBackups: this.list().length }; }
}

module.exports = BackupManager;
