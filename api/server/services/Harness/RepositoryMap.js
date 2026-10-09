/**
 * RepositoryMap.js — Repository Map (Aider-style)
 * 
 * Builds a tree-sitter powered map of the repository:
 * - Parse all source files with tree-sitter
 * - Extract symbols (functions, classes, exports, imports)
 * - Rank files by relevance to a query
 * - Provide context for the agent loop
 * 
 * Based on: Aider's repo-map pattern
 */

const fs = require('fs');
const path = require('path');

const logger = {
    debug: (...args) => console.log('[RepositoryMap]', ...args),
    info: (...args) => console.info('[RepositoryMap]', ...args),
    warn: (...args) => console.warn('[RepositoryMap]', ...args),
    error: (...args) => console.error('[RepositoryMap]', ...args),
};

// Try to load tree-sitter (optional dependency)
let Parser = null;
let JsParser = null;
let TsParser = null;
let PythonParser = null;

try {
    Parser = require('tree-sitter');
    try { JsParser = require('tree-sitter-javascript'); } catch {}
    try { TsParser = require('tree-sitter-typescript').typescript; } catch {}
    try { PythonParser = require('tree-sitter-python'); } catch {}
} catch {
    logger.warn('[RepositoryMap] tree-sitter not available, using fallback mode');
}

class RepositoryMap {
    constructor(config = {}) {
        this._name = 'RepositoryMap';
        this._workingDir = config.workingDir || process.cwd();
        this._maxFiles = config.maxFiles || 500;
        this._maxLinesPerFile = config.maxLinesPerFile || 500;
        this._ignoredDirs = config.ignoredDirs || [
            'node_modules', '.git', 'dist', 'build', '.next', 
            'coverage', '__pycache__', '.cache', '.venv', 'venv'
        ];
        this._ignoredExtensions = config.ignoredExtensions || [
            '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg',
            '.woff', '.woff2', '.ttf', '.eot',
            '.zip', '.tar', '.gz', '.rar',
            '.exe', '.dll', '.so', '.dylib',
            '.lock', '.map', '.min.js', '.min.css',
        ];
        this._map = null;
        this._lastBuild = null;
        this._buildInterval = config.buildInterval || 30000; // 30 seconds
    }

    /**
     * Build the repository map.
     */
    async buildMap(rootDir = null) {
        const dir = rootDir || this._workingDir;
        const startTime = Date.now();

        logger.info(`[RepositoryMap] Building map for ${dir}`);

        const files = [];
        this._scanDirectory(dir, '', files, 0);

        const map = {
            root: dir,
            files: [],
            symbols: new Map(),
            totalFiles: 0,
            totalLines: 0,
            buildTime: Date.now() - startTime,
        };

        let processed = 0;
        for (const file of files.slice(0, this._maxFiles)) {
            try {
                const fileInfo = await this._analyzeFile(path.join(dir, file));
                if (fileInfo) {
                    map.files.push(fileInfo);
                    map.totalFiles++;
                    map.totalLines += fileInfo.lines;

                    // Index symbols
                    for (const symbol of fileInfo.symbols) {
                        map.symbols.set(symbol.name, {
                            file: file,
                            line: symbol.line,
                            type: symbol.type,
                            name: symbol.name,
                        });
                    }

                    processed++;
                }
            } catch (e) {
                // Skip files that can't be parsed
            }
        }

        map.totalSymbols = map.symbols.size;
        this._map = map;
        this._lastBuild = Date.now();

        logger.info(`[RepositoryMap] Built map: ${map.totalFiles} files, ${map.totalSymbols} symbols, ${map.totalLines} lines (${map.buildTime}ms)`);
        return map;
    }

    /**
     * Get a summary of the repository structure.
     */
    async getSummary(rootDir = null) {
        if (!this._map || Date.now() - this._lastBuild > this._buildInterval) {
            await this.buildMap(rootDir);
        }

        const map = this._map;
        let summary = `Repository: ${path.basename(map.root)}\n`;
        summary += `Files: ${map.totalFiles} | Symbols: ${map.totalSymbols} | Lines: ${map.totalLines}\n\n`;

        // Directory tree (simplified)
        summary += '## Directory Structure\n```\n';
        const dirs = new Set();
        for (const file of map.files) {
            const dir = path.dirname(file.path);
            if (dir !== '.') {
                dirs.add(dir);
            }
        }

        // Sort and add directories
        const sortedDirs = [...dirs].sort().slice(0, 50);
        for (const dir of sortedDirs) {
            summary += `${dir}/\n`;
        }
        summary += '```\n\n';

        // Key files
        summary += '## Key Files\n';
        const keyFiles = map.files
            .filter(f => f.lines > 10 && f.symbols.length > 0)
            .sort((a, b) => b.symbols.length - a.symbols.length)
            .slice(0, 20);

        for (const file of keyFiles) {
            summary += `- ${file.path} (${file.lines} lines, ${file.symbols.length} symbols)\n`;
        }

        return summary;
    }

