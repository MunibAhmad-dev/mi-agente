/**
 * File Storage Service
 * ===================
 *
 * Servicio para almacenamiento de archivos con soporte para:
 * - Local filesystem
 * - AWS S3
 * - Google Cloud Storage
 * - Azure Blob Storage
 * - Presigned URLs
 * - Streaming uploads
 *
 * Autor: Mi LibreChat
 * Version: 1.0.0
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { logger } = require('@librechat/data-schemas');

// ============================================================================
// CONFIGURATION
// ============================================================================

class StorageConfig {
  constructor() {
    this.provider = process.env.STORAGE_PROVIDER || 'local';
    this.localPath = process.env.STORAGE_LOCAL_PATH || './uploads';
    this.baseUrl = process.env.STORAGE_BASE_URL || '/uploads';

    // S3 Configuration
    this.s3 = {
      bucket: process.env.AWS_S3_BUCKET,
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      endpoint: process.env.AWS_S3_ENDPOINT, // For S3-compatible services
    };

    // GCS Configuration
    this.gcs = {
      bucket: process.env.GCS_BUCKET,
      projectId: process.env.GCS_PROJECT_ID,
      credentials: process.env.GCS_CREDENTIALS ? JSON.parse(process.env.GCS_CREDENTIALS) : null,
    };

    // Azure Configuration
    this.azure = {
      connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
      container: process.env.AZURE_STORAGE_CONTAINER,
    };

    // Limits
    this.maxFileSize = parseInt(process.env.STORAGE_MAX_FILE_SIZE || '104857600', 10); // 100MB
    this.allowedExtensions = (process.env.STORAGE_ALLOWED_EXTENSIONS || '*')
      .split(',')
      .map((e) => e.trim());
  }

  getS3Client() {
    if (!this.s3.accessKeyId || !this.s3.secretAccessKey) {
      return null;
    }

    // Dynamic import to avoid errors if AWS SDK not installed
    try {
      const { S3Client } = require('@aws-sdk/client-s3');
      return new S3Client({
        region: this.s3.region,
        credentials: {
          accessKeyId: this.s3.accessKeyId,
          secretAccessKey: this.s3.secretAccessKey,
        },
        ...(this.s3.endpoint && { endpoint: this.s3.endpoint }),
      });
    } catch (e) {
      logger.warn('[Storage] AWS SDK not available');
      return null;
    }
  }
}

const config = new StorageConfig();

// ============================================================================
// EXCEPTION
// ============================================================================

class StorageError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.details = details;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Genera un nombre de archivo único
 */
function generateFilename(originalName, options = {}) {
  const { prefix = '', suffix = '', length = 12, preserveExtension = true } = options;

  const ext = preserveExtension ? path.extname(originalName) : '';
  const randomBytes = crypto.randomBytes(length).toString('hex');

  return `${prefix}${randomBytes}${suffix}${ext}`;
}

/**
 * Obtiene el tipo MIME de un archivo
 */
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Valida extensión de archivo
 */
function validateExtension(filename) {
  if (config.allowedExtensions.includes('*')) {
    return true;
  }

  const ext = path.extname(filename).toLowerCase();
  return config.allowedExtensions.includes(ext);
}

/**
 * Calcula hash de archivo
 */
async function calculateHash(buffer, algorithm = 'sha256') {
  return crypto.createHash(algorithm).update(buffer).digest('hex');
}

// ============================================================================
// LOCAL STORAGE
// ============================================================================

async function localUpload(buffer, options = {}) {
  const { filename, folder = 'default', subfolder = null } = options;

  const finalFilename = filename || generateFilename('file');

  // Crear directorio si no existe
  const uploadDir = subfolder
    ? path.join(config.localPath, folder, subfolder)
    : path.join(config.localPath, folder);

  await fs.promises.mkdir(uploadDir, { recursive: true });

  const filepath = path.join(uploadDir, finalFilename);
  await fs.promises.writeFile(filepath, buffer);

  const stats = await fs.promises.stat(filepath);

  return {
    filename: finalFilename,
    path: filepath,
    url: `${config.baseUrl}/${folder}/${subfolder ? subfolder + '/' : ''}${finalFilename}`,
    size: stats.size,
    sizeKb: Math.round(stats.size / 1024),
    sizeMb: (stats.size / 1024 / 1024).toFixed(2),
    mimeType: getMimeType(finalFilename),
    createdAt: new Date().toISOString(),
  };
}

