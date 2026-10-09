/**
 * AutoLauncher.js — Automatic Service Launcher
 * 
 * Automatically starts and manages all subsystems when the Agent Loop initializes:
 * - Ollama (local LLM inference)
 * - MongoDB (memory persistence)
 * - Redis (caching)
 * - Docker sandbox
 * - MCP servers
 * - Browser (Playwright)
 * - WebLLM check
 * - Vision models
 */

const { EventEmitter } = require('events');
const { execSync, spawn } = require('child_process');
const http = require('http');

const logger = {
    debug: (...args) => console.log('[AutoLauncher]', ...args),
    info: (...args) => console.info('[AutoLauncher]', ...args),
    warn: (...args) => console.warn('[AutoLauncher]', ...args),
    error: (...args) => console.error('[AutoLauncher]', ...args),
};

/**
 * Service definitions
 */
const SERVICES = {
    ollama: {
        name: 'Ollama',
        description: 'Local LLM inference engine',
        checkUrl: 'http://localhost:11434/api/tags',
        startCommand: 'ollama serve',
        priority: 1,
        required: true,
    },
    mongodb: {
        name: 'MongoDB',
        description: 'Document database for memory persistence',
        checkUrl: null,
        checkCommand: 'mongosh --eval "db.adminCommand({ping:1})" --quiet',
        startCommand: 'mongod --dbpath ./data/db',
        priority: 2,
        required: false,
    },
    redis: {
        name: 'Redis',
        description: 'In-memory cache for prompt/response caching',
        checkUrl: null,
        checkCommand: 'redis-cli ping',
        startCommand: 'redis-server',
        priority: 3,
        required: false,
    },
    docker: {
        name: 'Docker',
        description: 'Container sandbox for code execution',
        checkUrl: null,
        checkCommand: 'docker info',
        startCommand: null, // Docker Desktop must be started manually
        priority: 4,
        required: false,
    },
    playwright: {
        name: 'Playwright',
        description: 'Browser automation for web tasks',
        checkUrl: null,
        checkCommand: 'npx playwright --version',
        startCommand: null, // Installed as npm package
        priority: 5,
        required: false,
    },
};

class AutoLauncher extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'AutoLauncher';
        this._serviceStates = {};
        this._autoStart = config.autoStart !== false;
        this._timeout = config.timeout || 10000;
        this._services = { ...SERVICES, ...(config.services || {}) };
    }

    /**
     * Check if a URL is reachable
     */
    _checkUrl(url, timeout = 5000) {
        return new Promise((resolve) => {
            const req = http.get(url, { timeout }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ up: true, status: res.statusCode, data }));
            });
            req.on('error', () => resolve({ up: false }));
            req.on('timeout', () => { req.destroy(); resolve({ up: false }); });
        });
    }

    /**
     * Check if a command is available
     */
    _checkCommand(cmd, timeout = 5000) {
        try {
            execSync(cmd, { stdio: 'pipe', timeout });
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Check status of all services
     */
    async checkAll() {
        const results = {};
        
        for (const [id, service] of Object.entries(this._services)) {
            const state = { name: service.name, up: false, details: '' };
            
            try {
                if (service.checkUrl) {
                    const check = await this._checkUrl(service.checkUrl);
                    state.up = check.up;
                    state.details = check.up ? `OK (HTTP ${check.status})` : 'Not reachable';
                } else if (service.checkCommand) {
                    state.up = this._checkCommand(service.checkCommand);
                    state.details = state.up ? 'OK' : 'Command failed or not installed';
                } else {
                    state.details = 'No health check defined';
                }
            } catch (e) {
                state.details = `Check error: ${e.message}`;
            }
            
            this._serviceStates[id] = { ...state, ...service };
            results[id] = state;
        }
        
        return results;
    }

    /**
     * Try to start a specific service
     */
    async startService(serviceId) {
        const service = this._services[serviceId];
        if (!service) throw new Error(`Unknown service: ${serviceId}`);
        
        if (!service.startCommand) {
            return { success: false, message: `${service.name} requires manual start or is a package dependency` };
        }
        
        logger.info(`[AutoLauncher] Starting ${service.name}...`);
        this.emit('service_starting', { id: serviceId, name: service.name });
        
        try {
            // Check if already running
            const check = service.checkUrl ? await this._checkUrl(service.checkUrl) : { up: this._checkCommand(service.checkCommand) };
            if (check.up) {
                return { success: true, message: `${service.name} is already running` };
            }
            
            // Try to start
            const proc = spawn(service.startCommand.split(' ')[0], service.startCommand.split(' ').slice(1), {
                detached: true,
                stdio: 'ignore',
                shell: process.platform === 'win32',
            });
            proc.unref();
            
            // Wait and check
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const recheck = service.checkUrl ? await this._checkUrl(service.checkUrl) : { up: this._checkCommand(service.checkCommand) };
            
            if (recheck.up) {
                this.emit('service_started', { id: serviceId, name: service.name });
                return { success: true, message: `${service.name} started successfully` };
            } else {
                return { success: false, message: `${service.name} start attempted but not confirmed running` };
            }
        } catch (e) {
            return { success: false, message: `Failed to start ${service.name}: ${e.message}` };
        }
    }

    /**
     * Auto-start all required and available services
     */
    async autoStartAll() {
        const results = {};
        const sorted = Object.entries(this._services)
            .sort((a, b) => (a[1].priority || 99) - (b[1].priority || 99));
        
        for (const [id, service] of sorted) {
            const state = this._serviceStates[id] || {};
            
            // Skip if already running
            if (state.up) {
                results[id] = { action: 'skip', message: `${service.name} already running` };
                continue;
            }
            
            // Start if required or if we have a start command
            if (service.required || service.startCommand) {
                results[id] = await this.startService(id);
            } else {
                results[id] = { action: 'skip', message: `${service.name} optional, not started` };
            }
        }
        
        this.emit('auto_start_complete', results);
        return results;
    }

    /**
     * Get full launcher status
     */
    getStatus() {
        return {
            services: { ...this._serviceStates },
            serviceCount: Object.keys(this._services).length,
            runningCount: Object.values(this._serviceStates).filter(s => s.up).length,
        };
    }

    /**
     * Add a custom service to monitor
     */
    addService(id, config) {
        this._services[id] = {
            name: config.name || id,
            description: config.description || '',
            checkUrl: config.checkUrl || null,
            checkCommand: config.checkCommand || null,
            startCommand: config.startCommand || null,
            priority: config.priority || 50,
            required: config.required || false,
        };
    }

    /**
     * Get API routes
     */
    getRoutes() {
        return [
            { method: 'GET', path: '/api/launcher/status', description: 'All service statuses' },
            { method: 'POST', path: '/api/launcher/start/:id', description: 'Start a specific service' },
            { method: 'POST', path: '/api/launcher/auto-start', description: 'Auto-start all services' },
            { method: 'GET', path: '/api/launcher/check', description: 'Check all services' },
        ];
    }
}

module.exports = { AutoLauncher, SERVICES };
module.exports.default = AutoLauncher;
