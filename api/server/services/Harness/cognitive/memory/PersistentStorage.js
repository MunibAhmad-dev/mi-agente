'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * PersistentStorage - Disk-based persistence for cognitive data.
 * Uses JSON files organized by user/project.
 * No external database needed.
 */
class PersistentStorage {
  constructor(config = {}) {
    this.baseDir = config.storageDir || path.join(process.cwd(), 'data', 'cognitive');
    this.usersDir = path.join(this.baseDir, 'users');
    this.sharedDir = path.join(this.baseDir, 'shared');

    this._ensureDirs();
    this.cache = new Map();
    this.stats = { reads: 0, writes: 0, cacheHits: 0 };
  }

  _ensureDirs() {
    for (const dir of [this.baseDir, this.usersDir, this.sharedDir]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
  }

  // ===================== USER-SCOPED STORAGE =====================

  /**
   * Save data for a specific user and namespace.
   */
  async saveUser(userId, namespace, key, data) {
    const userDir = path.join(this.usersDir, this._sanitize(userId));
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

    const nsDir = path.join(userDir, this._sanitize(namespace));
    if (!fs.existsSync(nsDir)) fs.mkdirSync(nsDir, { recursive: true });

    const filePath = path.join(nsDir, `${this._sanitize(key)}.json`);
    const entry = {
      id: key,
      data,
      updatedAt: Date.now(),
      checksum: this._checksum(data),
    };

    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
    this.cache.set(`${userId}:${namespace}:${key}`, entry);
    this.stats.writes++;
    return entry;
  }

  /**
   * Load data for a specific user and namespace.
   */
  async loadUser(userId, namespace, key) {
    const cacheKey = `${userId}:${namespace}:${key}`;
    if (this.cache.has(cacheKey)) {
      this.stats.cacheHits++;
      return this.cache.get(cacheKey);
    }

    const filePath = path.join(this.usersDir, this._sanitize(userId), this._sanitize(namespace), `${this._sanitize(key)}.json`);
    if (!fs.existsSync(filePath)) return null;

    try {
      const entry = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      this.cache.set(cacheKey, entry);
      this.stats.reads++;
      return entry;
    } catch (e) {
      return null;
    }
  }

  /**
   * List all keys in a user namespace.
   */
  async listUser(userId, namespace) {
    const nsDir = path.join(this.usersDir, this._sanitize(userId), this._sanitize(namespace));
    if (!fs.existsSync(nsDir)) return [];

    return fs.readdirSync(nsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  }

  /**
   * Delete a user key.
   */
  async deleteUser(userId, namespace, key) {
    const filePath = path.join(this.usersDir, this._sanitize(userId), this._sanitize(namespace), `${this._sanitize(key)}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      this.cache.delete(`${userId}:${namespace}:${key}`);
      return true;
    }
    return false;
  }

  // ===================== SHARED STORAGE =====================

  async saveShared(namespace, key, data) {
    const nsDir = path.join(this.sharedDir, this._sanitize(namespace));
    if (!fs.existsSync(nsDir)) fs.mkdirSync(nsDir, { recursive: true });

    const filePath = path.join(nsDir, `${this._sanitize(key)}.json`);
    const entry = { id: key, data, updatedAt: Date.now() };
    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
    this.stats.writes++;
    return entry;
  }

  async loadShared(namespace, key) {
    const filePath = path.join(this.sharedDir, this._sanitize(namespace), `${this._sanitize(key)}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      this.stats.reads++;
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch { return null; }
  }

  // ===================== UTILITIES =====================

  getStorageSize() {
    let size = 0;
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const fp = path.join(dir, f.name);
        if (f.isDirectory()) walk(fp);
        else size += fs.statSync(fp).size;
      }
    };
    walk(this.baseDir);
    return size;
  }

  getUserCount() {
    if (!fs.existsSync(this.usersDir)) return 0;
    return fs.readdirSync(this.usersDir, { withFileTypes: true })
      .filter(f => f.isDirectory()).length;
  }

  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      storageSize: this.getStorageSize(),
      users: this.getUserCount(),
      baseDir: this.baseDir,
    };
  }

  _sanitize(name) {
    return String(name).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
  }

  _checksum(data) {
    return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex').substring(0, 8);
  }
}

module.exports = { PersistentStorage };