async function localDownload(filename, options = {}) {
  const { folder = 'default' } = options;
  const filepath = path.join(config.localPath, folder, filename);

  if (!fs.existsSync(filepath)) {
    throw new StorageError('File not found', 'NOT_FOUND', { filename });
  }

  const buffer = await fs.promises.readFile(filepath);
  const stats = await fs.promises.stat(filepath);

  return {
    filename,
    buffer,
    size: stats.size,
    mimeType: getMimeType(filename),
    lastModified: stats.mtime,
  };
}

async function localDelete(filename, options = {}) {
  const { folder = 'default' } = options;
  const filepath = path.join(config.localPath, folder, filename);

  if (!fs.existsSync(filepath)) {
    throw new StorageError('File not found', 'NOT_FOUND', { filename });
  }

  await fs.promises.unlink(filepath);

  return { deleted: true, filename };
}

async function localList(folder = 'default', options = {}) {
  const folderPath = path.join(config.localPath, folder);

  if (!fs.existsSync(folderPath)) {
    return { files: [], total: 0 };
  }

  const files = await fs.promises.readdir(folderPath);
  const fileInfos = await Promise.all(
    files.map(async (filename) => {
      const filepath = path.join(folderPath, filename);
      const stats = await fs.promises.stat(filepath);

      return {
        filename,
        size: stats.size,
        sizeKb: Math.round(stats.size / 1024),
        mimeType: getMimeType(filename),
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
      };
    }),
  );

  return {
    files: fileInfos,
    total: files.length,
  };
}

// ============================================================================
// S3 STORAGE
// ============================================================================

async function s3Upload(buffer, options = {}) {
  const s3Client = config.getS3Client();
  if (!s3Client) {
    throw new StorageError('S3 not configured', 'S3_NOT_CONFIGURED');
  }

  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

  const { filename, folder = 'default', contentType } = options;

  const finalFilename = filename || generateFilename('file');
  const key = `${folder}/${finalFilename}`;

  const command = new PutObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType || getMimeType(finalFilename),
    Metadata: options.metadata || {},
  });

  await s3Client.send(command);

  const url = `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com/${key}`;

  return {
    filename: finalFilename,
    key,
    url,
    size: buffer.length,
    sizeKb: Math.round(buffer.length / 1024),
    sizeMb: (buffer.length / 1024 / 1024).toFixed(2),
    mimeType: contentType || getMimeType(finalFilename),
    bucket: config.s3.bucket,
    region: config.s3.region,
    createdAt: new Date().toISOString(),
  };
}

async function s3Download(filename, options = {}) {
  const s3Client = config.getS3Client();
  if (!s3Client) {
    throw new StorageError('S3 not configured', 'S3_NOT_CONFIGURED');
  }

  const { GetObjectCommand } = require('@aws-sdk/client-s3');

  const { folder = 'default' } = options;
  const key = `${folder}/${filename}`;

  const command = new GetObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
  });

  const response = await s3Client.send(command);

  // Convertir stream a buffer
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  return {
    filename,
    buffer,
    size: buffer.length,
    mimeType: response.ContentType || getMimeType(filename),
    lastModified: response.LastModified,
    metadata: response.Metadata,
  };
}

async function s3Delete(filename, options = {}) {
  const s3Client = config.getS3Client();
  if (!s3Client) {
    throw new StorageError('S3 not configured', 'S3_NOT_CONFIGURED');
  }

  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');

  const { folder = 'default' } = options;
  const key = `${folder}/${filename}`;

  const command = new DeleteObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
  });

  await s3Client.send(command);

  return { deleted: true, filename, key };
}

