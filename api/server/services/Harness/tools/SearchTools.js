/**
 * SearchTools.js — Grep/Glob/Search Tools
 * 
 * Implements search operations like Claude Code:
 * - grep: Search content across files with regex
 * - glob: Find files by name pattern
 * - search_code: Search with context
 * - find_files: Find by extension
 */

const fs = require('fs');
const path = require('path');

const logger = {
    debug: (...args) => console.log('[SearchTools]', ...args),
    info: (...args) => console.info('[SearchTools]', ...args),
    warn: (...args) => console.warn('[SearchTools]', ...args),
    error: (...args) => console.error('[SearchTools]', ...args),
};

class SearchTools {
    constructor(config = {}) {
        this._name = 'SearchTools';
        this._workingDir = config.workingDir || process.cwd();
        this._maxResults = config.maxResults || 100;
        this._maxFileSize = config.maxFileSize || 1024 * 1024; // 1MB
        this._ignoredDirs = config.ignoredDirs || [
            'node_modules', '.git', 'dist', 'build', '.next', 
            'coverage', '__pycache__', '.cache', '.venv', 'venv'
        ];
        this._ignoredExtensions = config.ignoredExtensions || [
            '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg',
            '.woff', '.woff2', '.ttf', '.eot',
            '.zip', '.tar', '.gz', '.rar',
            '.exe', '.dll', '.so', '.dylib',
            '.lock', '.map',
        ];
    }

