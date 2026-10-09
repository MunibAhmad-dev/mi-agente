/**
 * FilesystemTools.js — Native Filesystem Tools (Read/Write/Edit)
 * 
 * Implements the core filesystem operations that every coding agent needs:
 * - read_file: Read file contents with line numbers, offset, limit
 * - write_file: Write complete file content
 * - edit_file: Edit by string replacement (like Claude Code)
 * - list_directory: List directory contents
 * - create_directory: Create directory recursively
 * - delete_file: Delete file
 * - move_file: Move/rename file
 * - copy_file: Copy file
 * 
 * Security: All operations are restricted to the working directory.
 */

const fs = require('fs');
const path = require('path');

const logger = {
    debug: (...args) => console.log('[FilesystemTools]', ...args),
    info: (...args) => console.info('[FilesystemTools]', ...args),
    warn: (...args) => console.warn('[FilesystemTools]', ...args),
    error: (...args) => console.error('[FilesystemTools]', ...args),
};

class FilesystemTools {
    constructor(config = {}) {
        this._name = 'FilesystemTools';
        this._workingDir = config.workingDir || process.cwd();
        this._maxFileSize = config.maxFileSize || 1024 * 1024; // 1MB default
        this._allowedExtensions = config.allowedExtensions || null; // null = all
        this._blockedPaths = config.blockedPaths || ['node_modules', '.git', '.env'];
    }

