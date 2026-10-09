/**
 * ShellTool.js — Shell/Bash Execution Tool
 * 
 * Implements command execution like Claude Code's bash tool:
 * - Execute shell commands with output capture
 * - Background execution
 * - Timeout handling
 * - Security: command whitelist, blocked commands
 * - Working directory control
 */

const { spawn, exec } = require('child_process');
const path = require('path');

const logger = {
    debug: (...args) => console.log('[ShellTool]', ...args),
    info: (...args) => console.info('[ShellTool]', ...args),
    warn: (...args) => console.warn('[ShellTool]', ...args),
    error: (...args) => console.error('[ShellTool]', ...args),
};

// Explicit allowlist: only these command prefixes may execute.
// The config may extend this list; it cannot shrink it.
const BASE_ALLOWLIST = [
    'ls', 'cat', 'head', 'tail', 'echo', 'printf', 'pwd', 'whoami', 'date', 'env',
    'git', 'npm', 'npx', 'node', 'python', 'python3', 'pip', 'pip3',
    'curl', 'wget', 'which', 'type', 'find', 'grep', 'awk', 'sed', 'sort', 'uniq',
    'wc', 'diff', 'mkdir', 'cp', 'mv', 'touch', 'chmod', 'chown',
    'tar', 'zip', 'unzip', 'gzip', 'gunzip',
    'ffmpeg', 'ffprobe', 'convert', 'mogrify',
    'docker', 'docker-compose', 'kubectl',
    'jest', 'mocha', 'vitest', 'ts-node', 'tsc',
    'yarn', 'pnpm', 'bun',
    'rm', // only safe form checked below (no -rf on /)
    'kill', 'ps', 'top', 'df', 'du', 'free', 'uname',
    'sleep', 'true', 'false', 'test', '[',
];

class ShellTool {
    constructor(config = {}) {
        this._name = 'ShellTool';
        this._workingDir = config.workingDir || process.cwd();
        this._timeout = config.timeout || 60000; // 60 seconds default
        this._maxOutputSize = config.maxOutputSize || 1024 * 1024; // 1MB
        this._blockedCommands = config.blockedCommands || [
            'rm -rf /',
            'rm -rf /*',
            'mkfs',
            'dd if=',
            ':(){ :|:& };:',
            'chmod -R 777 /',
            'shutdown',
            'reboot',
            'halt',
            'poweroff',
        ];
        // Extended allowlist: caller may add more prefixes; base set is always present
        this._allowedPrefixes = new Set([...BASE_ALLOWLIST, ...(config.extraAllowlist || [])]);
        this._allowedShells = config.allowedShells || ['bash', 'sh', 'cmd'];
        this._backgroundProcesses = new Map();
    }

