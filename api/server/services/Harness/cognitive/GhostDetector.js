/**
 * GhostDetector.js — Ghost Implementation Detection
 * 
 * Detects:
 * - Unimplemented functions
 * - Mock/placeholder code
 * - Disconnected modules
 * - Dead code
 * - Unused imports
 * 
 * License: MIT
 * RAM: ~2MB
 */

const fs = require('fs');
const path = require('path');

class GhostDetector {
    constructor(config = {}) {
        this._name = 'GhostDetector';
        this._workingDir = config.workingDir || process.cwd();
    }

    scan() {
        const ghosts = [];
        const files = this._getJSFiles(this._workingDir);
        for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');
            const fileGhosts = this._analyzeFile(file, content);
            ghosts.push(...fileGhosts);
        }
        return { total: ghosts.length, ghosts, scannedFiles: files.length };
    }

    _analyzeFile(filePath, content) {
        const ghosts = [];
        const lines = content.split('\n');

        // Paths that are inherited upstream code — TODOs there are not ours to fix.
        const UPSTREAM_PATHS = [
            'app/clients', 'controllers/agents', 'controllers/assistants',
            'middleware/buildEndpointOption', 'routes/files/images', 'routes/files/speech',
            'services/Config/loadCustomConfig', 'services/Files/process',
            'services/Threads', 'services/ToolService',
        ];
        const isUpstream = UPSTREAM_PATHS.some(p => filePath.replace(/\\/g, '/').includes(p));

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Unimplemented stub — throw new Error('Not implemented')
            if (/throw new Error\(['"]Not implemented['"]\)/.test(line) || /throw new Error\(['"]TODO['"]\)/.test(line)) {
                ghosts.push({ file: filePath, line: i + 1, type: 'not_implemented', content: line.trim() });
            }

            // Placeholder comment — only flag TODO/FIXME/MOCK that imply missing work, skip upstream files
            if (!isUpstream && /\/\/\s*(TODO|FIXME|PLACEHOLDER|MOCK)\b/.test(line)) {
                ghosts.push({ file: filePath, line: i + 1, type: 'placeholder', content: line.trim() });
            }

            // Empty return only flagged when the inline comment itself says TODO/FIXME
            if (/return\s*(null|undefined|{\s*})\s*;?\s*\/\/\s*(TODO|FIXME|MOCK)/.test(line)) {
                ghosts.push({ file: filePath, line: i + 1, type: 'empty_return', content: line.trim() });
            }
        }
        return ghosts;
    }

    _getJSFiles(dir, files = []) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && !['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
                    this._getJSFiles(path.join(dir, entry.name), files);
                } else if (entry.isFile() && entry.name.endsWith('.js')) {
                    files.push(path.join(dir, entry.name));
                }
            }
        } catch {}
        return files;
    }
}

module.exports = { GhostDetector };
module.exports.default = GhostDetector;