    /**
     * Get tool definitions for the LLM.
     */
    getToolDefinitions() {
        return [
            {
                type: 'function',
                function: {
                    name: 'grep',
                    description: 'Search for a pattern across files in the project. Returns matching lines with file paths and line numbers.',
                    parameters: {
                        type: 'object',
                        properties: {
                            pattern: { type: 'string', description: 'Search pattern (regex or plain text)' },
                            path: { type: 'string', description: 'Directory or file to search in (default: project root)' },
                            caseSensitive: { type: 'boolean', description: 'Case sensitive search (default: false)' },
                            wholeWord: { type: 'boolean', description: 'Match whole words only (default: false)' },
                            fileType: { type: 'string', description: 'File type filter (e.g., "js", "ts", "py")' },
                        },
                        required: ['pattern'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'glob',
                    description: 'Find files matching a pattern (e.g., "*.js", "src/**/*.ts").',
                    parameters: {
                        type: 'object',
                        properties: {
                            pattern: { type: 'string', description: 'Glob pattern to match files' },
                            path: { type: 'string', description: 'Directory to search in (default: project root)' },
                        },
                        required: ['pattern'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'find_files',
                    description: 'Find all files with a specific extension.',
                    parameters: {
                        type: 'object',
                        properties: {
                            extension: { type: 'string', description: 'File extension (e.g., ".js", ".ts", ".py")' },
                            path: { type: 'string', description: 'Directory to search in (default: project root)' },
                        },
                        required: ['extension'],
                    },
                },
            },
        ];
    }

    /**
     * Execute a tool by name.
     */
    async execute(toolName, params, context = {}) {
        switch (toolName) {
            case 'grep': return this.grep(params, context);
            case 'glob': return this.glob(params, context);
            case 'find_files': return this.findFiles(params, context);
            default: throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    /**
     * Search for a pattern across files.
     */
    async grep(params, context = {}) {
        const { pattern, path: searchPath = '.', caseSensitive = false, wholeWord = false, fileType } = params;
        const workingDir = context.workingDir || this._workingDir;
        const fullPath = path.resolve(workingDir, searchPath);

        logger.info(`[grep] pattern="${pattern}" in ${searchPath}`);

        let regex;
        try {
            const flags = caseSensitive ? 'g' : 'gi';
            const wordBoundary = wholeWord ? '\\b' : '';
            regex = new RegExp(`${wordBoundary}${pattern}${wordBoundary}`, flags);
        } catch (e) {
            // If regex fails, use plain text search
            regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
        }

        const results = [];
        const files = await this._getAllFiles(fullPath, fileType);

        for (const filePath of files) {
            if (results.length >= this._maxResults) break;

            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const lines = content.split('\n');

                for (let i = 0; i < lines.length; i++) {
                    if (results.length >= this._maxResults) break;

                    if (regex.test(lines[i])) {
                        const relativePath = path.relative(workingDir, filePath);
                        results.push({
                            file: relativePath,
                            line: i + 1,
                            content: lines[i].trim().substring(0, 200),
                            // Context lines
                            context: {
                                before: i > 0 ? lines[i - 1].trim().substring(0, 200) : null,
                                after: i < lines.length - 1 ? lines[i + 1].trim().substring(0, 200) : null,
                            },
                        });
                        regex.lastIndex = 0; // Reset regex for next match
                    }
                }
            } catch (e) {
                // Skip binary files or files that can't be read
            }
        }

        // Format output
        let output = '';
        if (results.length === 0) {
            output = `No matches found for "${pattern}" in ${searchPath}`;
        } else {
            output = `Found ${results.length} matches for "${pattern}":\n\n`;
            for (const result of results) {
                output += `${result.file}:${result.line}: ${result.content}\n`;
            }
        }

        logger.info(`[grep] Found ${results.length} matches`);
        return output;
    }

    /**
     * Find files matching a glob pattern.
     */
    async glob(params, context = {}) {
        const { pattern, path: searchPath = '.' } = params;
        const workingDir = context.workingDir || this._workingDir;
        const fullPath = path.resolve(workingDir, searchPath);

        logger.info(`[glob] pattern="${pattern}" in ${searchPath}`);

        // Simple glob implementation
        const regex = this._globToRegex(pattern);
        const matches = [];
        const files = await this._getAllFiles(fullPath);

        for (const filePath of files) {
            if (matches.length >= this._maxResults) break;

            const relativePath = path.relative(workingDir, filePath);
            if (regex.test(relativePath)) {
                matches.push(relativePath);
            }
        }

        let output = '';
        if (matches.length === 0) {
            output = `No files found matching "${pattern}"`;
        } else {
            output = `Found ${matches.length} files matching "${pattern}":\n\n`;
            for (const match of matches) {
                output += `${match}\n`;
            }
        }

        logger.info(`[glob] Found ${matches.length} matches`);
        return output;
    }

    /**
     * Find files by extension.
     */
    async findFiles(params, context = {}) {
        const { extension, path: searchPath = '.' } = params;
        const workingDir = context.workingDir || this._workingDir;
        const fullPath = path.resolve(workingDir, searchPath);

        const ext = extension.startsWith('.') ? extension : `.${extension}`;

        logger.info(`[find_files] extension="${ext}" in ${searchPath}`);

        const files = await this._getAllFiles(fullPath, ext.slice(1));
        const results = files.map(f => path.relative(workingDir, f));

        let output = '';
        if (results.length === 0) {
            output = `No files found with extension "${ext}"`;
        } else {
            output = `Found ${results.length} files with extension "${ext}":\n\n`;
            for (const result of results.slice(0, this._maxResults)) {
                output += `${result}\n`;
            }
            if (results.length > this._maxResults) {
                output += `\n[... ${results.length - this._maxResults} more files]`;
            }
        }

        logger.info(`[find_files] Found ${results.length} files`);
        return output;
    }

    // ── Internal Helpers ──────────────────────────────────────

    async _getAllFiles(dirPath, fileTypeFilter = null, depth = 0) {
        const files = [];
        if (depth > 15) return files; // Prevent infinite recursion

        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                // Skip ignored directories
                if (entry.isDirectory() && this._ignoredDirs.includes(entry.name)) continue;

                const fullPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    const subFiles = await this._getAllFiles(fullPath, fileTypeFilter, depth + 1);
                    files.push(...subFiles);
                } else if (entry.isFile()) {
                    // Check extension filter
                    if (fileTypeFilter) {
                        const ext = path.extname(entry.name).slice(1).toLowerCase();
                        if (ext !== fileTypeFilter.toLowerCase()) continue;
                    }

                    // Skip ignored extensions
                    const ext = path.extname(entry.name).toLowerCase();
                    if (this._ignoredExtensions.includes(ext)) continue;

                    // Check file size
                    try {
                        const stat = fs.statSync(fullPath);
                        if (stat.size > this._maxFileSize) continue;
                    } catch (e) { continue; }

                    files.push(fullPath);
                }
            }
        } catch (e) {
            // Permission denied or other error
        }

        return files;
    }

    _globToRegex(pattern) {
        // Convert glob pattern to regex
        let regexStr = pattern
            .replace(/\./g, '\\.') // Escape dots
            .replace(/\*\*/g, '<<GLOBSTAR>>') // Handle **
            .replace(/\*/g, '[^/]*') // Handle *
            .replace(/<<GLOBSTAR>>/g, '.*') // Replace ** with .*
            .replace(/\?/g, '[^/]'); // Handle ?
        
        return new RegExp(`^${regexStr}$`);
    }
}

module.exports = { SearchTools };
module.exports.default = SearchTools;
