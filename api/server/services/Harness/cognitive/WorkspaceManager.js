/**
 * WorkspaceManager.js — Project Workspace Management
 * 
 * Each project/workspace has:
 * - Isolated filesystem
 * - Git repository
 * - Memory
 * - Configuration
 * - Artifacts
 * 
 * License: MIT
 * RAM: ~3MB
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[WorkspaceManager]', ...args),
    info: (...args) => console.info('[WorkspaceManager]', ...args),
};

class WorkspaceManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'WorkspaceManager';
        this._baseDir = config.baseDir || path.join(process.cwd(), 'workspaces');
        this._workspaces = new Map();
    }

    /**
     * Create a new workspace.
     */
    create(config) {
        const id = config.id || `ws_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const workspaceDir = path.join(this._baseDir, id);

        fs.mkdirSync(workspaceDir, { recursive: true });
        fs.mkdirSync(path.join(workspaceDir, 'src'), { recursive: true });
        fs.mkdirSync(path.join(workspaceDir, 'docs'), { recursive: true });
        fs.mkdirSync(path.join(workspaceDir, 'artifacts'), { recursive: true });

        const workspace = {
            id,
            name: config.name || id,
            description: config.description || '',
            path: workspaceDir,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            config: config.config || {},
            status: 'active',
        };

        this._workspaces.set(id, workspace);
        logger.info(`[WorkspaceManager] Created workspace: ${id}`);
        this.emit('created', { id });
        return workspace;
    }

    /**
     * Get a workspace.
     */
    get(id) {
        return this._workspaces.get(id) || null;
    }

    /**
     * List all workspaces.
     */
    list() {
        return [...this._workspaces.values()];
    }

    /**
     * Delete a workspace.
     */
    delete(id) {
        const ws = this._workspaces.get(id);
        if (!ws) return false;

        try {
            fs.rmSync(ws.path, { recursive: true, force: true });
        } catch (err) {
            logger.warn(`[WorkspaceManager] Failed to delete directory: ${err.message}`);
        }

        this._workspaces.delete(id);
        this.emit('deleted', { id });
        return true;
    }

    /**
     * Get workspace file listing.
     */
    listFiles(id, subDir = '') {
        const ws = this._workspaces.get(id);
        if (!ws) return [];

        const dir = path.join(ws.path, subDir);
        try {
            return fs.readdirSync(dir, { withFileTypes: true }).map(entry => ({
                name: entry.name,
                isDirectory: entry.isDirectory(),
                path: path.join(subDir, entry.name),
            }));
        } catch {
            return [];
        }
    }

    /**
     * Write a file to workspace.
     */
    writeFile(id, filePath, content) {
        const ws = this._workspaces.get(id);
        if (!ws) throw new Error(`Workspace not found: ${id}`);

        const fullPath = path.join(ws.path, filePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
        ws.updatedAt = Date.now();
        return { success: true, path: filePath };
    }

    /**
     * Read a file from workspace.
     */
    readFile(id, filePath) {
        const ws = this._workspaces.get(id);
        if (!ws) throw new Error(`Workspace not found: ${id}`);

        const fullPath = path.join(ws.path, filePath);
        return fs.readFileSync(fullPath, 'utf8');
    }
}

module.exports = { WorkspaceManager };
module.exports.default = WorkspaceManager;
