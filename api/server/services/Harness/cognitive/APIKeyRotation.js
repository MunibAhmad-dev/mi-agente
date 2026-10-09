/**
 * APIKeyRotation.js — API Key Rotation & Management
 * 
 * Manages multiple API keys per provider:
 * - Register multiple keys per provider
 * - Automatic rotation on failure/quota
 * - Usage tracking per key
 * - Priority-based selection
 * - Expiration handling
 * 
 * License: MIT
 * RAM: ~2MB
 */

const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[APIKeyRotation]', ...args),
    info: (...args) => console.info('[APIKeyRotation]', ...args),
    warn: (...args) => console.warn('[APIKeyRotation]', ...args),
    error: (...args) => console.error('[APIKeyRotation]', ...args),
};

class APIKeyRotation extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'APIKeyRotation';
        this._providers = new Map(); // provider -> [keys]
        this._currentIndices = new Map(); // provider -> currentIndex
        this._rotationStrategy = config.rotationStrategy || 'round-robin'; // round-robin, least-used, priority
    }

    /**
     * Register a provider with multiple API keys.
     */
    registerProvider(provider, keys) {
        if (!Array.isArray(keys)) keys = [keys];

        const keyEntries = keys.map((key, index) => ({
            key: typeof key === 'string' ? key : key.key,
            priority: typeof key === 'object' ? key.priority || index : index,
            quota: typeof key === 'object' ? key.quota || null : null,
            usage: 0,
            failures: 0,
            lastUsed: null,
            lastError: null,
            active: true,
            expiresAt: typeof key === 'object' ? key.expiresAt || null : null,
        }));

        // Sort by priority
        keyEntries.sort((a, b) => a.priority - b.priority);

        this._providers.set(provider, keyEntries);
        this._currentIndices.set(provider, 0);

        logger.info(`[APIKeyRotation] Registered ${provider} with ${keyEntries.length} keys`);
        return { success: true, provider, keyCount: keyEntries.length };
    }

    /**
     * Get the next API key for a provider.
     */
    getNextKey(provider) {
        const keys = this._providers.get(provider);
        if (!keys || keys.length === 0) {
            throw new Error(`No keys registered for provider: ${provider}`);
        }

        // Filter active, non-expired keys
        const availableKeys = keys.filter(k => {
            if (!k.active) return false;
            if (k.expiresAt && Date.now() > k.expiresAt) return false;
            if (k.quota && k.usage >= k.quota) return false;
            return true;
        });

        if (availableKeys.length === 0) {
            throw new Error(`No available keys for provider: ${provider}`);
        }

        let selectedKey;

        switch (this._rotationStrategy) {
            case 'round-robin':
                selectedKey = this._roundRobin(provider, availableKeys);
                break;
            case 'least-used':
                selectedKey = this._leastUsed(availableKeys);
                break;
            case 'priority':
                selectedKey = this._priority(availableKeys);
                break;
            default:
                selectedKey = this._roundRobin(provider, availableKeys);
        }

        selectedKey.usage++;
        selectedKey.lastUsed = Date.now();

        return selectedKey.key;
    }

    /**
     * Record a successful call.
     */
    recordSuccess(provider, key) {
        const keys = this._providers.get(provider);
        if (!keys) return;

        const keyEntry = keys.find(k => k.key === key);
        if (keyEntry) {
            keyEntry.lastUsed = Date.now();
        }
    }

    /**
     * Record a failed call.
     */
    recordFailure(provider, key, error) {
        const keys = this._providers.get(provider);
        if (!keys) return;

        const keyEntry = keys.find(k => k.key === key);
        if (keyEntry) {
            keyEntry.failures++;
            keyEntry.lastError = error;
            keyEntry.lastUsed = Date.now();

            // Auto-rotate on consecutive failures
            if (keyEntry.failures >= 3) {
                keyEntry.active = false;
                logger.warn(`[APIKeyRotation] Key disabled for ${provider}: ${keyEntry.failures} failures`);
                this.emit('keyDisabled', { provider, key: keyEntry.key.substring(0, 10) + '...' });
            }
        }
    }

    /**
     * Disable a specific key.
     */
    disableKey(provider, keyIndex) {
        const keys = this._providers.get(provider);
        if (!keys || !keys[keyIndex]) return false;

        keys[keyIndex].active = false;
        logger.info(`[APIKeyRotation] Disabled key ${keyIndex} for ${provider}`);
        return true;
    }

    /**
     * Re-enable a specific key.
     */
    enableKey(provider, keyIndex) {
        const keys = this._providers.get(provider);
        if (!keys || !keys[keyIndex]) return false;

        keys[keyIndex].active = true;
        keys[keyIndex].failures = 0;
        logger.info(`[APIKeyRotation] Enabled key ${keyIndex} for ${provider}`);
        return true;
    }

    /**
     * Get usage stats for a provider.
     */
    getStats(provider) {
        const keys = this._providers.get(provider);
        if (!keys) return null;

        return {
            provider,
            totalKeys: keys.length,
            activeKeys: keys.filter(k => k.active).length,
            totalUsage: keys.reduce((sum, k) => sum + k.usage, 0),
            totalFailures: keys.reduce((sum, k) => sum + k.failures, 0),
            keys: keys.map((k, i) => ({
                index: i,
                active: k.active,
                usage: k.usage,
                failures: k.failures,
                lastUsed: k.lastUsed,
                quota: k.quota,
                remaining: k.quota ? k.quota - k.usage : null,
            })),
        };
    }

    /**
     * Get all providers status.
     */
    getAllStats() {
        const stats = {};
        for (const [provider] of this._providers) {
            stats[provider] = this.getStats(provider);
        }
        return stats;
    }

    // ── Internal ──────────────────────────────────────────────

    _roundRobin(provider, availableKeys) {
        const keys = this._providers.get(provider);
        let index = this._currentIndices.get(provider) || 0;

        // Find the next available key
        for (let i = 0; i < keys.length; i++) {
            const checkIndex = (index + i) % keys.length;
            if (availableKeys.includes(keys[checkIndex])) {
                this._currentIndices.set(provider, (checkIndex + 1) % keys.length);
                return keys[checkIndex];
            }
        }

        return availableKeys[0];
    }

    _leastUsed(availableKeys) {
        return availableKeys.reduce((least, current) =>
            current.usage < least.usage ? current : least
        );
    }

    _priority(availableKeys) {
        return availableKeys[0]; // Already sorted by priority
    }
}

module.exports = { APIKeyRotation };
module.exports.default = APIKeyRotation;
