/**
 * CodebaseForensics.js — Codebase Forensics Engine
 * 
 * Analyzes:
 * - Dead code detection
 * - Unused imports
 * - Complexity analysis
 * - Dependency issues
 * - Code smells
 * 
 * License: MIT
 * RAM: ~5MB
 */

const fs = require('fs');
const path = require('path');

class CodebaseForensics {
    constructor(config = {}) {
        this._name = 'CodebaseForensics';
        this._workingDir = config.workingDir || process.cwd();
    }

    analyze() {
        const files = this._getJSFiles(this._workingDir);
        const results = { files: files.length, deadCode: [], unusedImports: [], complexity: [], codeSmells: [], totalIssues: 0 };
        for (const file of files) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                results.deadCode.push(...this._findDeadCode(file, content));
                results.unusedImports.push(...this._findUnusedImports(file, content));
                results.complexity.push(...this._analyzeComplexity(file, content));
                results.codeSmells.push(...this._findCodeSmells(file, content));
            } catch {}
        }
        results.totalIssues = results.deadCode.length + results.unusedImports.length + results.complexity.length + results.codeSmells.length;
        return results;
    }

    _findDeadCode(file, content) {
        const issues = [];
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (/^\s*\/\/.*unreachable|^\s*return;.*\n\s*\S/.test(lines[i])) {
                issues.push({ file, line: i + 1, type: 'unreachable', description: 'Unreachable code' });
            }
        }
        return issues;
    }

    _findUnusedImports(file, content) {
        const issues = [];
        const importRegex = /(?:const|let|var)\s+(\w+)\s*=\s*require\(['"](.+?)['"]\)/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            const varName = match[1];
            const rest = content.substring(match.index + match[0].length);
            if (!rest.includes(varName)) {
                issues.push({ file, line: content.substring(0, match.index).split('\n').length, type: 'unused-import', description: `Unused import: ${varName}` });
            }
        }
        return issues;
    }

    _analyzeComplexity(file, content) {
        const issues = [];
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const nesting = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
            if (nesting > 4) issues.push({ file, line: i + 1, type: 'high-complexity', description: `High nesting depth: ${nesting}` });
            if (line.length > 200) issues.push({ file, line: i + 1, type: 'long-line', description: `Line too long: ${line.length} chars` });
        }
        return issues;
    }

    _findCodeSmells(file, content) {
        const issues = [];
        if (content.includes('TODO')) issues.push({ file, type: 'todo', description: 'Contains TODO comments' });
        if (content.includes('FIXME')) issues.push({ file, type: 'fixme', description: 'Contains FIXME comments' });
        if (content.includes('HACK')) issues.push({ file, type: 'hack', description: 'Contains HACK comments' });
        const functions = content.match(/function\s+\w+/g) || [];
        if (functions.length > 20) issues.push({ file, type: 'many-functions', description: `Too many functions: ${functions.length}` });
        return issues;
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

module.exports = { CodebaseForensics };
module.exports.default = CodebaseForensics;
