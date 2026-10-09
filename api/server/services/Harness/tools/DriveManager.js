/**
 * DriveManager.js
 * 
 * Sistema de archivos en la nube completo usando WebDAV (protocolo abierto RFC 4918)
 * Reemplaza googleapis Drive con acceso directo sin API keys, sin límites, sin bloqueos.
 * 
 * Soporta: Nextcloud, ownCloud, Seafile, Synology, TrueNAS, WebDAV servers
 * Protocolo: WebDAV (RFC 4918)
 * Paquete: webdav (MIT)
 * Licencia: MIT
 * RAM: ~5MB
 */

const { createClient } = require('webdav');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class DriveManager extends EventEmitter {
    constructor() {
        super();
        this._initialized = false;
        this._accounts = new Map();
        this._clients = new Map();
    }

    async initialize(config = {}) {
        if (this._initialized) return;
        this._config = {
            storageDir: config.storageDir || path.join(process.cwd(), 'data', 'drive'),
            cacheDir: config.cacheDir || path.join(process.cwd(), 'data', 'drive-cache'),
            maxFileSize: config.maxFileSize || 100 * 1024 * 1024, // 100MB
            ...config
        };

        for (const dir of [this._config.storageDir, this._config.cacheDir]) {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        }

        this._initialized = true;
        this.emit('initialized');
        return { success: true, module: 'DriveManager' };
    }

    /**
     * Add a WebDAV account
     */
    async addAccount(name, config) {
        const account = {
            name,
            server: config.server,     // e.g. 'https://cloud.example.com/remote.php/dav'
            username: config.username,
            password: config.password,
            basePath: config.basePath || '/'
        };

        // Create WebDAV client
        const client = createClient(
            config.server,
            {
                username: config.username,
                password: config.password
            }
        );

        this._accounts.set(name, account);
        this._clients.set(name, client);
        this.emit('accountAdded', { name });
        return { success: true, account: name };
    }

    /**
     * Test connection
     */
    async testConnection(accountName) {
        const client = this._getClient(accountName);
        try {
            const exists = await client.exists('/');
            return { success: true, connected: exists };
        } catch (error) {
            throw new Error(`Connection test failed: ${error.message}`);
        }
    }

    /**
     * List files in a directory
     */
    async listFiles(accountName, remotePath = '/', options = {}) {
        const client = this._getClient(accountName);
        const { limit = 100, sortBy = 'name', sortAsc = true } = options;

        try {
            const contents = await client.getDirectoryContents(remotePath, {
                deep: false,
                details: true
            });

            let items = contents.map(item => ({
                name: item.basename,
                path: item.filename,
                type: item.type, // 'file' or 'directory'
                size: item.size || 0,
                lastModified: item.lastmod,
                created: item.created,
                mime: item.mime,
                etag: item.etag
            }));

            // Sort
            items.sort((a, b) => {
                let cmp = 0;
                if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
                else if (sortBy === 'size') cmp = a.size - b.size;
                else if (sortBy === 'date') cmp = new Date(a.lastModified) - new Date(b.lastModified);
                return sortAsc ? cmp : -cmp;
            });

            // Limit
            items = items.slice(0, limit);

            return { success: true, path: remotePath, items, total: items.length };
        } catch (error) {
            throw new Error(`List failed: ${error.message}`);
        }
    }

    /**
     * Read a file (download to memory)
     */
    async readFile(accountName, remotePath) {
        const client = this._getClient(accountName);

        try {
            const data = await client.getFileContents(remotePath);
            return {
                success: true,
                path: remotePath,
                data: data,
                size: Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data)
            };
        } catch (error) {
            throw new Error(`Read failed: ${error.message}`);
        }
    }

    /**
     * Read file as text
     */
    async readTextFile(accountName, remotePath) {
        const result = await this.readFile(accountName, remotePath);
        if (!result.success) return result;
        
        const text = Buffer.isBuffer(result.data) 
            ? result.data.toString('utf8') 
            : String(result.data);
        
        return { success: true, path: remotePath, text, size: result.size };
    }

    /**
     * Write/create a file
     */
    async writeFile(accountName, remotePath, content, options = {}) {
        const client = this._getClient(accountName);
        const { overwrite = true, contentType } = options;

        try {
            // Ensure parent directory exists
            const parentDir = path.posix.dirname(remotePath);
            if (parentDir && parentDir !== '/') {
                try {
                    await client.createDirectory(parentDir, { recursive: true });
                } catch (e) { /* directory may already exist */ }
            }

            await client.putFileContents(remotePath, content, {
                overwrite,
                contentLength: Buffer.isBuffer(content) ? content.length : undefined
            });

            this.emit('fileWritten', { account: accountName, path: remotePath });
            return { success: true, path: remotePath, size: Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content) };
        } catch (error) {
            throw new Error(`Write failed: ${error.message}`);
        }
    }

    /**
     * Upload local file to WebDAV
     */
    async uploadFile(accountName, localPath, remotePath, options = {}) {
        if (!fs.existsSync(localPath)) throw new Error(`Local file not found: ${localPath}`);
        
        const content = fs.readFileSync(localPath);
        return this.writeFile(accountName, remotePath || path.basename(localPath), content, options);
    }

    /**
     * Download remote file to local
     */
    async downloadFile(accountName, remotePath, localPath) {
        const client = this._getClient(accountName);

        try {
            const data = await client.getFileContents(remotePath);
            const output = localPath || path.join(this._config.storageDir, path.basename(remotePath));
            
            // Ensure parent dir exists
            const parentDir = path.dirname(output);
            if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
            
            fs.writeFileSync(output, Buffer.isBuffer(data) ? data : Buffer.from(data));

            this.emit('fileDownloaded', { account: accountName, path: remotePath, local: output });
            return { success: true, remote: remotePath, local: output, size: fs.statSync(output).size };
        } catch (error) {
            throw new Error(`Download failed: ${error.message}`);
        }
    }

    /**
     * Create directory
     */
    async createDirectory(accountName, remotePath) {
        const client = this._getClient(accountName);
        try {
            await client.createDirectory(remotePath, { recursive: true });
            return { success: true, path: remotePath };
        } catch (error) {
            throw new Error(`Create directory failed: ${error.message}`);
        }
    }

    /**
     * Delete file or directory
     */
    async deleteItem(accountName, remotePath) {
        const client = this._getClient(accountName);
        try {
            await client.deleteFile(remotePath);
            this.emit('itemDeleted', { account: accountName, path: remotePath });
            return { success: true, path: remotePath };
        } catch (error) {
            throw new Error(`Delete failed: ${error.message}`);
        }
    }

    /**
     * Move/rename item
     */
    async moveItem(accountName, fromPath, toPath) {
        const client = this._getClient(accountName);
        try {
            await client.moveFile(fromPath, toPath);
            this.emit('itemMoved', { account: accountName, from: fromPath, to: toPath });
            return { success: true, from: fromPath, to: toPath };
        } catch (error) {
            throw new Error(`Move failed: ${error.message}`);
        }
    }

    /**
     * Copy item
     */
    async copyItem(accountName, fromPath, toPath) {
        const client = this._getClient(accountName);
        try {
            await client.copyFile(fromPath, toPath);
            return { success: true, from: fromPath, to: toPath };
        } catch (error) {
            throw new Error(`Copy failed: ${error.message}`);
        }
    }

    /**
     * Check if file/directory exists
     */
    async exists(accountName, remotePath) {
        const client = this._getClient(accountName);
        try {
            const exists = await client.exists(remotePath);
            return { success: true, path: remotePath, exists };
        } catch (error) {
            return { success: true, path: remotePath, exists: false };
        }
    }

    /**
     * Get file info/statistics
     */
    async getStat(accountName, remotePath) {
        const client = this._getClient(accountName);
        try {
            const stat = await client.stat(remotePath);
            return {
                success: true,
                stat: {
                    name: stat.basename,
                    path: stat.filename,
                    type: stat.type,
                    size: stat.size,
                    lastModified: stat.lastmod,
                    created: stat.created,
                    etag: stat.etag
                }
            };
        } catch (error) {
            throw new Error(`Stat failed: ${error.message}`);
        }
    }

    /**
     * Search files by name pattern
     */
    async search(accountName, query, remotePath = '/') {
        const client = this._getClient(accountName);
        try {
            const contents = await client.getDirectoryContents(remotePath, { deep: true, details: true });
            const matches = contents.filter(item =>
                item.basename.toLowerCase().includes(query.toLowerCase())
            ).map(item => ({
                name: item.basename,
                path: item.filename,
                type: item.type,
                size: item.size
            }));

            return { success: true, query, matches, total: matches.length };
        } catch (error) {
            throw new Error(`Search failed: ${error.message}`);
        }
    }

    /**
     * Sync a local directory with remote
     */
    async syncDirectory(accountName, localDir, remoteDir, options = {}) {
        const { deleteOrphans = false } = options;

        if (!fs.existsSync(localDir)) throw new Error(`Local dir not found: ${localDir}`);

        const results = [];

        // Upload all local files
        const walkDir = (dir, relPath = '') => {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const remotePath = `${remoteDir}/${relPath}/${item}`.replace(/\/+/g, '/');
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    walkDir(fullPath, `${relPath}/${item}`);
                } else {
                    results.push({ local: fullPath, remote: remotePath, action: 'upload' });
                }
            }
        };

        walkDir(localDir);

        // Execute uploads
        for (const r of results) {
            try {
                await this.uploadFile(accountName, r.local, r.remote);
                r.success = true;
            } catch (error) {
                r.success = false;
                r.error = error.message;
            }
        }

        return { success: true, results, uploaded: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length };
    }

    /**
     * Get storage usage
     */
    async getStorageUsage(accountName) {
        const client = this._getClient(accountName);
        try {
            const contents = await client.getDirectoryContents('/', { deep: true });
            let totalSize = 0;
            let fileCount = 0;
            let dirCount = 0;

            for (const item of contents) {
                if (item.type === 'file') {
                    totalSize += item.size || 0;
                    fileCount++;
                } else {
                    dirCount++;
                }
            }

            return {
                success: true,
                usage: {
                    totalSize,
                    totalSizeFormatted: this._formatSize(totalSize),
                    files: fileCount,
                    directories: dirCount
                }
            };
        } catch (error) {
            return { success: true, usage: { error: error.message } };
        }
    }

    // ── Internal ──────────────────────────────────────────────

    _getClient(accountName) {
        const client = this._clients.get(accountName);
        if (!client) throw new Error(`Not connected to: ${accountName}. Call addAccount() first.`);
        return client;
    }

    _formatSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0;
        while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
        return `${bytes.toFixed(1)} ${units[i]}`;
    }

    /**
     * Health check
     */
    async healthCheck() {
        const status = {};
        for (const [name] of this._accounts) {
            try {
                await this.testConnection(name);
                status[name] = 'connected';
            } catch {
                status[name] = 'disconnected';
            }
        }
        return { module: 'DriveManager', initialized: this._initialized, accounts: status };
    }

    async disconnectAll() {
        this._clients.clear();
        this._accounts.clear();
        this.emit('disconnected');
    }
}

module.exports = { DriveManager };
module.exports.default = DriveManager;
