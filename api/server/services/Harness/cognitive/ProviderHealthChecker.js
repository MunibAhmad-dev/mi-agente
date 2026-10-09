/**
 * ProviderHealthChecker.js — LLM Provider Health Monitoring
 * 
 * Monitors provider health:
 * - Periodic health checks
 * - Latency tracking
 * - Error rate tracking
 * - Auto-fallback on failure
 * - Status reporting
 * 
 * License: MIT
 * RAM: ~2MB
 */

const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[ProviderHealthChecker]', ...args),
    info: (...args) => console.info('[ProviderHealthChecker]', ...args),
    warn: (...args) => console.warn('[ProviderHealthChecker]', ...args),
    error: (...args) => console.error('[ProviderHealthChecker]', ...args),
};

const HealthStatus = {
    HEALTHY: 'healthy',
    DEGRADED: 'degraded',
    UNHEALTHY: 'unhealthy',
    UNKNOWN: 'unknown',
};

class ProviderHealthChecker extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'ProviderHealthChecker';
        this._checkInterval = config.checkInterval || 60000; // 1 minute
        this._providers = new Map(); // name -> health info
        this._checkTimer = null;
        this._maxFailures = config.maxFailures || 3;
        this._recoveryTimeout = config.recoveryTimeout || 300000; // 5 min
    }

    /**
     * Register a provider for health checking.
     */
    registerProvider(name, config = {}) {
        this._providers.set(name, {
            name,
            status: HealthStatus.UNKNOWN,
            lastCheck: null,
            lastError: null,
            consecutiveFailures: 0,
            totalChecks: 0,
            totalFailures: 0,
            avgLatency: 0,
            latencies: [],
            config: {
                healthCheckFn: config.healthCheckFn || null,
                timeout: config.timeout || 10000,
                priority: config.priority || 0,
            },
        });

        logger.info(`[ProviderHealthChecker] Registered provider: ${name}`);
        return { success: true, name };
    }

    /**
     * Start periodic health checks.
     */
    start() {
        if (this._checkTimer) return;

        this._checkTimer = setInterval(() => {
            this._checkAllProviders();
        }, this._checkInterval);

        // Initial check
        this._checkAllProviders();

        logger.info(`[ProviderHealthChecker] Started (interval: ${this._checkInterval}ms)`);
    }

    /**
     * Stop health checks.
     */
    stop() {
        if (this._checkTimer) {
            clearInterval(this._checkTimer);
            this._checkTimer = null;
        }
        logger.info('[ProviderHealthChecker] Stopped');
    }

    /**
     * Check a specific provider.
     */
    async checkProvider(name) {
        const provider = this._providers.get(name);
        if (!provider) {
            throw new Error(`Provider not registered: ${name}`);
        }

        provider.totalChecks++;
        const startTime = Date.now();

        try {
            if (provider.config.healthCheckFn) {
                await Promise.race([
                    provider.config.healthCheckFn(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Health check timeout')), provider.config.timeout)),
                ]);
            }

            const latency = Date.now() - startTime;
            provider.latencies.push(latency);
            if (provider.latencies.length > 100) provider.latencies.shift();
            provider.avgLatency = provider.latencies.reduce((a, b) => a + b, 0) / provider.latencies.length;

            provider.status = HealthStatus.HEALTHY;
            provider.consecutiveFailures = 0;
            provider.lastCheck = Date.now();
            provider.lastError = null;

            this.emit('providerHealthy', { name, latency });
            return { status: HealthStatus.HEALTHY, latency };
        } catch (err) {
            provider.consecutiveFailures++;
            provider.totalFailures++;
            provider.lastCheck = Date.now();
            provider.lastError = err.message;

            if (provider.consecutiveFailures >= this._maxFailures) {
                provider.status = HealthStatus.UNHEALTHY;
                logger.warn(`[ProviderHealthChecker] ${name} UNHEALTHY (${provider.consecutiveFailures} consecutive failures)`);
                this.emit('providerUnhealthy', { name, error: err.message, failures: provider.consecutiveFailures });
            } else {
                provider.status = HealthStatus.DEGRADED;
                logger.warn(`[ProviderHealthChecker] ${name} DEGRADED (${err.message})`);
                this.emit('providerDegraded', { name, error: err.message });
            }

            return { status: provider.status, error: err.message };
        }
    }

    /**
     * Get health status of all providers.
     */
    getAllStatus() {
        const statuses = {};
        for (const [name, provider] of this._providers) {
            statuses[name] = {
                status: provider.status,
                lastCheck: provider.lastCheck,
                avgLatency: Math.round(provider.avgLatency),
                consecutiveFailures: provider.consecutiveFailures,
                totalChecks: provider.totalChecks,
                totalFailures: provider.totalFailures,
                errorRate: provider.totalChecks > 0
                    ? Math.round((provider.totalFailures / provider.totalChecks) * 100)
                    : 0,
            };
        }
        return statuses;
    }

    /**
     * Get the best available provider.
     */
    getBestProvider(preferredOrder = []) {
        // Try preferred order first
        for (const name of preferredOrder) {
            const provider = this._providers.get(name);
            if (provider && provider.status === HealthStatus.HEALTHY) {
                return name;
            }
        }

        // Fallback to any healthy provider
        for (const [name, provider] of this._providers) {
            if (provider.status === HealthStatus.HEALTHY) {
                return name;
            }
        }

        // Fallback to degraded
        for (const [name, provider] of this._providers) {
            if (provider.status === HealthStatus.DEGRADED) {
                return name;
            }
        }

        return null;
    }

    /**
     * Check if a provider is available.
     */
    isAvailable(name) {
        const provider = this._providers.get(name);
        return provider && (provider.status === HealthStatus.HEALTHY || provider.status === HealthStatus.DEGRADED);
    }

    /**
     * Record a successful call (external).
     */
    recordSuccess(name, latency) {
        const provider = this._providers.get(name);
        if (provider) {
            provider.latencies.push(latency);
            if (provider.latencies.length > 100) provider.latencies.shift();
            provider.avgLatency = provider.latencies.reduce((a, b) => a + b, 0) / provider.latencies.length;
        }
    }

    /**
     * Record a failed call (external).
     */
    recordFailure(name, error) {
        const provider = this._providers.get(name);
        if (provider) {
            provider.consecutiveFailures++;
            provider.totalFailures++;
            provider.lastError = error;

            if (provider.consecutiveFailures >= this._maxFailures) {
                provider.status = HealthStatus.UNHEALTHY;
                this.emit('providerUnhealthy', { name, error, failures: provider.consecutiveFailures });
            }
        }
    }

    // ── Internal ──────────────────────────────────────────────

    async _checkAllProviders() {
        const checks = [];
        for (const [name] of this._providers) {
            checks.push(this.checkProvider(name).catch(() => {}));
        }
        await Promise.allSettled(checks);
    }
}

module.exports = { ProviderHealthChecker, HealthStatus };
module.exports.default = ProviderHealthChecker;
