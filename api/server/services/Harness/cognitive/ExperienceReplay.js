/**
 * ExperienceReplay.js — Experience Replay System
 * 
 * Stores and replays past experiences to verify learning:
 * - Store task + result pairs
 * - Replay with current strategy
 * - Compare old vs new results
 * - Measure improvement
 * 
 * License: Custom (MIT)
 * RAM: ~5MB
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[ExperienceReplay]', ...args),
    info: (...args) => console.info('[ExperienceReplay]', ...args),
    warn: (...args) => console.warn('[ExperienceReplay]', ...args),
    error: (...args) => console.error('[ExperienceReplay]', ...args),
};

class ExperienceReplay extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'ExperienceReplay';
        this._storageDir = config.storageDir || path.join(process.cwd(), 'data', 'experiences');
        this._experiences = new Map();
        this._maxExperiences = config.maxExperiences || 1000;
        this._loadExperiences();
    }

    /**
     * Store an experience.
     */
    store(experience) {
        const id = experience.id || `exp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        const entry = {
            id,
            task: experience.task,
            result: experience.result,
            success: experience.success,
            strategy: experience.strategy || 'default',
            tools: experience.tools || [],
            duration: experience.duration || 0,
            tokens: experience.tokens || 0,
            errors: experience.errors || [],
            timestamp: Date.now(),
            replays: [],
        };

        this._experiences.set(id, entry);
        this._saveExperiences();

        logger.info(`[ExperienceReplay] Stored experience: ${id}`);
        this.emit('stored', { id, task: experience.task });

        return { success: true, id };
    }

    /**
     * Replay an experience with a new strategy.
     */
    async replay(experienceId, newStrategy) {
        const experience = this._experiences.get(experienceId);
        if (!experience) {
            throw new Error(`Experience not found: ${experienceId}`);
        }

        const replayStart = Date.now();

        // Record the replay attempt
        const replay = {
            timestamp: Date.now(),
            oldStrategy: experience.strategy,
            newStrategy: newStrategy || 'same',
            oldResult: experience.result,
            oldSuccess: experience.success,
        };

        experience.replays.push(replay);
        this._saveExperiences();

        logger.info(`[ExperienceReplay] Replaying experience: ${experienceId}`);

        return {
            experience,
            replay,
            message: `Replaying task: "${experience.task.substring(0, 100)}..."`,
        };
    }

    /**
     * Compare old vs new results.
     */
    compare(experienceId, newResult) {
        const experience = this._experiences.get(experienceId);
        if (!experience) {
            throw new Error(`Experience not found: ${experienceId}`);
        }

        const comparison = {
            oldSuccess: experience.success,
            newSuccess: newResult.success,
            improved: newResult.success && !experience.success,
            same: newResult.success === experience.success,
            oldDuration: experience.duration,
            newDuration: newResult.duration || 0,
            durationImproved: (newResult.duration || 0) < experience.duration,
            oldTokens: experience.tokens,
            newTokens: newResult.tokens || 0,
            tokensImproved: (newResult.tokens || 0) < experience.tokens,
        };

        // Update experience with new result
        experience.replays.push({
            timestamp: Date.now(),
            newResult,
            comparison,
        });

        this._saveExperiences();

        logger.info(`[ExperienceReplay] Comparison: ${comparison.improved ? 'IMPROVED' : comparison.same ? 'SAME' : 'REGRESSED'}`);

        return comparison;
    }

    /**
     * Get all experiences.
     */
    getAll(filter = {}) {
        let experiences = [...this._experiences.values()];

        if (filter.success !== undefined) {
            experiences = experiences.filter(e => e.success === filter.success);
        }
        if (filter.task) {
            experiences = experiences.filter(e => e.task.includes(filter.task));
        }
        if (filter.since) {
            experiences = experiences.filter(e => e.timestamp > filter.since);
        }

        return experiences.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get improvement statistics.
     */
    getImprovementStats() {
        const experiences = [...this._experiences.values()];
        const withReplays = experiences.filter(e => e.replays.length > 0);

        let improved = 0;
        let regressed = 0;
        let same = 0;

        for (const exp of withReplays) {
            const lastReplay = exp.replays[exp.replays.length - 1];
            if (lastReplay.comparison) {
                if (lastReplay.comparison.improved) improved++;
                else if (lastReplay.comparison.same) same++;
                else regressed++;
            }
        }

        return {
            totalExperiences: experiences.length,
            withReplays: withReplays.length,
            improved,
            same,
            regressed,
            improvementRate: withReplays.length > 0 ? (improved / withReplays.length * 100).toFixed(1) + '%' : '0%',
        };
    }

    /**
     * Get most replayed experiences.
     */
    getMostReplayed(limit = 10) {
        return [...this._experiences.values()]
            .sort((a, b) => b.replays.length - a.replays.length)
            .slice(0, limit)
            .map(e => ({
                id: e.id,
                task: e.task.substring(0, 100),
                replays: e.replays.length,
                success: e.success,
            }));
    }

    /**
     * Get failed experiences that need attention.
     */
    getFailedExperiences() {
        return [...this._experiences.values()]
            .filter(e => !e.success)
            .sort((a, b) => b.timestamp - a.timestamp)
            .map(e => ({
                id: e.id,
                task: e.task.substring(0, 100),
                errors: e.errors,
                timestamp: e.timestamp,
            }));
    }

    // ── Internal ──────────────────────────────────────────────

    _loadExperiences() {
        try {
            if (!fs.existsSync(this._storageDir)) {
                fs.mkdirSync(this._storageDir, { recursive: true });
            }
            const file = path.join(this._storageDir, 'experiences.json');
            if (fs.existsSync(file)) {
                const data = JSON.parse(fs.readFileSync(file, 'utf8'));
                for (const [id, exp] of Object.entries(data)) {
                    this._experiences.set(id, exp);
                }
            }
        } catch (e) {
            logger.warn(`[ExperienceReplay] Failed to load experiences: ${e.message}`);
        }
    }

    _saveExperiences() {
        try {
            if (!fs.existsSync(this._storageDir)) {
                fs.mkdirSync(this._storageDir, { recursive: true });
            }
            const file = path.join(this._storageDir, 'experiences.json');
            const data = Object.fromEntries(this._experiences);
            fs.writeFileSync(file, JSON.stringify(data, null, 2));
        } catch (e) {
            logger.warn(`[ExperienceReplay] Failed to save experiences: ${e.message}`);
        }
    }
}

module.exports = { ExperienceReplay };
module.exports.default = ExperienceReplay;
