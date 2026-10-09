/**
 * DuplicateDetector.js — Duplicate Code Detection
 * 
 * Detects:
 * - Duplicate functions
 * - Similar code blocks
 * - Copy-paste patterns
 * 
 * License: MIT
 * RAM: ~2MB
 */

const fs = require('fs');
const path = require('path');

class DuplicateDetector {
    constructor(config = {}) {
        this._name = 'DuplicateDetector';
        this._minLines = config.minLines || 5;
        this._similarity = config.similarity || 0.8;
    }

    scan(dir) {
        const files = this._getJSFiles(dir || process.cwd());
        const blocks = new Map();
        for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');
            const fileBlocks = this._extractBlocks(file, content);
            for (const block of fileBlocks) {
                const hash = this._hashBlock(block.lines);
                if (!blocks.has(hash)) blocks.set(hash, []);
                blocks.get(hash).push(block);
            }
        }
        const duplicates = [];
        for (const [hash, blockList] of blocks) {
            if (blockList.length > 1) {
                duplicates.push({ hash, files: blockList.map(b => b.file), line: blockList[0].startLine, lines: blockList[0].lines.length, content: blockList[0].lines.slice(0, 3).join('\n') });
            }
        }
        return { total: duplicates.length, duplicates, scannedFiles: files.length };
    }

    _extractBlocks(file, content) {
        const lines = content.split('\n');
        const blocks = [];
        for (let i = 0; i < lines.length - this._minLines; i++) {
            const block = lines.slice(i, i + this._minLines).map(l => l.trim()).filter(l => l.length > 5);
            if (block.length >= this._minLines) {
                blocks.push({ file, startLine: i + 1, lines: block });
            }
        }
        return blocks;
    }

    _hashBlock(lines) {
        const normalized = lines.map(l => l.replace(/\s+/g, ' ').replace(/['"]/g, '"').trim()).join('\n');
        let hash = 0;
        for (let i = 0; i < normalized.length; i++) {
            const chr = normalized.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return hash.toString(16);
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

module.exports = { DuplicateDetector };
module.exports.default = DuplicateDetector;