    /**
     * Get tool definitions for the LLM.
     */
    getToolDefinitions() {
        return [
            {
                type: 'function',
                function: {
                    name: 'execute_command',
                    description: 'Execute a shell command and return the output. Use for running scripts, installing packages, testing code, etc.',
                    parameters: {
                        type: 'object',
                        properties: {
                            command: { type: 'string', description: 'The shell command to execute' },
                            cwd: { type: 'string', description: 'Working directory (default: project root)' },
                            timeout: { type: 'number', description: 'Timeout in milliseconds (default: 60000)' },
                        },
                        required: ['command'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'execute_background',
                    description: 'Execute a shell command in the background. Returns a process ID to check status later.',
                    parameters: {
                        type: 'object',
                        properties: {
                            command: { type: 'string', description: 'The shell command to execute' },
                            cwd: { type: 'string', description: 'Working directory (default: project root)' },
                        },
                        required: ['command'],
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
            case 'execute_command': return this.executeCommand(params, context);
            case 'execute_background': return this.executeBackground(params, context);
            default: throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    /**
     * Execute a command and wait for completion.
     */
    async executeCommand(params, context = {}) {
        const { command, cwd, timeout } = params;
        const workingDir = cwd || context.workingDir || this._workingDir;
        const timeoutMs = timeout || this._timeout;

        // Security checks
        this._validateCommand(command);

        logger.info(`[execute_command] ${command}`);
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const child = spawn('bash', ['-c', command], {
                cwd: workingDir,
                env: { ...process.env, FORCE_COLOR: '0' },
                timeout: timeoutMs,
                maxBuffer: this._maxOutputSize,
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                const duration = Date.now() - startTime;
                const truncated = stdout.length > this._maxOutputSize;
                const truncatedStderr = stderr.length > this._maxOutputSize;

                const result = {
                    exitCode: code,
                    stdout: truncated ? stdout.substring(0, this._maxOutputSize) + '\n[... truncated]' : stdout,
                    stderr: truncatedStderr ? stderr.substring(0, this._maxOutputSize) + '\n[... truncated]' : stderr,
                    duration,
                    command,
                    cwd: workingDir,
                };

                if (code === 0) {
                    logger.info(`[execute_command] Success (${duration}ms)`);
                    resolve(result);
                } else {
                    logger.warn(`[execute_command] Failed with exit code ${code} (${duration}ms)`);
                    // Don't reject on non-zero exit code, return the result
                    // The agent loop will handle the error
                    resolve(result);
                }
            });

            child.on('error', (error) => {
                const duration = Date.now() - startTime;
                logger.error(`[execute_command] Error: ${error.message}`);
                reject({
                    error: error.message,
                    command,
                    cwd: workingDir,
                    duration,
                });
            });
        });
    }

    /**
     * Execute a command in the background.
     */
    async executeBackground(params, context = {}) {
        const { command, cwd } = params;
        const workingDir = cwd || context.workingDir || this._workingDir;

        this._validateCommand(command);

        const processId = `bg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        logger.info(`[execute_background] ${command} (PID: ${processId})`);

        const child = spawn('bash', ['-c', command], {
            cwd: workingDir,
            env: { ...process.env, FORCE_COLOR: '0' },
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => { stdout += data.toString(); });
        child.stderr?.on('data', (data) => { stderr += data.toString(); });

        this._backgroundProcesses.set(processId, {
            child,
            command,
            cwd: workingDir,
            startedAt: new Date().toISOString(),
            stdout: () => stdout,
            stderr: () => stderr,
        });

        child.on('close', (code) => {
            const proc = this._backgroundProcesses.get(processId);
            if (proc) {
                proc.exitCode = code;
                proc.endedAt = new Date().toISOString();
            }
        });

        child.unref();

        return {
            processId,
            command,
            cwd: workingDir,
            status: 'running',
            message: `Command running in background. Use processId "${processId}" to check status.`,
        };
    }

    /**
     * Check the status of a background process.
     */
    async checkProcessStatus(processId) {
        const proc = this._backgroundProcesses.get(processId);
        if (!proc) {
            throw new Error(`Process not found: ${processId}`);
        }

        return {
            processId,
            command: proc.command,
            status: proc.exitCode !== undefined ? 'finished' : 'running',
            exitCode: proc.exitCode,
            startedAt: proc.startedAt,
            endedAt: proc.endedAt,
            stdout: proc.stdout().substring(0, 10000),
            stderr: proc.stderr().substring(0, 10000),
        };
    }

    /**
     * Kill a background process.
     */
    async killProcess(processId) {
        const proc = this._backgroundProcesses.get(processId);
        if (!proc) {
            throw new Error(`Process not found: ${processId}`);
        }

        try {
            proc.child.kill('SIGTERM');
            this._backgroundProcesses.delete(processId);
            return { success: true, processId };
        } catch (error) {
            throw new Error(`Failed to kill process: ${error.message}`);
        }
    }

    /**
     * Get list of running background processes.
     */
    listBackgroundProcesses() {
        const processes = [];
        for (const [id, proc] of this._backgroundProcesses) {
            processes.push({
                processId: id,
                command: proc.command,
                status: proc.exitCode !== undefined ? 'finished' : 'running',
                startedAt: proc.startedAt,
            });
        }
        return processes;
    }

    // ── Security ──────────────────────────────────────────────

    _validateCommand(command) {
        const cmd = command.trim();
        const cmdLower = cmd.toLowerCase();

        // ── Allowlist: only known-safe command prefixes may execute ───────────
        // Extract the base command name (first word, stripping any path prefix).
        const baseCmd = cmd.split(/\s+/)[0].replace(/^.*[/\\]/, '');
        if (!this._allowedPrefixes.has(baseCmd)) {
            throw new Error(`Command "${baseCmd}" is not in the allowed command list. Add it via config.extraAllowlist if intentional.`);
        }

        // ── Hard blocklist: patterns that are never safe regardless of context ──
        for (const blocked of this._blockedCommands) {
            if (cmdLower.includes(blocked.toLowerCase())) {
                throw new Error(`Blocked command: "${blocked}" is not allowed for security reasons`);
            }
        }

        // ── Privilege escalation ───────────────────────────────────────────────
        if (cmdLower.startsWith('sudo ') || cmdLower.startsWith('doas ') || /\bsudo\b/.test(cmdLower)) {
            throw new Error('Administrative commands (sudo/doas) are not allowed.');
        }

        // ── Shell metacharacter injection ──────────────────────────────────────
        // Backtick substitution and $() can bypass any string-matching blocklist.
        if (/`/.test(cmd) || /\$\(/.test(cmd)) {
            throw new Error('Command substitution (backticks / $()) is not allowed in shell commands.');
        }

        // ── Process substitution ───────────────────────────────────────────────
        if (/<\(|>\(/.test(cmd)) {
            throw new Error('Process substitution is not allowed in shell commands.');
        }

        // ── Encoded / obfuscated commands ─────────────────────────────────────
        if (/\bbase64\s+-d\b/.test(cmdLower) || /\beval\b/.test(cmdLower)) {
            throw new Error('Encoded or eval-based command execution is not allowed.');
        }

        // ── Dangerous /dev/ writes (allow 2>/dev/null only) ───────────────────
        if (/>\s*\/dev\/(?!null)/.test(cmd)) {
            throw new Error('Writes to /dev/ (other than /dev/null) are not allowed.');
        }

        // ── Hard length cap — prevents argument-stuffing attacks ──────────────
        if (cmd.length > 2000) {
            throw new Error('Command exceeds maximum allowed length (2000 characters).');
        }
    }
}

module.exports = { ShellTool };
module.exports.default = ShellTool;
