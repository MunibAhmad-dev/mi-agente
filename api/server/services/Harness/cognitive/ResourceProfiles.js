/**
 * ResourceProfiles.js — Resource-Based Configuration Profiles
 * 
 * Configures system behavior based on available hardware:
 * - Profile A: Ultra Low Resource (2GB RAM, no GPU)
 * - Profile B: Balanced (4GB RAM, optional GPU)
 * - Profile C: Maximum Local (8GB+ RAM, GPU)
 * 
 * Auto-detects hardware and applies appropriate settings.
 */

const os = require('os');

const logger = {
    debug: (...args) => console.log('[ResourceProfiles]', ...args),
    info: (...args) => console.info('[ResourceProfiles]', ...args),
    warn: (...args) => console.warn('[ResourceProfiles]', ...args),
    error: (...args) => console.error('[ResourceProfiles]', ...args),
};

const PROFILES = {
    ULTRA_LOW: {
        name: 'Ultra Low Resource',
        description: 'Minimal resource usage. Local small models only.',
        maxMemoryMB: 2048,
        maxConcurrentAgents: 1,
        maxConcurrentTools: 1,
        contextWindow: 4096,
        enableCaching: true,
        enableCompaction: true,
        enableRepositoryMap: false,
        enableSubAgents: false,
        enableParallelExecution: false,
        modelTier: 'local',
        preferredModels: ['qwen2.5:1.5b', 'phi3:mini', 'tinyllama'],
        enableBrowser: false,
        enableCodeExecution: false,
        enableComputerUse: false,
        sandboxType: 'none',
    },
    BALANCED: {
        name: 'Balanced',
        description: 'Balanced performance and resource usage.',
        maxMemoryMB: 4096,
        maxConcurrentAgents: 3,
        maxConcurrentTools: 3,
        contextWindow: 16384,
        enableCaching: true,
        enableCompaction: true,
        enableRepositoryMap: true,
        enableSubAgents: true,
        enableParallelExecution: false,
        modelTier: 'mixed',
        preferredModels: ['gpt-4o-mini', 'claude-3-haiku', 'llama3.2:3b'],
        enableBrowser: true,
        enableCodeExecution: true,
        enableComputerUse: false,
        sandboxType: 'vm2',
    },
    MAXIMUM: {
        name: 'Maximum Local',
        description: 'Maximum performance with local models and full features.',
        maxMemoryMB: 8192,
        maxConcurrentAgents: 5,
        maxConcurrentTools: 5,
        contextWindow: 128000,
        enableCaching: true,
        enableCompaction: true,
        enableRepositoryMap: true,
        enableSubAgents: true,
        enableParallelExecution: true,
        modelTier: 'large',
        preferredModels: ['gpt-4o', 'claude-3.5-sonnet', 'llama3.1:8b'],
        enableBrowser: true,
        enableCodeExecution: true,
        enableComputerUse: true,
        sandboxType: 'docker',
    },
};

class ResourceProfiles {
    constructor(config = {}) {
        this._name = 'ResourceProfiles';
        this._currentProfile = null;
        this._autoDetect = config.autoDetect !== false;
    }

    /**
     * Auto-detect hardware and select the best profile.
     */
    autoDetectProfile() {
        const totalRAM = os.totalmem();
        const freeRAM = os.freemem();
        const cpus = os.cpus().length;
        const platform = os.platform();

        logger.info(`[ResourceProfiles] Hardware: ${Math.round(totalRAM / 1024 / 1024)}MB RAM, ${cpus} CPUs, ${platform}`);

        let profile;

        if (totalRAM < 3 * 1024 * 1024 * 1024) {
            // Less than 3GB RAM
            profile = 'ULTRA_LOW';
        } else if (totalRAM < 6 * 1024 * 1024 * 1024) {
            // 3-6GB RAM
            profile = 'BALANCED';
        } else {
            // 6GB+ RAM
            profile = 'MAXIMUM';
        }

        this._currentProfile = PROFILES[profile];
        logger.info(`[ResourceProfiles] Selected profile: ${profile} (${this._currentProfile.name})`);

        return this._currentProfile;
    }

    /**
     * Set a specific profile.
     */
    setProfile(profileName) {
        const key = profileName.toUpperCase().replace(/\s+/g, '_');
        if (!PROFILES[key]) {
            throw new Error(`Unknown profile: ${profileName}. Available: ${Object.keys(PROFILES).join(', ')}`);
        }
        this._currentProfile = PROFILES[key];
        logger.info(`[ResourceProfiles] Set profile: ${key}`);
        return this._currentProfile;
    }

    /**
     * Get current profile.
     */
    getProfile() {
        if (!this._currentProfile) {
            if (this._autoDetect) {
                return this.autoDetectProfile();
            }
            return PROFILES.BALANCED;
        }
        return this._currentProfile;
    }

    /**
     * Get all available profiles.
     */
    listProfiles() {
        return Object.entries(PROFILES).map(([key, profile]) => ({
            key,
            name: profile.name,
            description: profile.description,
            maxMemoryMB: profile.maxMemoryMB,
        }));
    }

    /**
     * Get hardware info.
     */
    getHardwareInfo() {
        return {
            totalRAM: Math.round(os.totalmem() / 1024 / 1024),
            freeRAM: Math.round(os.freemem() / 1024 / 1024),
            cpus: os.cpus().length,
            platform: os.platform(),
            arch: os.arch(),
        };
    }

    /**
     * Check if a feature is enabled in current profile.
     */
    isFeatureEnabled(feature) {
        const profile = this.getProfile();
        return profile[feature] || false;
    }
}

module.exports = { ResourceProfiles, PROFILES };
module.exports.default = ResourceProfiles;
