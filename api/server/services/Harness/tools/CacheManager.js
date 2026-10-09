/**
 * CacheManager — Multi-level caching (memory + disk)
 * License: MIT — Zero cost
 */

const fs = require('fs');
const path = require('path');

class CacheManager {
  constructor(options = {}) {
    this.memoryCache = new Map();
    this.diskPath = options.diskPath || path.join(process.cwd(), 'data', 'cache');
    this.maxMemorySize = options.maxMemory || 1000;
    this.defaultTTL = options.ttl || 300000; // 5 min
    this.initialized = false;
    this.stats = { hits: 0, misses: 0, sets: 0 };
  }

  initialize() {
    if (!fs.existsSync(this.diskPath)) fs.mkdirSync(this.diskPath, { recursive: true });
    this.initialized = true;
    return { status: 'ok', module: 'CacheManager' };
  }

  /**
   * Get value from cache
   */
  get(key) {
    // Check memory first
    const memEntry = this.memoryCache.get(key);
    if (memEntry && Date.now() < memEntry.expiresAt) {
      this.stats.hits++;
      return memEntry.value;
    }

    // Check disk
    try {
      const filePath = path.join(this.diskPath, `${key.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (Date.now() < data.expiresAt) {
          this.stats.hits++;
          this.memoryCache.set(key, { value: data.value, expiresAt: data.expiresAt });
          return data.value;
        }
      }
    } catch (e) {}

    this.stats.misses++;
    return null;
  }

  /**
   * Set value in cache
   */
  set(key, value, { ttl = this.defaultTTL, memoryOnly = false } = {}) {
    const expiresAt = Date.now() + ttl;
    this.memoryCache.set(key, { value, expiresAt });
    this.stats.sets++;

    // Evict if too large
    if (this.memoryCache.size > this.maxMemorySize) {
      const oldest = this.memoryCache.keys().next().value;
      this.memoryCache.delete(oldest);
    }

    // Write to disk
    if (!memoryOnly) {
      try {
        const filePath = path.join(this.diskPath, `${key.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
        fs.writeFileSync(filePath, JSON.stringify({ value, expiresAt }));
      } catch (e) {}
    }
    return { success: true };
  }

  /**
   * Delete from cache
   */
  delete(key) {
    this.memoryCache.delete(key);
    try {
      const filePath = path.join(this.diskPath, `${key.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {}
    return { success: true };
  }

  clear() {
    this.memoryCache.clear();
    try { fs.readdirSync(this.diskPath).forEach(f => fs.unlinkSync(path.join(this.diskPath, f))); } catch (e) {}
    return { success: true };
  }

  getStats() {
    return {
      ...this.stats,
      hitRate: this.stats.hits + this.stats.misses > 0 ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(1) + '%' : '0%',
      memorySize: this.memoryCache.size,
      initialized: this.initialized
    };
  }
}

module.exports = CacheManager;
