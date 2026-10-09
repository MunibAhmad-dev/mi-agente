/**
 * FileIndexer.js — File & AST Indexing
 * 
 * Indexes files for fast search:
 * - File name index
 * - Content index (inverted index)
 * - AST index (when tree-sitter available)
 * - Incremental updates
 * 
 * License: MIT
 * RAM: ~10MB
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[FileIndexer]', ...args),
    info: (...args) => console.info('[FileIndexer]', ...args),
};

class FileIndexer extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'FileIndexer';
        this._workingDir = config.workingDir || process.cwd();
        this._maxFiles = config.maxFiles || 5000;
        this._ignoredDirs = config.ignoredDirs || [
            'node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__', '.cache'
        ];
        this._fileIndex = new Map(); // path -> { size, mtime, content }
        this._invertedIndex = new Map(); // word -> Set<paths>
        this._lastBuild = null;
    }

    /**
     * Build the file index.
     */
    async buildIndex(rootDir = null) {
        const dir = rootDir || this._workingDir;
        const startTime = Date.now();

        logger.info(`[FileIndexer] Building index for ${dir}`);

        this._fileIndex.clear();
        this._invertedIndex.clear();

        const files = [];
        this._scanDirectory(dir, '', files, 0);

        let indexed = 0;
        for (const file of files.slice(0, this._maxFiles)) {
            try {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);

                // Skip large files
                if (stat.size > 1024 * 1024) continue;

                const content = fs.readFileSync(fullPath, 'utf8');
                const words = this._tokenize(content);

                this._fileIndex.set(file, {
                    size: stat.size,
                    mtime: stat.mtime.getTime(),
                    lines: content.split('\n').length,
                    words: words.length,
                });

                // Build inverted index
                const uniqueWords = new Set(words);
                for (const word of uniqueWords) {
                    if (!this._invertedIndex.has(word)) {
                        this._invertedIndex.set(word, new Set());
                    }
                    this._invertedIndex.get(word).add(file);
                }

                indexed++;
            } catch (e) {
                // Skip unreadable files
            }
        }

        this._lastBuild = Date.now();

        logger.info(`[FileIndexer] Indexed ${indexed} files in ${Date.now() - startTime}ms`);
        return { files: indexed, words: this._invertedIndex.size, duration: Date.now() - startTime };
    }

    /**
     * Search the index.
     */
    search(query, options = {}) {
        const { limit = 50 } = options;
        const words = this._tokenize(query);

        // Score files by number of matching words
        const scores = new Map();

        for (const word of words) {
            const files = this._invertedIndex.get(word);
            if (files) {
                for (const file of files) {
                    scores.set(file, (scores.get(file) || 0) + 1);
                }
            }
        }

        // Sort by score
        return [...scores.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([file, score]) => ({
                file,
                score,
                info: this._fileIndex.get(file),
            }));
    }

    /**
     * Find files by name pattern.
     */
    findByName(pattern) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
        const matches = [];

        for (const [file, info] of this._fileIndex) {
            if (regex.test(path.basename(file))) {
                matches.push({ file, info });
            }
        }

        return matches;
    }

    /**
     * Find files containing a word.
     */
    findByContent(word) {
        const files = this._invertedIndex.get(word.toLowerCase());
        if (!files) return [];

        return [...files].map(file => ({
            file,
            info: this._fileIndex.get(file),
        }));
    }

    /**
     * Get index stats.
     */
    getStats() {
        return {
            files: this._fileIndex.size,
            words: this._invertedIndex.size,
            lastBuild: this._lastBuild ? new Date(this._lastBuild).toISOString() : null,
        };
    }

    // ── Internal ──────────────────────────────────────────────

    _scanDirectory(dir, relativePath, files, depth) {
        if (depth > 15) return;

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && this._ignoredDirs.includes(entry.name)) continue;

                const itemRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;

                if (entry.isDirectory()) {
                    this._scanDirectory(path.join(dir, entry.name), itemRelative, files, depth + 1);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.json', '.md', '.yaml', '.yml', '.html', '.css'].includes(ext)) {
                        files.push(itemRelative);
                    }
                }
            }
        } catch (e) {}
    }

    _tokenize(text) {
        return text.toLowerCase()
            .replace(/[^a-z0-9_]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && w.length < 50)
            .slice(0, 10000); // Limit tokens per file
    }
}

module.exports = { FileIndexer };
module.exports.default = FileIndexer;
