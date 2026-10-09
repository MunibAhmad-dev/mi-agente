/**
 * SecretsEncryption — Phase I: secrets encryption at rest + rotation
 *
 * Uses CREDS_KEY (32-byte hex) and CREDS_IV (16-byte hex) from .env —
 * the same vars LibreChat uses for credential encryption.
 * AES-256-CBC with a random IV per record; HMAC-SHA256 for integrity.
 */

'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const HMAC_ALGO = 'sha256';

function getKey() {
  const hex = process.env.CREDS_KEY || '';
  if (hex.length < 64) {
    throw new Error('CREDS_KEY must be a 32-byte (64-char) hex string');
  }
  return Buffer.from(hex.slice(0, 64), 'hex');
}

function getHmacKey() {
  // Derive a separate HMAC key from CREDS_KEY by hashing it
  return crypto.createHash('sha256').update(getKey()).digest();
}

/**
 * Encrypt a secret string, returning a compact JSON envelope.
 * Format: base64(iv):base64(ciphertext):base64(hmac)
 */
function encryptSecret(plaintext) {
  if (typeof plaintext !== 'string') {
    plaintext = JSON.stringify(plaintext);
  }
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  const hmac = crypto
    .createHmac(HMAC_ALGO, getHmacKey())
    .update(Buffer.concat([iv, encrypted]))
    .digest();

  return [iv.toString('base64'), encrypted.toString('base64'), hmac.toString('base64')].join(':');
}

/**
 * Decrypt an envelope produced by encryptSecret.
 */
function decryptSecret(envelope) {
  const parts = envelope.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted envelope format');

  const iv = Buffer.from(parts[0], 'base64');
  const ciphertext = Buffer.from(parts[1], 'base64');
  const storedHmac = Buffer.from(parts[2], 'base64');

  const expectedHmac = crypto
    .createHmac(HMAC_ALGO, getHmacKey())
    .update(Buffer.concat([iv, ciphertext]))
    .digest();

  if (!crypto.timingSafeEqual(storedHmac, expectedHmac)) {
    throw new Error('HMAC verification failed — envelope may be tampered');
  }

  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * In-memory registry for encrypted secrets (provider → envelope).
 * Secrets are never stored as plaintext after initial load.
 */
class SecretsVault {
  constructor() {
    this._store = new Map();
  }

  /** Store a secret encrypted. Returns the masked value for logging. */
  set(name, plaintext) {
    const envelope = encryptSecret(plaintext);
    this._store.set(name, { envelope, rotatedAt: new Date() });
    return plaintext.length > 8
      ? plaintext.slice(0, 4) + '***' + plaintext.slice(-4)
      : '***';
  }

  /** Retrieve and decrypt a secret. */
  get(name) {
    const entry = this._store.get(name);
    if (!entry) return null;
    return decryptSecret(entry.envelope);
  }

  /** Rotate a secret — replace old value, record rotation timestamp. */
  rotate(name, newPlaintext) {
    this.set(name, newPlaintext);
  }

  has(name) {
    return this._store.has(name);
  }

  /** Audit metadata without revealing plaintext. */
  audit() {
    const out = {};
    for (const [name, entry] of this._store) {
      out[name] = { rotatedAt: entry.rotatedAt };
    }
    return out;
  }
}

module.exports = { encryptSecret, decryptSecret, SecretsVault };