    /**
     * Get context files relevant to a query.
     */
    async getContextFiles(query, maxFiles = 10) {
        if (!this._map || Date.now() - this._lastBuild > this._buildInterval) {
            await this.buildMap();
        }

        const queryLower = query.toLowerCase();
        const scored = [];

        for (const file of this._map.files) {
            let score = 0;

            // Score by filename match
            if (file.path.toLowerCase().includes(queryLower)) {
                score += 10;
            }

            // Score by symbol name match
            for (const symbol of file.symbols) {
                if (symbol.name.toLowerCase().includes(queryLower)) {
                    score += 5;
                }
            }

            // Score by content match (if we have it)
            if (file.exports && file.exports.some(e => e.toLowerCase().includes(queryLower))) {
                score += 3;
            }

            if (score > 0) {
                scored.push({ ...file, score });
            }
        }

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);

        return scored.slice(0, maxFiles);
    }

    /**
     * Get file symbols.
     */
    getFileSymbols(filePath) {
        if (!this._map) return [];
        const fileInfo = this._map.files.find(f => f.path === filePath);
        return fileInfo ? fileInfo.symbols : [];
    }

    /**
     * Get all symbols of a specific type.
     */
    getSymbolsByType(type) {
        if (!this._map) return [];
        return [...this._map.symbols.values()].filter(s => s.type === type);
    }

    /**
     * Search symbols by name.
     */
    searchSymbols(query) {
        if (!this._map) return [];
        const queryLower = query.toLowerCase();
        const results = [];

        for (const [name, info] of this._map.symbols) {
            if (name.toLowerCase().includes(queryLower)) {
                results.push({ name, ...info });
            }
        }

        return results;
    }

    /**
     * Get statistics.
     */
    getStats() {
        if (!this._map) return null;
        return {
            totalFiles: this._map.totalFiles,
            totalSymbols: this._map.totalSymbols,
            totalLines: this._map.totalLines,
            lastBuild: this._lastBuild ? new Date(this._lastBuild).toISOString() : null,
            buildTime: this._map.buildTime,
        };
    }

    // ── Internal Methods ──────────────────────────────────────

    _scanDirectory(dir, relativePath, files, depth) {
        if (depth > 15) return;

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                // Skip ignored directories
                if (entry.isDirectory() && this._ignoredDirs.includes(entry.name)) continue;

                const itemRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;

                if (entry.isDirectory()) {
                    this._scanDirectory(path.join(dir, entry.name), itemRelative, files, depth + 1);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (this._ignoredExtensions.includes(ext)) continue;

                    // Only include source files
                    if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.json', '.md', '.yaml', '.yml', '.html', '.css', '.scss'].includes(ext)) {
                        files.push(itemRelative);
                    }
                }
            }
        } catch (e) {
            // Permission denied
        }
    }

    async _analyzeFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const relativePath = path.relative(this._workingDir, filePath);

        // Skip files that are too large
        try {
            const stat = fs.statSync(filePath);
            if (stat.size > 1024 * 1024) return null; // Skip files > 1MB
        } catch (e) {
            return null;
        }

        let content;
        try {
            content = fs.readFileSync(filePath, 'utf8');
        } catch (e) {
            return null;
        }

        const lines = content.split('\n');
        const truncatedLines = lines.slice(0, this._maxLinesPerFile);

        const fileInfo = {
            path: relativePath,
            ext,
            lines: lines.length,
            symbols: [],
            exports: [],
            imports: [],
        };

        // Try tree-sitter parsing
        if (Parser) {
            try {
                const symbols = this._parseWithTreeSitter(content, ext);
                fileInfo.symbols = symbols;
                fileInfo.exports = symbols.filter(s => s.type === 'export').map(s => s.name);
                fileInfo.imports = symbols.filter(s => s.type === 'import').map(s => s.name);
                return fileInfo;
            } catch (e) {
                // Fallback to regex parsing
            }
        }

        // Fallback: regex-based extraction
        fileInfo.symbols = this._parseWithRegex(content, ext);
        fileInfo.exports = fileInfo.symbols.filter(s => s.type === 'export').map(s => s.name);
        fileInfo.imports = fileInfo.symbols.filter(s => s.type === 'import').map(s => s.name);

        return fileInfo;
    }

    _parseWithTreeSitter(content, ext) {
        const symbols = [];

        let parser;
        if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') {
            if (JsParser) {
                parser = new Parser();
                parser.setLanguage(JsParser);
            }
        } else if (ext === '.ts' || ext === '.tsx') {
            if (TsParser) {
                parser = new Parser();
                parser.setLanguage(TsParser);
            }
        } else if (ext === '.py') {
            if (PythonParser) {
                parser = new Parser();
                parser.setLanguage(PythonParser);
            }
        }

        if (!parser) return symbols;

        try {
            const tree = parser.parse(content);
            this._extractSymbols(tree.rootNode, symbols, 0);
        } catch (e) {
            // Parse error, skip
        }

        return symbols;
    }

    _extractSymbols(node, symbols, depth) {
        if (depth > 20) return;

        const type = node.type;

        // Extract function declarations
        if (type === 'function_declaration' || type === 'function' || type === 'arrow_function') {
            const nameNode = node.childForFieldName('name') || node.children?.find(c => c.type === 'identifier');
            if (nameNode) {
                symbols.push({
                    name: nameNode.text,
                    type: 'function',
                    line: nameNode.startPosition.row + 1,
                });
            }
        }

        // Extract class declarations
        if (type === 'class_declaration' || type === 'class') {
            const nameNode = node.childForFieldName('name') || node.children?.find(c => c.type === 'identifier');
            if (nameNode) {
                symbols.push({
                    name: nameNode.text,
                    type: 'class',
                    line: nameNode.startPosition.row + 1,
                });
            }
        }

        // Extract variable declarations (const, let, var)
        if (type === 'variable_declaration' || type === 'lexical_declaration') {
            for (const child of node.children || []) {
                if (child.type === 'variable_declarator') {
                    const nameNode = child.childForFieldName('name') || child.children?.find(c => c.type === 'identifier');
                    if (nameNode) {
                        symbols.push({
                            name: nameNode.text,
                            type: 'variable',
                            line: nameNode.startPosition.row + 1,
                        });
                    }
                }
            }
        }

        // Extract exports
        if (type === 'export_statement' || type === 'export') {
            const nameNode = node.children?.find(c => 
                c.type === 'identifier' || c.type === 'function_declaration' || c.type === 'class_declaration'
            );
            if (nameNode) {
                symbols.push({
                    name: nameNode.text || 'default',
                    type: 'export',
                    line: node.startPosition.row + 1,
                });
            }
        }

        // Extract imports
        if (type === 'import_statement' || type === 'import') {
            const sourceNode = node.children?.find(c => c.type === 'string');
            if (sourceNode) {
                symbols.push({
                    name: sourceNode.text.replace(/['"]/g, ''),
                    type: 'import',
                    line: node.startPosition.row + 1,
                });
            }
        }

        // Recurse into children
        for (const child of node.children || []) {
            this._extractSymbols(child, symbols, depth + 1);
        }
    }

    _parseWithRegex(content, ext) {
        const symbols = [];
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // JavaScript/TypeScript
            if (ext === '.js' || ext === '.jsx' || ext === '.ts' || ext === '.tsx' || ext === '.mjs') {
                // Function declarations
                const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
                if (funcMatch) {
                    symbols.push({ name: funcMatch[1], type: 'function', line: i + 1 });
                }

                // Class declarations
                const classMatch = line.match(/(?:export\s+)?class\s+(\w+)/);
                if (classMatch) {
                    symbols.push({ name: classMatch[1], type: 'class', line: i + 1 });
                }

                // Arrow functions / const
                const constMatch = line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/);
                if (constMatch) {
                    symbols.push({ name: constMatch[1], type: 'variable', line: i + 1 });
                }

                // Exports
                const exportMatch = line.match(/export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/);
                if (exportMatch) {
                    symbols.push({ name: exportMatch[1], type: 'export', line: i + 1 });
                }

                // Imports
                const importMatch = line.match(/import\s+.*?from\s+['"](.+?)['"]/);
                if (importMatch) {
                    symbols.push({ name: importMatch[1], type: 'import', line: i + 1 });
                }
            }

            // Python
            if (ext === '.py') {
                const funcMatch = line.match(/(?:async\s+)?def\s+(\w+)/);
                if (funcMatch) {
                    symbols.push({ name: funcMatch[1], type: 'function', line: i + 1 });
                }

                const classMatch = line.match(/class\s+(\w+)/);
                if (classMatch) {
                    symbols.push({ name: classMatch[1], type: 'class', line: i + 1 });
                }

                const importMatch = line.match(/(?:from\s+.+\s+)?import\s+(\w+)/);
                if (importMatch) {
                    symbols.push({ name: importMatch[1], type: 'import', line: i + 1 });
                }
            }
        }

        return symbols;
    }
}

module.exports = { RepositoryMap };
module.exports.default = RepositoryMap;
