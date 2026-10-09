/**
 * DockerSandbox.js — Docker-based Secure Sandbox
 * 
 * Executes code in isolated Docker containers:
 * - CPU/RAM limits
 * - Network isolation
 * - Read-only filesystem (optional)
 * - Timeout enforcement
 * - Automatic cleanup
 * 
 * License: Apache-2.0 (dockerode)
 * RAM: ~50MB
 */

const Docker = require('dockerode');
const path = require('path');
const fs = require('fs');
const os = require('os');

const logger = {
    debug: (...args) => console.log('[DockerSandbox]', ...args),
    info: (...args) => console.info('[DockerSandbox]', ...args),
    warn: (...args) => console.warn('[DockerSandbox]', ...args),
    error: (...args) => console.error('[DockerSandbox]', ...args),
};

class DockerSandbox {
    constructor(config = {}) {
        this._name = 'DockerSandbox';
        this._docker = null;
        this._available = false;
        this._config = {
            image: config.image || 'node:20-alpine',
            timeout: config.timeout || 30000,
            memoryLimit: config.memoryLimit || '256m',
            cpuQuota: config.cpuQuota || 50000, // 50% CPU
            networkMode: config.networkMode || 'none', // No network by default
            readOnlyRoot: config.readOnlyRoot || false,
            workingDir: config.workingDir || '/workspace',
            ...config,
        };
        this._activeContainers = new Map();
        this._init();
    }

    async _init() {
        try {
            this._docker = new Docker({ socketPath: '/var/run/docker.sock' });
            await this._docker.ping();
            this._available = true;
            logger.info('[DockerSandbox] Docker available');
        } catch (e) {
            // Try Windows named pipe
            try {
                this._docker = new Docker({ socketPath: '//./pipe/docker_engine' });
                await this._docker.ping();
                this._available = true;
                logger.info('[DockerSandbox] Docker available (Windows)');
            } catch (e2) {
                this._available = false;
                logger.warn('[DockerSandbox] Docker not available, using fallback');
            }
        }
    }

    isAvailable() { return this._available; }

    /**
     * Execute code in a Docker container.
     */
    async execute(language, code, options = {}) {
        if (!this._available) {
            throw new Error('Docker not available. Install Docker or use vm2 fallback.');
        }

        const timeout = options.timeout || this._config.timeout;
        const containerId = `sandbox_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        logger.info(`[DockerSandbox] Executing ${language} in container ${containerId}`);

        // Create temp script file
        const tmpDir = os.tmpdir();
        const scriptFile = path.join(tmpDir, `${containerId}.${this._getExtension(language)}`);
        fs.writeFileSync(scriptFile, code);

        try {
            // Create and start container
            const container = await this._docker.createContainer({
                Image: this._config.image,
                Cmd: this._getCommand(language, `/workspace/${path.basename(scriptFile)}`),
                WorkingDir: this._config.workingDir,
                HostConfig: {
                    Binds: [`${tmpDir}:/workspace:ro`],
                    Memory: parseInt(this._config.memoryLimit) * 1024 * 1024 || 256 * 1024 * 1024,
                    CpuQuota: this._config.cpuQuota,
                    NetworkMode: this._config.networkMode,
                    ReadonlyRootfs: this._config.readOnlyRoot,
                    AutoRemove: true,
                },
                Tty: false,
                Env: ['FORCE_COLOR=0'],
            });

            this._activeContainers.set(containerId, { container, startedAt: Date.now() });

            // Start container
            await container.start();

            // Wait with timeout
            const result = await this._waitForContainer(container, timeout);

            return {
                success: result.exitCode === 0,
                output: result.output,
                exitCode: result.exitCode,
                containerId,
                duration: Date.now() - this._activeContainers.get(containerId)?.startedAt || 0,
            };

        } catch (error) {
            return {
                success: false,
                output: error.message,
                exitCode: 1,
                containerId,
            };
        } finally {
            this._activeContainers.delete(containerId);
            try { fs.unlinkSync(scriptFile); } catch {}
        }
    }

    /**
     * Execute a bash command in a container.
     */
    async execCommand(command, options = {}) {
        if (!this._available) {
            throw new Error('Docker not available');
        }

        const container = await this._docker.createContainer({
            Image: this._config.image,
            Cmd: ['sh', '-c', command],
            HostConfig: {
                Memory: parseInt(this._config.memoryLimit) * 1024 * 1024 || 256 * 1024 * 1024,
                NetworkMode: this._config.networkMode,
                AutoRemove: true,
            },
        });

        await container.start();
        const result = await this._waitForContainer(container, options.timeout || this._config.timeout);
        return result;
    }

    /**
     * List running sandbox containers.
     */
    async listContainers() {
        if (!this._available) return [];
        try {
            const containers = await this._docker.listContainers({ filters: { label: ['sandbox=true'] } });
            return containers.map(c => ({
                id: c.Id.substring(0, 12),
                image: c.Image,
                status: c.Status,
                created: c.Created,
            }));
        } catch (e) {
            return [];
        }
    }

    /**
     * Clean up all sandbox containers.
     */
    async cleanup() {
        for (const [id, info] of this._activeContainers) {
            try {
                await info.container.kill();
            } catch {}
        }
        this._activeContainers.clear();
    }

    // ── Internal ──────────────────────────────────────────────

    async _waitForContainer(container, timeout) {
        return new Promise((resolve) => {
            const timer = setTimeout(async () => {
                try { await container.kill(); } catch {}
                resolve({ exitCode: -1, output: `Timeout after ${timeout}ms` });
            }, timeout);

            container.wait(async (err, data) => {
                clearTimeout(timer);
                try {
                    const logs = await container.logs({ stdout: true, stderr: true, follow: false });
                    resolve({
                        exitCode: data?.StatusCode || 0,
                        output: logs?.toString() || '',
                    });
                } catch (e) {
                    resolve({ exitCode: data?.StatusCode || 0, output: '' });
                }
            });
        });
    }

    _getExtension(language) {
        const exts = { javascript: 'js', python: 'py', bash: 'sh', typescript: 'ts' };
        return exts[language] || 'txt';
    }

    _getCommand(language, scriptPath) {
        switch (language) {
            case 'javascript': return ['node', scriptPath];
            case 'python': return ['python3', scriptPath];
            case 'bash': return ['sh', scriptPath];
            case 'typescript': return ['npx', 'ts-node', scriptPath];
            default: return ['sh', scriptPath];
        }
    }
}

module.exports = { DockerSandbox };
module.exports.default = DockerSandbox;
