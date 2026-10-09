/**
 * UserSoundUploads — sonidos personalizados subidos por el usuario (FASE 22).
 *
 * - Almacenamiento local: <cwd>/uploads/sounds/<userId>/<uuid>.<ext>.
 * - Validación: MIME en lista blanca (mp3/wav/ogg/m4a/webm), tamaño máx 5 MB,
 *   duración máx 15 s (validada en cliente; aquí se valida MIME + tamaño).
 * - Nombres con UUID (no adivinables); el id interno es `custom:<uuid>`.
 * - Cada archivo se sirve SOLO a su propietario vía /api/sounds/file/:id con
 *   JWT (query token) o con la cabecera Authorization del fetch.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'sounds');

const ALLOWED_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/webm',
]);

const EXT_BY_MIME = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/webm': 'webm',
};

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

function userDir(userId) {
  return path.join(UPLOAD_ROOT, String(userId));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function metaFor(userId, id, filePath, originalName, mime, size) {
  const stat = fs.statSync(filePath);
  return {
    id: `custom:${id}`,
    name:
      (originalName || 'sonido personalizado').replace(/\.[^.]+$/, '') || 'sonido personalizado',
    category: 'Mis sonidos',
    duration: 0,
    tags: ['custom', 'user', 'upload'],
    license: 'Subido por el usuario (el usuario es responsable de su licencia de uso)',
    licenseUrl: '',
    attributionRequired: false,
    commercialUseAllowed: null,
    provider: 'custom',
    size,
    createdAt: stat.mtimeMs,
  };
}

function saveUpload({ userId, buffer, originalName, mime }) {
  if (!ALLOWED_MIME.has(mime)) {
    const err = new Error(`Formato no permitido: ${mime || 'desconocido'}`);
    err.code = 'INVALID_MIME';
    throw err;
  }
  if (buffer.length > MAX_SIZE) {
    const err = new Error('El archivo supera 5 MB');
    err.code = 'TOO_LARGE';
    throw err;
  }
  const id = crypto.randomUUID();
  const ext = EXT_BY_MIME[mime] || 'bin';
  const dir = userDir(userId);
  ensureDir(dir);
  const filePath = path.join(dir, `${id}.${ext}`);
  fs.writeFileSync(filePath, buffer);
  return metaFor(userId, id, filePath, originalName, mime, buffer.length);
}

function listUploads(userId) {
  const dir = userDir(userId);
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((f) => /^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}\.\w+$/.test(f))
    .map((f) => {
      const filePath = path.join(dir, f);
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch {
        return null;
      }
      const id = f.replace(/\.[^.]+$/, '');
      return {
        id: `custom:${id}`,
        name: `sonido ${id.slice(0, 8)}`,
        category: 'Mis sonidos',
        duration: 0,
        tags: ['custom', 'user', 'upload'],
        license: 'Subido por el usuario (el usuario es responsable de su licencia de uso)',
        licenseUrl: '',
        attributionRequired: false,
        commercialUseAllowed: null,
        provider: 'custom',
        size: stat.size,
        createdAt: stat.mtimeMs,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function getUpload(userId, rawId) {
  const id = String(rawId || '').replace(/^custom:/, '');
  if (!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(id)) {
    return null;
  }
  const dir = userDir(userId);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const match = files.find((f) => f.startsWith(`${id}.`));
  if (!match) {
    return null;
  }
  const filePath = path.join(dir, match);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const meta = metaFor(userId, id, filePath, match, 'audio/mpeg', fs.statSync(filePath).size);
  meta.name = `sonido ${id.slice(0, 8)}`;
  return { ...meta, filePath };
}

function deleteUpload(userId, rawId) {
  const found = getUpload(userId, rawId);
  if (!found) {
    return false;
  }
  fs.unlinkSync(found.filePath);
  return true;
}

module.exports = {
  saveUpload,
  listUploads,
  getUpload,
  deleteUpload,
  UPLOAD_ROOT,
  ALLOWED_MIME,
  MAX_SIZE,
};
