/**
 * CodeExecutor.js — CodeAct (Code Execution)
 * 
 * Executes code emitted by the LLM:
 * - Detects code blocks in LLM responses
 * - Executes in sandboxed environment
 * - Captures output
 * - Supports: JavaScript, Python, Bash
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const logger = {
    debug: (...args) => console.log('[CodeExecutor]', ...args),
    info: (...args) => console.info('[CodeExecutor]', ...args),
    warn: (...args) => console.warn('[CodeExecutor]', ...args),
    error: (...args) => console.error('[CodeExecutor]', ...args),
};

class CodeExecutor {
    constructor(config = {}) {
        this._name = 'CodeExecutor';
        this._timeout = config.timeout || 30000;
        this._sandboxDir = config.sandboxDir || path.join(os.tmpdir(), 'codebuff-sandbox');
        this._allowedLanguages = config.allowedLanguages || ['javascript', 'python', 'bash'];
        this._maxOutputSize = config.maxOutputSize || 1024 * 1024;
    }

    getToolDefinitions() {
        return [
            {
                type: 'function',
                function: {
                    name: 'execute_code',
                    description: 'Execute code in a sandboxed environment. Supports JavaScript, Python, and Bash.',
                    parameters: {
                        type: 'object',
                        properties: {
                            language: { type: 'string', description: 'Programming language (javascript, python, bash)' },
                            code: { type: 'string', description: 'The code to execute' },
                            timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
                        },
                        required: ['language', 'code'],
                    },
                },
            },
        ];
    }

    async execute(toolName, params, context = {}) {
        if (toolName === 'execute_code') {
            return this.executeCode(params, context);
        }
        throw new Error(`Unknown tool: ${toolName}`);
    }

    /**
     * Execute code in a sandboxed environment.
     */
    async executeCode(params, context = {}) {
        const { language, code, timeout } = params;

        if (!this._allowedLanguages.includes(language)) {
            throw new Error(`Language not allowed: ${language}. Allowed: ${this._allowedLanguages.join(', ')}`);
        }

        logger.info(`[CodeExecutor] Executing ${language} code (${code.length} chars)`);

        // Ensure sandbox directory exists
        if (!fs.existsSync(this._sandboxDir)) {
            fs.mkdirSync(this._sandboxDir, { recursive: true });
        }

        const startTime = Date.now();

        switch (language) {
            case 'javascript':
                return this._executeJavaScript(code, timeout || this._timeout, startTime);
            case 'python':
                return this._executePython(code, timeout || this._timeout, startTime);
            case 'bash':
                return this._executeBash(code, timeout || this._timeout, startTime);
            default:
                throw new Error(`Unsupported language: ${language}`);
        }
    }

    /**
     * Extract and execute code blocks from LLM response.
     */
    async extractAndExecute(response, maxBlocks = 5) {
        const codeBlocks = this._extractCodeBlocks(response);
        const results = [];

        for (const block of codeBlocks.slice(0, maxBlocks)) {
            try {
                const result = await this.executeCode({
                    language: block.language,
                    code: block.code,
                });
                results.push({ ...block, result });
            } catch (error) {
                results.push({ ...block, error: error.message });
            }
        }

        return results;
    }

    // ── Internal ──────────────────────────────────────────────

    async _executeJavaScript(code, timeout, startTime) {
        const tempFile = path.join(this._sandboxDir, `exec_${Date.now()}.js`);

        try {
            // Wrap code to capture output
            const wrappedCode = `
try {
    const __output = [];
    const __log = console.log;
    const __error = console.error;
    console.log = (...args) => __output.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    console.error = (...args) => __output.push('[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    
    ${code}
    
    console.log = __log;
    console.error = __error;
    console.log(JSON.stringify({ success: true, output: __output.join('\\n') }));
} catch (e) {
    console.log(JSON.stringify({ success: false, error: e.message, stack: e.stack }));
}`;

            fs.writeFileSync(tempFile, wrappedCode);

            const result = await this._runProcess('node', [tempFile], timeout);

            // Parse output
            try {
                const parsed = JSON.parse(result.stdout.trim());
                return {
                    success: parsed.success,
                    output: parsed.output || parsed.error,
                    exitCode: result.exitCode,
                    duration: Date.now() - startTime,
                };
            } catch (e) {
                return {
                    success: result.exitCode === 0,
                    output: result.stdout || result.stderr,
                    exitCode: result.exitCode,
                    duration: Date.now() - startTime,
                };
            }
        } finally {
            try { fs.unlinkSync(tempFile); } catch {}
        }
    }

    async _executePython(code, timeout, startTime) {
        const tempFile = path.join(this._sandboxDir, `exec_${Date.now()}.py`);

        try {
            fs.writeFileSync(tempFile, code);

            const result = await this._runProcess('python3', [tempFile], timeout);

            return {
                success: result.exitCode === 0,
                output: result.stdout || result.stderr,
                exitCode: result.exitCode,
                duration: Date.now() - startTime,
            };
        } catch (error) {
            return {
                success: false,
                output: error.message,
                exitCode: 1,
                duration: Date.now() - startTime,
            };
        } finally {
            try { fs.unlinkSync(tempFile); } catch {}
        }
    }

    async _executeBash(code, timeout, startTime) {
        const result = await this._runProcess('bash', ['-c', code], timeout);

        return {
            success: result.exitCode === 0,
            output: result.stdout || result.stderr,
            exitCode: result.exitCode,
            duration: Date.now() - startTime,
        };
    }

    _runProcess(command, args, timeout) {
        return new Promise((resolve, reject) => {
            const child = spawn(command, args, {
                cwd: this._sandboxDir,
                env: { ...process.env, FORCE_COLOR: '0' },
                timeout,
                maxBuffer: this._maxOutputSize,
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => { stdout += data.toString(); });
            child.stderr.on('data', (data) => { stderr += data.toString(); });

            child.on('close', (code) => {
                resolve({ stdout, stderr, exitCode: code });
            });

            child.on('error', (error) => {
                reject(error);
            });
        });
    }

    _extractCodeBlocks(text) {
        const blocks = [];
        const regex = /```(\w+)?\n([\s\S]*?)```/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            const language = match[1] || 'javascript';
            const code = match[2].trim();

            if (code.length > 0 && this._allowedLanguages.includes(language)) {
                blocks.push({ language, code });
            }
        }

        return blocks;
    }
}

module.exports = { CodeExecutor };
module.exports.default = CodeExecutor;