    /**
     * Get tool definitions for the LLM.
     */
    getToolDefinitions() {
        return [
            {
                type: 'function',
                function: {
                    name: 'read_file',
                    description: 'Read the contents of a file. Returns file content with line numbers.',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'File path relative to working directory' },
                            offset: { type: 'number', description: 'Line number to start reading from (1-indexed)' },
                            limit: { type: 'number', description: 'Maximum number of lines to read (default 2000)' },
                        },
                        required: ['path'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'write_file',
                    description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does.',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'File path relative to working directory' },
                            content: { type: 'string', description: 'Complete content to write to the file' },
                            instructions: { type: 'string', description: 'One-sentence description of what this change does' },
                        },
                        required: ['path', 'content', 'instructions'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'edit_file',
                    description: 'Edit a file by replacing an exact string with a new string. The oldString must match exactly.',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'File path relative to working directory' },
                            oldString: { type: 'string', description: 'The exact string to replace (must match exactly)' },
                            newString: { type: 'string', description: 'The new string to replace with' },
                        },
                        required: ['path', 'oldString', 'newString'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'list_directory',
                    description: 'List all files and directories in a path.',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'Directory path relative to working directory' },
                            recursive: { type: 'boolean', description: 'Whether to list recursively (default false)' },
                        },
                        required: ['path'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'create_directory',
                    description: 'Create a directory and all parent directories.',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'Directory path relative to working directory' },
                        },
                        required: ['path'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'delete_file',
                    description: 'Delete a file.',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'File path relative to working directory' },
                        },
                        required: ['path'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'move_file',
                    description: 'Move or rename a file.',
                    parameters: {
                        type: 'object',
                        properties: {
                            from: { type: 'string', description: 'Source path relative to working directory' },
                            to: { type: 'string', description: 'Destination path relative to working directory' },
                        },
                        required: ['from', 'to'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'copy_file',
                    description: 'Copy a file.',
                    parameters: {
                        type: 'object',
                        properties: {
                            from: { type: 'string', description: 'Source path relative to working directory' },
                            to: { type: 'string', description: 'Destination path relative to working directory' },
                        },
                        required: ['from', 'to'],
                    },
                },
            },
        ];
    }

    /**
     * Execute a tool by name.
     */
    async execute(toolName, params, context = {}) {
        const workingDir = context.workingDir || this._workingDir;

        switch (toolName) {
            case 'read_file': return this.readFile(params, workingDir);
            case 'write_file': return this.writeFile(params, workingDir);
            case 'edit_file': return this.editFile(params, workingDir);
            case 'list_directory': return this.listDirectory(params, workingDir);
            case 'create_directory': return this.createDirectory(params, workingDir);
            case 'delete_file': return this.deleteFile(params, workingDir);
            case 'move_file': return this.moveFile(params, workingDir);
            case 'copy_file': return this.copyFile(params, workingDir);
            default: throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    /**
     * Read a file with line numbers, offset, and limit.
     */
    async readFile(params, workingDir) {
        const { path: filePath, offset = 1, limit = 2000 } = params;
        const fullPath = this._resolvePath(filePath, workingDir);

        this._validatePath(fullPath);

        if (!fs.existsSync(fullPath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const stat = fs.statSync(fullPath);
        if (stat.size > this._maxFileSize) {
            throw new Error(`File too large: ${filePath} (${stat.size} bytes, max ${this._maxFileSize})`);
        }

        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        const totalLines = lines.length;

        const startLine = Math.max(1, offset);
        const endLine = Math.min(totalLines, startLine + limit - 1);
        const selectedLines = lines.slice(startLine - 1, endLine);

        // Add line numbers
        const numberedLines = selectedLines.map((line, i) => 
            `${String(startLine + i).padStart(6, ' ')} │ ${line}`
        ).join('\n');

        const result = [
            `[File: ${filePath}] (lines ${startLine}-${endLine} of ${totalLines})`,
            '',
            numberedLines,
            '',
            totalLines > endLine ? `[... ${totalLines - endLine} more lines]` : `[End of file]`,
        ].join('\n');

        logger.info(`[read_file] ${filePath}: ${startLine}-${endLine} of ${totalLines} lines`);
        return result;
    }

    /**
     * Write complete file content.
     */
    async writeFile(params, workingDir) {
        const { path: filePath, content, instructions } = params;
        const fullPath = this._resolvePath(filePath, workingDir);

        this._validatePath(fullPath);

        // Ensure parent directory exists
        const parentDir = path.dirname(fullPath);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }

        const existed = fs.existsSync(fullPath);
        fs.writeFileSync(fullPath, content, 'utf8');

        const lines = content.split('\n').length;
        logger.info(`[write_file] ${filePath}: ${lines} lines ${existed ? '(overwritten)' : '(created)'}`);

        return `File ${existed ? 'updated' : 'created'}: ${filePath} (${lines} lines)`;
    }

    /**
     * Edit a file by exact string replacement.
     */
    async editFile(params, workingDir) {
        const { path: filePath, oldString, newString, createBackup = true } = params;
        const fullPath = this._resolvePath(filePath, workingDir);

        this._validatePath(fullPath);

        if (!fs.existsSync(fullPath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const content = fs.readFileSync(fullPath, 'utf8');

        // Create backup before editing (improvement #4)
        if (createBackup) {
            const backupDir = path.join(path.dirname(fullPath), '.backups');
            if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
            const backupFile = path.join(backupDir, `${path.basename(fullPath)}.${Date.now()}.bak`);
            fs.writeFileSync(backupFile, content);
        }

        // Check if oldString exists
        if (!content.includes(oldString)) {
            // Provide helpful error message
            const lines = content.split('\n');
            const oldLines = oldString.split('\n');
            const firstLine = oldLines[0].trim();

            // Try to find similar content
            let suggestions = [];
            if (firstLine.length > 10) {
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes(firstLine.substring(0, 20))) {
                        suggestions.push(`Line ${i + 1}: ${lines[i].trim().substring(0, 80)}`);
                    }
                }
            }

            let errorMsg = `oldString not found in ${filePath}`;
            if (suggestions.length > 0) {
                errorMsg += `\n\nDid you mean one of these?\n${suggestions.slice(0, 5).join('\n')}`;
            }
            throw new Error(errorMsg);
        }

        // Check for multiple occurrences
        const occurrences = content.split(oldString).length - 1;
        if (occurrences > 1) {
            throw new Error(`oldString found ${occurrences} times in ${filePath}. Please provide a more specific string to ensure uniqueness.`);
        }

        // Generate diff preview (improvement #5)
        let diffPreview = '';
        try {
            const diff = require('diff');
            const changes = diff.diffLines(content, content.replace(oldString, newString));
            diffPreview = changes.map(change => {
                const prefix = change.added ? '+' : change.removed ? '-' : ' ';
                return change.value.split('\n').filter(l => l).map(l => `${prefix} ${l}`).join('\n');
            }).filter(d => d).join('\n');
        } catch (e) { /* diff not available */ }

        // Perform replacement
        const newContent = content.replace(oldString, newString);
        fs.writeFileSync(fullPath, newContent, 'utf8');

        const oldLines = oldString.split('\n').length;
        const newLines = newString.split('\n').length;
        logger.info(`[edit_file] ${filePath}: replaced ${oldLines} lines with ${newLines} lines`);

        let result = `File edited: ${filePath} (replaced ${oldLines} lines with ${newLines} lines)`;
        if (diffPreview) {
            result += `\n\nDiff preview:\n${diffPreview}`;
        }
        return result;
    }

    /**
     * List directory contents.
     */
    async listDirectory(params, workingDir) {
        const { path: dirPath = '.', recursive = false } = params;
        const fullPath = this._resolvePath(dirPath, workingDir);

        this._validatePath(fullPath);

        if (!fs.existsSync(fullPath)) {
            throw new Error(`Directory not found: ${dirPath}`);
        }

        const stat = fs.statSync(fullPath);
        if (!stat.isDirectory()) {
            throw new Error(`Not a directory: ${dirPath}`);
        }

        const items = [];

        if (recursive) {
            this._walkDirectory(fullPath, '', items, 0);
        } else {
            const entries = fs.readdirSync(fullPath, { withFileTypes: true });
            for (const entry of entries) {
                const itemPath = path.join(fullPath, entry.name);
                const itemStat = fs.statSync(itemPath);
                items.push({
                    name: entry.name,
                    type: entry.isDirectory() ? 'directory' : 'file',
                    size: entry.isFile() ? itemStat.size : null,
                    modified: itemStat.mtime.toISOString(),
                });
            }
        }

        // Format output
        let output = `Directory: ${dirPath}\n\n`;
        for (const item of items) {
            const icon = item.type === 'directory' ? '📁' : '📄';
            const size = item.size !== null ? ` (${this._formatSize(item.size)})` : '';
            output += `${icon} ${item.name}${size}\n`;
        }

        logger.info(`[list_directory] ${dirPath}: ${items.length} items`);
        return output;
    }

    /**
     * Create a directory.
     */
    async createDirectory(params, workingDir) {
        const { path: dirPath } = params;
        const fullPath = this._resolvePath(dirPath, workingDir);

        this._validatePath(fullPath);

        if (fs.existsSync(fullPath)) {
            return `Directory already exists: ${dirPath}`;
        }

        fs.mkdirSync(fullPath, { recursive: true });
        logger.info(`[create_directory] ${dirPath}`);
        return `Directory created: ${dirPath}`;
    }

    /**
     * Delete a file.
     */
    async deleteFile(params, workingDir) {
        const { path: filePath } = params;
        const fullPath = this._resolvePath(filePath, workingDir);

        this._validatePath(fullPath);

        if (!fs.existsSync(fullPath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true });
            logger.info(`[delete_file] ${filePath} (directory)`);
            return `Directory deleted: ${filePath}`;
        }

        fs.unlinkSync(fullPath);
        logger.info(`[delete_file] ${filePath}`);
        return `File deleted: ${filePath}`;
    }

    /**
     * Move/rename a file.
     */
    async moveFile(params, workingDir) {
        const { from, to } = params;
        const fromPath = this._resolvePath(from, workingDir);
        const toPath = this._resolvePath(to, workingDir);

        this._validatePath(fromPath);
        this._validatePath(toPath);

        if (!fs.existsSync(fromPath)) {
            throw new Error(`Source file not found: ${from}`);
        }

        // Ensure destination directory exists
        const toDir = path.dirname(toPath);
        if (!fs.existsSync(toDir)) {
            fs.mkdirSync(toDir, { recursive: true });
        }

        fs.renameSync(fromPath, toPath);
        logger.info(`[move_file] ${from} → ${to}`);
        return `File moved: ${from} → ${to}`;
    }

    /**
     * Copy a file.
     */
    async copyFile(params, workingDir) {
        const { from, to } = params;
        const fromPath = this._resolvePath(from, workingDir);
        const toPath = this._resolvePath(to, workingDir);

        this._validatePath(fromPath);
        this._validatePath(toPath);

        if (!fs.existsSync(fromPath)) {
            throw new Error(`Source file not found: ${from}`);
        }

        // Ensure destination directory exists
        const toDir = path.dirname(toPath);
        if (!fs.existsSync(toDir)) {
            fs.mkdirSync(toDir, { recursive: true });
        }

        fs.copyFileSync(fromPath, toPath);
        logger.info(`[copy_file] ${from} → ${to}`);
        return `File copied: ${from} → ${to}`;
    }

    // ── Internal Helpers ──────────────────────────────────────

    _resolvePath(filePath, workingDir) {
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        return path.resolve(workingDir, filePath);
    }

    _validatePath(fullPath) {
        const resolvedWorking = path.resolve(this._workingDir);
        const resolvedPath = path.resolve(fullPath);

        // Security: Check if path is within working directory
        if (!resolvedPath.startsWith(resolvedWorking)) {
            throw new Error(`Access denied: path is outside working directory`);
        }

        // Security: Check blocked paths
        for (const blocked of this._blockedPaths) {
            if (resolvedPath.includes(blocked)) {
                throw new Error(`Access denied: path contains blocked directory "${blocked}"`);
            }
        }
    }

    _walkDirectory(dir, relativePath, items, depth) {
        if (depth > 10) return; // Prevent infinite recursion
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const itemRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;
            const itemPath = path.join(dir, entry.name);

            // Skip blocked paths
            if (this._blockedPaths.includes(entry.name)) continue;

            const stat = fs.statSync(itemPath);
            items.push({
                name: itemRelative,
                type: entry.isDirectory() ? 'directory' : 'file',
                size: entry.isFile() ? stat.size : null,
                modified: stat.mtime.toISOString(),
            });

            if (entry.isDirectory()) {
                this._walkDirectory(itemPath, itemRelative, items, depth + 1);
            }
        }
    }

    _formatSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
        return `${bytes.toFixed(1)} ${units[i]}`;
    }
}

module.exports = { FilesystemTools };
module.exports.default = FilesystemTools;
