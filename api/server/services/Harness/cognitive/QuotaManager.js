/**
 * QuotaManager.js — Quota & Usage Management
 * 
 * Manages quotas per user/provider:
 * - Token limits per user
 * - Request limits per user
 * - Cost limits per user
 * - Provider quotas
 * - Usage tracking
 * - Alert system
 * 
 * License: MIT
 * RAM: ~3MB
 */

const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[QuotaManager]', ...args),
    info: (...args) => console.info('[QuotaManager]', ...args),
    warn: (...args) => console.warn('[QuotaManager]', ...args),
    error: (...args) => console.error('[QuotaManager]', ...args),
};

class QuotaManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'QuotaManager';
        this._quotas = new Map(); // userId -> quotas
        this._usage = new Map(); // userId -> usage
        this._defaultQuotas = config.defaultQuotas || {
            tokensPerDay: 100000,
            tokensPerMonth: 2000000,
            requestsPerDay: 1000,
            requestsPerMonth: 20000,
            costPerDay: 10.0, // USD
            costPerMonth: 200.0,
        };
        this._alertThreshold = config.alertThreshold || 0.8; // 80%
    }

    /**
     * Set quotas for a user.
     */
    setQuota(userId, quotas) {
        const merged = { ...this._defaultQuotas, ...quotas };
        this._quotas.set(userId, merged);

        // Initialize usage if not exists
        if (!this._usage.has(userId)) {
            this._usage.set(userId, this._getEmptyUsage());
        }

        logger.info(`[QuotaManager] Set quota for ${userId}`);
        return { success: true, userId, quotas: merged };
    }

    /**
     * Check if a user has quota remaining.
     */
    checkQuota(userId, type = 'tokens', amount = 1) {
        const quota = this._quotas.get(userId) || this._defaultQuotas;
        const usage = this._usage.get(userId) || this._getEmptyUsage();

        // Reset daily/monthly counters if needed
        this._resetIfNeeded(usage);

        let limit, current;

        switch (type) {
            case 'tokens':
                limit = quota.tokensPerDay;
                current = usage.tokensToday;
                break;
            case 'tokens-monthly':
                limit = quota.tokensPerMonth;
                current = usage.tokensMonth;
                break;
            case 'requests':
                limit = quota.requestsPerDay;
                current = usage.requestsToday;
                break;
            case 'requests-monthly':
                limit = quota.requestsPerMonth;
                current = usage.requestsMonth;
                break;
            case 'cost':
                limit = quota.costPerDay;
                current = usage.costToday;
                break;
            case 'cost-monthly':
                limit = quota.costPerMonth;
                current = usage.costMonth;
                break;
            default:
                return { allowed: true, remaining: Infinity };
        }

        const remaining = limit - current;
        const allowed = remaining >= amount;
        const usagePercent = current / limit;

        // Alert if approaching limit
        if (usagePercent >= this._alertThreshold && usagePercent < 1) {
            this.emit('quotaWarning', {
                userId,
                type,
                usage: current,
                limit,
                percent: Math.round(usagePercent * 100),
            });
        }

        if (!allowed) {
            this.emit('quotaExceeded', { userId, type, usage: current, limit });
        }

        return {
            allowed,
            remaining: Math.max(0, remaining),
            usage: current,
            limit,
            percent: Math.round(usagePercent * 100),
        };
    }

    /**
     * Record usage.
     */
    recordUsage(userId, type, amount) {
        const usage = this._usage.get(userId) || this._getEmptyUsage();

        switch (type) {
            case 'tokens':
                usage.tokensToday += amount;
                usage.tokensMonth += amount;
                usage.tokensTotal += amount;
                break;
            case 'requests':
                usage.requestsToday += amount;
                usage.requestsMonth += amount;
                usage.requestsTotal += amount;
                break;
            case 'cost':
                usage.costToday += amount;
                usage.costMonth += amount;
                usage.costTotal += amount;
                break;
        }

        usage.lastActivity = Date.now();
        this._usage.set(userId, usage);

        // Check if quota exceeded
        this.checkQuota(userId, type);
    }

    /**
     * Get usage stats for a user.
     */
    getUsage(userId) {
        const usage = this._usage.get(userId) || this._getEmptyUsage();
        const quota = this._quotas.get(userId) || this._defaultQuotas;

        this._resetIfNeeded(usage);

        return {
            userId,
            tokens: {
                today: usage.tokensToday,
                month: usage.tokensMonth,
                total: usage.tokensTotal,
                quotaDay: quota.tokensPerDay,
                quotaMonth: quota.tokensPerMonth,
                remainingDay: Math.max(0, quota.tokensPerDay - usage.tokensToday),
                remainingMonth: Math.max(0, quota.tokensPerMonth - usage.tokensMonth),
            },
            requests: {
                today: usage.requestsToday,
                month: usage.requestsMonth,
                total: usage.requestsTotal,
                quotaDay: quota.requestsPerDay,
                quotaMonth: quota.requestsPerMonth,
                remainingDay: Math.max(0, quota.requestsPerDay - usage.requestsToday),
                remainingMonth: Math.max(0, quota.requestsPerMonth - usage.requestsMonth),
            },
            cost: {
                today: usage.costToday,
                month: usage.costMonth,
                total: usage.costTotal,
                quotaDay: quota.costPerDay,
                quotaMonth: quota.costPerMonth,
                remainingDay: Math.max(0, quota.costPerDay - usage.costToday),
                remainingMonth: Math.max(0, quota.costPerMonth - usage.costMonth),
            },
            lastActivity: usage.lastActivity,
        };
    }

    /**
     * Get all users usage.
     */
    getAllUsage() {
        const all = {};
        for (const [userId] of this._usage) {
            all[userId] = this.getUsage(userId);
        }
        return all;
    }

    /**
     * Reset usage for a user.
     */
    resetUsage(userId) {
        this._usage.set(userId, this._getEmptyUsage());
        logger.info(`[QuotaManager] Reset usage for ${userId}`);
        return { success: true };
    }

    // ── Internal ──────────────────────────────────────────────

    _getEmptyUsage() {
        return {
            tokensToday: 0,
            tokensMonth: 0,
            tokensTotal: 0,
            requestsToday: 0,
            requestsMonth: 0,
            requestsTotal: 0,
            costToday: 0,
            costMonth: 0,
            costTotal: 0,
            lastDayReset: Date.now(),
            lastMonthReset: Date.now(),
            lastActivity: null,
        };
    }

    _resetIfNeeded(usage) {
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        const oneMonth = 30 * oneDay;

        // Reset daily
        if (now - usage.lastDayReset > oneDay) {
            usage.tokensToday = 0;
            usage.requestsToday = 0;
            usage.costToday = 0;
            usage.lastDayReset = now;
        }

        // Reset monthly
        if (now - usage.lastMonthReset > oneMonth) {
            usage.tokensMonth = 0;
            usage.requestsMonth = 0;
            usage.costMonth = 0;
            usage.lastMonthReset = now;
        }
    }
}

module.exports = { QuotaManager };
module.exports.default = QuotaManager;
