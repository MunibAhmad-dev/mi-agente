/**
 * PluginMarketplace — Plugin Registry + Discovery + Install
 * Equivalent to GitHub Copilot Marketplace / GPT Store
 * 
 * License: better-sqlite3 is Public Domain — Zero cost
 */

const path = require('path');
const fs = require('fs');

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  // Fallback: in-memory JSON store if better-sqlite3 unavailable
  Database = null;
}

class PluginMarketplace {
  constructor(options = {}) {
    this.dbPath = options.dbPath || path.join(process.cwd(), 'data', 'plugins.db');
    this.pluginsDir = options.pluginsDir || path.join(process.cwd(), 'data', 'plugins');
    this.db = null;
    this.initialized = false;
    this.stats = { installed: 0, searched: 0, updated: 0 };
    this._memoryStore = new Map(); // fallback
  }

  initialize() {
    try {
      // Ensure directories exist
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(this.pluginsDir)) fs.mkdirSync(this.pluginsDir, { recursive: true });

      if (Database) {
        this.db = new Database(this.dbPath);
        this.db.pragma('journal_mode = WAL');
        this._createTables();
      }
      this.initialized = true;
      return { status: 'ok', module: 'PluginMarketplace', backend: Database ? 'sqlite' : 'memory' };
    } catch (err) {
      // Fallback to memory
      this.initialized = true;
      return { status: 'ok', module: 'PluginMarketplace', backend: 'memory' };
    }
  }

  _createTables() {
    if (!this.db) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS plugins (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        version TEXT DEFAULT '1.0.0',
        author TEXT,
        license TEXT DEFAULT 'MIT',
        category TEXT DEFAULT 'general',
        keywords TEXT DEFAULT '[]',
        dependencies TEXT DEFAULT '[]',
        rating REAL DEFAULT 0,
        downloads INTEGER DEFAULT 0,
        installed INTEGER DEFAULT 0,
        installPath TEXT,
        config TEXT DEFAULT '{}',
        createdAt TEXT,
        updatedAt TEXT
      );
      CREATE TABLE IF NOT EXISTS plugin_capabilities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pluginId TEXT NOT NULL,
        capability TEXT NOT NULL,
        description TEXT,
        FOREIGN KEY (pluginId) REFERENCES plugins(id)
      );
      CREATE TABLE IF NOT EXISTS plugin_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pluginId TEXT NOT NULL,
        userId TEXT,
        rating INTEGER CHECK(rating >= 1 AND rating <= 5),
        review TEXT,
        createdAt TEXT,
        FOREIGN KEY (pluginId) REFERENCES plugins(id)
      );
      CREATE INDEX IF NOT EXISTS idx_plugins_category ON plugins(category);
      CREATE INDEX IF NOT EXISTS idx_plugins_rating ON plugins(rating DESC);
    `);
  }

  /**
   * Register a new plugin
   */
  register(plugin) {
    const id = plugin.id || `plugin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record = {
      id,
      name: plugin.name,
      description: plugin.description || '',
      version: plugin.version || '1.0.0',
      author: plugin.author || 'unknown',
      license: plugin.license || 'MIT',
      category: plugin.category || 'general',
      keywords: JSON.stringify(plugin.keywords || []),
      dependencies: JSON.stringify(plugin.dependencies || []),
      rating: 0,
      downloads: 0,
      installed: 0,
      installPath: null,
      config: JSON.stringify(plugin.config || {}),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO plugins (id, name, description, version, author, license, category, keywords, dependencies, rating, downloads, installed, installPath, config, createdAt, updatedAt)
        VALUES (@id, @name, @description, @version, @author, @license, @category, @keywords, @dependencies, @rating, @downloads, @installed, @installPath, @config, @createdAt, @updatedAt)
      `);
      stmt.run(record);

      if (plugin.capabilities) {
        const capStmt = this.db.prepare('INSERT INTO plugin_capabilities (pluginId, capability, description) VALUES (?, ?, ?)');
        for (const cap of plugin.capabilities) {
          capStmt.run(id, cap.name || cap, cap.description || '');
        }
      }
    } else {
      this._memoryStore.set(id, { ...record, capabilities: plugin.capabilities || [] });
    }

    this.stats.installed++;
    return { success: true, id };
  }

  /**
   * Search plugins
   */
  search(query, { category, limit = 20, sortBy = 'rating' } = {}) {
    this.stats.searched++;
    if (this.db) {
      let sql = 'SELECT * FROM plugins WHERE 1=1';
      const params = [];
      if (query) { sql += ' AND (name LIKE ? OR description LIKE ? OR keywords LIKE ?)'; params.push(`%${query}%`, `%${query}%`, `%${query}%`); }
      if (category) { sql += ' AND category = ?'; params.push(category); }
      if (sortBy === 'rating') sql += ' ORDER BY rating DESC';
      else if (sortBy === 'downloads') sql += ' ORDER BY downloads DESC';
      else if (sortBy === 'newest') sql += ' ORDER BY createdAt DESC';
      sql += ' LIMIT ?';
      params.push(limit);
      return this.db.prepare(sql).all(...params).map(this._deserialize);
    }
    // Memory fallback
    let results = Array.from(this._memoryStore.values());
    if (query) results = results.filter(p => p.name.includes(query) || p.description.includes(query));
    if (category) results = results.filter(p => p.category === category);
    return results.slice(0, limit).map(this._deserialize);
  }

  /**
   * Install a plugin
   */
  install(pluginId, { userId = 'system' } = {}) {
    if (this.db) {
      const plugin = this.db.prepare('SELECT * FROM plugins WHERE id = ?').get(pluginId);
      if (!plugin) return { success: false, error: 'Plugin not found' };
      this.db.prepare('UPDATE plugins SET installed = 1, downloads = downloads + 1, installPath = ? WHERE id = ?').run(path.join(this.pluginsDir, pluginId), pluginId);
    } else {
      const plugin = this._memoryStore.get(pluginId);
      if (!plugin) return { success: false, error: 'Plugin not found' };
      plugin.installed = 1;
      plugin.downloads = (plugin.downloads || 0) + 1;
    }
    return { success: true, pluginId };
  }

  /**
   * Uninstall a plugin
   */
  uninstall(pluginId) {
    if (this.db) {
      this.db.prepare('UPDATE plugins SET installed = 0, installPath = NULL WHERE id = ?').run(pluginId);
    } else {
      const plugin = this._memoryStore.get(pluginId);
      if (plugin) plugin.installed = 0;
    }
    return { success: true, pluginId };
  }

  /**
   * Add review
   */
  addReview(pluginId, { userId, rating, review }) {
    if (this.db) {
      this.db.prepare('INSERT INTO plugin_reviews (pluginId, userId, rating, review, createdAt) VALUES (?, ?, ?, ?, ?)').run(pluginId, userId, rating, review, new Date().toISOString());
      const avg = this.db.prepare('SELECT AVG(rating) as avg FROM plugin_reviews WHERE pluginId = ?').get(pluginId);
      this.db.prepare('UPDATE plugins SET rating = ? WHERE id = ?').run(avg?.avg || 0, pluginId);
    }
    return { success: true };
  }

  /**
   * Get installed plugins
   */
  getInstalled() {
    if (this.db) {
      return this.db.prepare('SELECT * FROM plugins WHERE installed = 1').all().map(this._deserialize);
    }
    return Array.from(this._memoryStore.values()).filter(p => p.installed === 1).map(this._deserialize);
  }

  /**
   * Get plugin stats
   */
  getStats() {
    if (this.db) {
      const total = this.db.prepare('SELECT COUNT(*) as c FROM plugins').get();
      const installed = this.db.prepare('SELECT COUNT(*) as c FROM plugins WHERE installed = 1').get();
      return { ...this.stats, totalPlugins: total?.c || 0, installedPlugins: installed?.c || 0 };
    }
    return { ...this.stats, totalPlugins: this._memoryStore.size, installedPlugins: Array.from(this._memoryStore.values()).filter(p => p.installed === 1).length };
  }

  _deserialize(row) {
    if (!row) return row;
    return {
      ...row,
      keywords: typeof row.keywords === 'string' ? JSON.parse(row.keywords) : row.keywords,
      dependencies: typeof row.dependencies === 'string' ? JSON.parse(row.dependencies) : row.dependencies,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config
    };
  }

  async fetchRemoteManifest(registryUrl) {
    try {
      const resp = await fetch(registryUrl, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null;
    }
  }

  async exportCatalog(filePath) {
    const fsp = require('fs').promises;
    const catalog = Array.from(this._memoryStore.values());
    await fsp.writeFile(filePath, JSON.stringify(catalog, null, 2));
    return { exported: catalog.length, path: filePath };
  }

  async importCatalog(filePath) {
    const fsp = require('fs').promises;
    const catalog = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    for (const plugin of catalog) {
      this._memoryStore.set(plugin.id, plugin);
    }
    return { imported: catalog.length };
  }
}

module.exports = PluginMarketplace;
