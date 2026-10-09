/**
 * CredentialVault — Encrypted Credential Isolation
 * Equivalent to Claude Code credential isolation / Copilot credential management
 * 
 * License: BSD-2-Clause (node-forge) — Zero cost
 */

const forge = require('node-forge');
const path = require('path');
const fs = require('fs');

class CredentialVault {
  constructor(options = {}) {
    this.dataPath = options.dataPath || path.join(process.cwd(), 'data', 'vault.enc');
    this.keyPath = options.keyPath || path.join(process.cwd(), 'data', '.vault_key');
    this.credentials = new Map();
    this.initialized = false;
    this.masterKey = null;
    this.stats = { stored: 0, retrieved: 0, deleted: 0 };
  }

  initialize() {
    this._ensureKey();
    this._load();
    this.initialized = true;
    return { status: 'ok', module: 'CredentialVault' };
  }

  _ensureKey() {
    try {
      const dir = path.dirname(this.keyPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(this.keyPath)) {
        this.masterKey = fs.readFileSync(this.keyPath, 'utf8').trim();
      } else {
        this.masterKey = forge.random.getBytesSync(32);
        fs.writeFileSync(this.keyPath, this.masterKey, 'utf8');
        try { fs.chmodSync(this.keyPath, 0o600); } catch (e) {}
      }
    } catch (e) {
      // Never fall back to a hardcoded key — fail loudly so the operator fixes it.
      throw new Error('[CredentialVault] Cannot initialize master key: ' + e.message);
    }
  }

  _encrypt(text) {
    // No fallback to Base64 — encryption must succeed or the vault refuses.
    const cipher = forge.cipher.createCipher('AES-GCM', this.masterKey);
    cipher.start({ iv: forge.random.getBytesSync(12) });
    cipher.update(forge.util.createBuffer(forge.util.encodeUtf8(text)));
    cipher.finish();
    return forge.util.encode64(cipher.mode.tag.getBytes() + cipher.mode.iv + cipher.output.getBytes());
  }

  _decrypt(encoded) {
    // No fallback to Base64 — decryption must succeed or the vault refuses.
    const bytes = forge.util.decode64(encoded);
    const tag = bytes.slice(0, 16);
    const iv = bytes.slice(16, 28);
    const encrypted = bytes.slice(28);
    const decipher = forge.cipher.createDecipher('AES-GCM', this.masterKey);
    decipher.start({ iv, tag: forge.util.createBuffer(tag) });
    decipher.update(forge.util.createBuffer(encrypted));
    if (!decipher.finish()) throw new Error('[CredentialVault] Decryption failed — wrong key or corrupted data');
    return forge.util.decodeUtf8(decipher.output.getBytes());
  }

  /**
   * Store a credential
   */
  store(key, value, { service = 'general', userId = 'system', expiresAt } = {}) {
    const record = {
      service, userId, value: this._encrypt(value),
      expiresAt: expiresAt || null,
      createdAt: new Date().toISOString()
    };
    this.credentials.set(key, record);
    this.stats.stored++;
    this._save();
    return { success: true, key, service };
  }

  /**
   * Retrieve a credential
   */
  retrieve(key, { userId = 'system' } = {}) {
    const record = this.credentials.get(key);
    if (!record) return null;
    if (record.expiresAt && new Date(record.expiresAt) < new Date()) return null;
    if (record.userId !== 'system' && record.userId !== userId) return null;
    this.stats.retrieved++;
    return { key, value: this._decrypt(record.value), service: record.service };
  }

  /**
   * Delete a credential
   */
  delete(key) {
    const deleted = this.credentials.delete(key);
    if (deleted) this.stats.deleted++;
    this._save();
    return deleted;
  }

  /**
   * List stored credentials (without values)
   */
  list({ service, userId } = {}) {
    let entries = Array.from(this.credentials.entries());
    if (service) entries = entries.filter(([, r]) => r.service === service);
    if (userId) entries = entries.filter(([, r]) => r.userId === userId || r.userId === 'system');
    return entries.map(([key, r]) => ({ key, service: r.service, userId: r.userId, createdAt: r.createdAt, expiresAt: r.expiresAt }));
  }

  getStats() {
    return { ...this.stats, totalCredentials: this.credentials.size };
  }

  _load() {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
        for (const [k, v] of Object.entries(data)) this.credentials.set(k, v);
      }
    } catch (e) { /* ignore */ }
  }

  _save() {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = Object.fromEntries(this.credentials);
      fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
      try { fs.chmodSync(this.dataPath, 0o600); } catch (e) {}
    } catch (e) { /* ignore */ }
  }
}

module.exports = CredentialVault;
