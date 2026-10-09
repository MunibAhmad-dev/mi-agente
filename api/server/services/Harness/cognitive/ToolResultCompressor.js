/**
 * ToolResultCompressor.js — Compress Tool Results
 * 
 * Reduces token usage by compressing tool outputs:
 * - Truncate long outputs
 * - Extract key information
 * - Summarize results
 * - Remove redundant data
 * 
 * License: MIT
 * RAM: ~2MB
 */

const logger = {
    debug: (...args) => console.log('[ToolResultCompressor]', ...args),
    info: (...args) => console.info('[ToolResultCompressor]', ...args),
};

class ToolResultCompressor {
    constructor(config = {}) {
        this._name = 'ToolResultCompressor';
        this._maxTokens = config.maxTokens || 4000;
        this._compressionRules = this._getDefaultRules();
    }

    /**
     * Compress a tool result.
     */
    compress(toolName, result, options = {}) {
        if (typeof result === 'string') {
            return this._compressString(result, toolName);
        }

        if (typeof result === 'object') {
            return this._compressObject(result, toolName);
        }

        return result;
    }

    /**
     * Compress multiple results.
     */
    compressBatch(results) {
        return results.map(r => this.compress(r.tool, r.result));
    }

    // ── Internal ──────────────────────────────────────────────

    _compressString(text, toolName) {
        // Estimate tokens (rough: 4 chars = 1 token)
        const estimatedTokens = Math.ceil(text.length / 4);

        if (estimatedTokens <= this._maxTokens) {
            return text;
        }

        // Apply tool-specific compression
        const rule = this._compressionRules[toolName];
        if (rule) {
            return rule(text, this._maxTokens);
        }

        // Generic compression: truncate + add marker
        const maxChars = this._maxTokens * 4;
        return text.substring(0, maxChars) + `\n\n[... truncated, ${estimatedTokens - this._maxTokens} tokens saved]`;
    }

    _compressObject(obj, toolName) {
        const json = JSON.stringify(obj, null, 2);
        const estimatedTokens = Math.ceil(json.length / 4);

        if (estimatedTokens <= this._maxTokens) {
            return obj;
        }

        // Truncate object
        const maxChars = this._maxTokens * 4;
        return {
            _compressed: true,
            _originalTokens: estimatedTokens,
            _savedTokens: estimatedTokens - this._maxTokens,
            data: JSON.parse(json.substring(0, maxChars) + '{}'),
        };
    }

    _getDefaultRules() {
        return {
            // grep: keep only first N matches or truncate
            grep: (text, maxTokens) => {
                const lines = text.split('\n');
                const maxChars = maxTokens * 4;
                if (text.length > maxChars) {
                    return text.substring(0, maxChars) + `\n\n[... truncated]`;
                }
                const maxLines = maxTokens * 2;
                if (lines.length > maxLines) {
                    return lines.slice(0, maxLines).join('\n') + 
                        `\n\n[... ${lines.length - maxLines} more matches]`;
                }
                return text;
            },

            // glob: keep only file list
            glob: (text, maxTokens) => {
                const lines = text.split('\n');
                if (lines.length > maxTokens) {
                    return lines.slice(0, maxTokens).join('\n') +
                        `\n\n[... ${lines.length - maxTokens} more files]`;
                }
                return text;
            },

            // read_file: keep structure, truncate middle
            read_file: (text, maxTokens) => {
                const lines = text.split('\n');
                if (lines.length > maxTokens * 2) {
                    const keep = Math.floor(maxTokens * 0.8);
                    const head = lines.slice(0, keep);
                    const tail = lines.slice(-keep);
                    return head.join('\n') + 
                        `\n\n[... ${lines.length - keep * 2} lines truncated ...]\n\n` +
                        tail.join('\n');
                }
                return text;
            },

            // execute_command: keep exit code + first/last lines
            execute_command: (text, maxTokens) => {
                const lines = text.split('\n');
                if (lines.length > maxTokens * 2) {
                    const keep = Math.floor(maxTokens * 0.4);
                    const head = lines.slice(0, keep);
                    const tail = lines.slice(-keep);
                    return head.join('\n') +
                        `\n\n[... ${lines.length - keep * 2} lines output ...]\n\n` +
                        tail.join('\n');
                }
                return text;
            },

            // verify_all: keep summary only
            verify_all: (text, maxTokens) => {
                // Extract just the summary
                const summaryMatch = text.match(/SUMMARY[\s\S]*?(?=\n\n|$)/i);
                if (summaryMatch) {
                    return summaryMatch[0];
                }
                return text.substring(0, maxTokens * 4);
            },
        };
    }
}

module.exports = { ToolResultCompressor };
module.exports.default = ToolResultCompressor;