async function s3GeneratePresignedUrl(filename, options = {}) {
  const s3Client = config.getS3Client();
  if (!s3Client) {
    throw new StorageError('S3 not configured', 'S3_NOT_CONFIGURED');
  }

  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

  const {
    folder = 'default',
    expiresIn = 3600, // 1 hour
    responseDisposition = null,
  } = options;

  const key = `${folder}/${filename}`;

  const command = new GetObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
    ...(responseDisposition && {
      ResponseContentDisposition: responseDisposition,
    }),
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });

  return {
    url,
    filename,
    expiresIn,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

async function s3GenerateUploadUrl(filename, options = {}) {
  const s3Client = config.getS3Client();
  if (!s3Client) {
    throw new StorageError('S3 not configured', 'S3_NOT_CONFIGURED');
  }

  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

  const { folder = 'default', contentType, expiresIn = 3600 } = options;

  const key = `${folder}/${filename}`;

  const command = new PutObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
    ContentType: contentType || getMimeType(filename),
    Metadata: options.metadata || {},
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });

  return {
    url,
    method: 'PUT',
    filename,
    key,
    headers: {
      'Content-Type': contentType || getMimeType(filename),
    },
    expiresIn,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

// ============================================================================
// UNIFIED API
// ============================================================================

async function upload(buffer, options = {}) {
  const { filename } = options;

  // Validar extensión
  if (!validateExtension(filename)) {
    throw new StorageError(
      `Extension not allowed: ${path.extname(filename)}`,
      'INVALID_EXTENSION',
      { allowed: config.allowedExtensions },
    );
  }

  // Validar tamaño
  if (buffer.length > config.maxFileSize) {
    throw new StorageError(
      `File too large: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`,
      'FILE_TOO_LARGE',
      { maxSize: config.maxFileSize },
    );
  }

  // Seleccionar provider
  switch (config.provider) {
    case 's3':
      return s3Upload(buffer, options);
    case 'gcs':
      return gcsUpload(buffer, options);
    case 'azure':
      return azureUpload(buffer, options);
    case 'local':
    default:
      return localUpload(buffer, options);
  }
}

async function download(filename, options = {}) {
  switch (config.provider) {
    case 's3':
      return s3Download(filename, options);
    case 'gcs':
      return gcsDownload(filename, options);
    case 'azure':
      return azureDownload(filename, options);
    case 'local':
    default:
      return localDownload(filename, options);
  }
}

async function remove(filename, options = {}) {
  switch (config.provider) {
    case 's3':
      return s3Delete(filename, options);
    case 'gcs':
      return gcsDelete(filename, options);
    case 'azure':
      return azureDelete(filename, options);
    case 'local':
    default:
      return localDelete(filename, options);
  }
}

async function list(folder = 'default', options = {}) {
  switch (config.provider) {
    case 's3':
      return s3List(folder, options);
    case 'gcs':
      return gcsList(folder, options);
    case 'azure':
      return azureList(folder, options);
    case 'local':
    default:
      return localList(folder, options);
  }
}

async function generatePresignedUrl(filename, options = {}) {
  switch (config.provider) {
    case 's3':
      return s3GeneratePresignedUrl(filename, options);
    case 'gcs':
      return gcsGeneratePresignedUrl(filename, options);
    case 'azure':
      return azureGeneratePresignedUrl(filename, options);
    default:
      throw new StorageError('Presigned URLs not supported for local storage', 'NOT_SUPPORTED');
  }
}

async function generateUploadUrl(filename, options = {}) {
  switch (config.provider) {
    case 's3':
      return s3GenerateUploadUrl(filename, options);
    case 'gcs':
      return gcsGenerateUploadUrl(filename, options);
    case 'azure':
      return azureGenerateUploadUrl(filename, options);
    default:
      throw new StorageError('Presigned uploads not supported for local storage', 'NOT_SUPPORTED');
  }
}

// ============================================================================
// STUB IMPLEMENTATIONS (GCS & Azure)
// These cloud providers require API keys and external credentials. The project
// defaults to local storage (open-source, no cloud dependency). These stubs
// return clear errors instead of crashing if accidentally invoked.
// To enable: install @google-cloud/storage or @azure/storage-blob and
// implement the upload/download/delete/list methods with real SDK calls.
// ============================================================================

async function gcsUpload(buffer, options) {
  logger.warn('[FileStorage] GCS upload attempted but not configured. Use local storage instead.');
  throw new StorageError(
    'GCS not configured. Set GOOGLE_APPLICATION_CREDENTIALS and install @google-cloud/storage.',
    'NOT_IMPLEMENTED',
  );
}

async function gcsDownload(filename, options) {
  logger.warn('[FileStorage] GCS download attempted but not configured.');
  throw new StorageError(
    'GCS not configured. Set GOOGLE_APPLICATION_CREDENTIALS and install @google-cloud/storage.',
    'NOT_IMPLEMENTED',
  );
}

async function gcsDelete(filename, options) {
  logger.warn('[FileStorage] GCS delete attempted but not configured.');
  throw new StorageError(
    'GCS not configured. Set GOOGLE_APPLICATION_CREDENTIALS and install @google-cloud/storage.',
    'NOT_IMPLEMENTED',
  );
}

async function gcsList(folder, options) {
  logger.warn('[FileStorage] GCS list attempted but not configured.');
  return [];
}

async function gcsGeneratePresignedUrl(filename, options) {
  throw new StorageError(
    'GCS not configured. Set GOOGLE_APPLICATION_CREDENTIALS and install @google-cloud/storage.',
    'NOT_IMPLEMENTED',
  );
}

async function gcsGenerateUploadUrl(filename, options) {
  throw new StorageError(
    'GCS not configured. Set GOOGLE_APPLICATION_CREDENTIALS and install @google-cloud/storage.',
    'NOT_IMPLEMENTED',
  );
}

async function azureUpload(buffer, options) {
  logger.warn(
    '[FileStorage] Azure upload attempted but not configured. Use local storage instead.',
  );
  throw new StorageError(
    'Azure not configured. Set AZURE_STORAGE_CONNECTION_STRING and install @azure/storage-blob.',
    'NOT_IMPLEMENTED',
  );
}

async function azureDownload(filename, options) {
  logger.warn('[FileStorage] Azure download attempted but not configured.');
  throw new StorageError(
    'Azure not configured. Set AZURE_STORAGE_CONNECTION_STRING and install @azure/storage-blob.',
    'NOT_IMPLEMENTED',
  );
}

async function azureDelete(filename, options) {
  logger.warn('[FileStorage] Azure delete attempted but not configured.');
  throw new StorageError(
    'Azure not configured. Set AZURE_STORAGE_CONNECTION_STRING and install @azure/storage-blob.',
    'NOT_IMPLEMENTED',
  );
}

async function azureList(folder, options) {
  logger.warn('[FileStorage] Azure list attempted but not configured.');
  return [];
}

async function azureGeneratePresignedUrl(filename, options) {
  throw new StorageError(
    'Azure not configured. Set AZURE_STORAGE_CONNECTION_STRING and install @azure/storage-blob.',
    'NOT_IMPLEMENTED',
  );
}

async function azureGenerateUploadUrl(filename, options) {
  throw new StorageError(
    'Azure not configured. Set AZURE_STORAGE_CONNECTION_STRING and install @azure/storage-blob.',
    'NOT_IMPLEMENTED',
  );
}

async function s3List(folder, options) {
  const s3Client = config.getS3Client();
  if (!s3Client) {
    throw new StorageError('S3 not configured', 'S3_NOT_CONFIGURED');
  }

  const { ListObjectsV2Command } = require('@aws-sdk/client-s3');

  const command = new ListObjectsV2Command({
    Bucket: config.s3.bucket,
    Prefix: `${folder}/`,
  });

  const response = await s3Client.send(command);
  const files = (response.Contents || []).map((obj) => ({
    filename: path.basename(obj.Key),
    key: obj.Key,
    size: obj.Size,
    sizeKb: Math.round(obj.Size / 1024),
    lastModified: obj.LastModified,
    eTag: obj.ETag,
  }));

  return { files, total: files.length };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Configuration
  config,
  StorageConfig,

  // Unified API
  upload,
  download,
  remove,
  list,
  generatePresignedUrl,
  generateUploadUrl,

  // Local
  localUpload,
  localDownload,
  localDelete,
  localList,

  // S3
  s3Upload,
  s3Download,
  s3Delete,
  s3GeneratePresignedUrl,
  s3GenerateUploadUrl,
  s3List,

  // Helpers
  generateFilename,
  getMimeType,
  validateExtension,
  calculateHash,

  // Exception
  StorageError,
};
