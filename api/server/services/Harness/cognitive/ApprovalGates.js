/**
 * ApprovalGates.js — Permission & Approval System
 * 
 * Controls dangerous operations:
 * - File modifications
 * - Command execution
 * - Network requests
 * - Credential access
 * - Configuration changes
 * 
 * License: MIT
 * RAM: ~2MB
 */

const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[ApprovalGates]', ...args),
    info: (...args) => console.info('[ApprovalGates]', ...args),
    warn: (...args) => console.warn('[ApprovalGates]', ...args),
};

const PermissionLevel = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical',
};

class ApprovalGates extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'ApprovalGates';
        this._defaultLevel = config.defaultLevel || PermissionLevel.MEDIUM;
        this._autoApprove = config.autoApprove || false;
        this._rules = this._getDefaultRules();
        this._approvalHistory = [];
        this._pendingApprovals = new Map();
    }

    /**
     * Check if an operation requires approval.
     */
    check(toolName, params, context = {}) {
        const rule = this._findRule(toolName, params);

        if (!rule) {
            return { required: false, level: PermissionLevel.LOW };
        }

        // Check if auto-approve covers this level
        if (this._autoApprove && rule.level !== PermissionLevel.CRITICAL) {
            return { required: false, level: rule.level, autoApproved: true };
        }

        return {
            required: true,
            level: rule.level,
            reason: rule.reason,
            toolName,
            params,
        };
    }

    /**
     * Request approval.
     */
    async requestApproval(toolName, params, reason, options = {}) {
        const approvalId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        logger.info(`[ApprovalGates] Approval requested: ${toolName} - ${reason}`);

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this._pendingApprovals.delete(approvalId);
                resolve({ approved: false, reason: 'timeout' });
            }, options.timeout || 300000); // 5 minutes

            this._pendingApprovals.set(approvalId, {
                toolName,
                params,
                reason,
                resolve: (approved) => {
                    clearTimeout(timer);
                    this._pendingApprovals.delete(approvalId);
                    this._approvalHistory.push({
                        approvalId,
                        toolName,
                        reason,
                        approved,
                        timestamp: Date.now(),
                    });
                    resolve({ approved });
                },
            });

            // Emit event for UI handling
            this.emit('approvalNeeded', {
                id: approvalId,
                toolName,
                params,
                reason,
                level: this._findRule(toolName, params)?.level || PermissionLevel.MEDIUM,
            });
        });
    }

    /**
     * Submit approval decision.
     */
    submitDecision(approvalId, approved) {
        const pending = this._pendingApprovals.get(approvalId);
        if (pending) {
            pending.resolve(approved);
            return { success: true };
        }
        return { success: false, error: 'Approval not found' };
    }

    /**
     * Get pending approvals.
     */
    getPending() {
        return [...this._pendingApprovals.entries()].map(([id, info]) => ({
            id,
            toolName: info.toolName,
            reason: info.reason,
        }));
    }

    /**
     * Get approval history.
     */
    getHistory(limit = 50) {
        return this._approvalHistory.slice(-limit);
    }

    /**
     * Add a custom rule.
     */
    addRule(rule) {
        this._rules.push(rule);
    }

    // ── Internal ──────────────────────────────────────────────

    _findRule(toolName, params) {
        for (const rule of this._rules) {
            if (rule.toolPattern && toolName.match(rule.toolPattern)) {
                return rule;
            }
            if (rule.toolName && rule.toolName === toolName) {
                return rule;
            }
        }
        return null;
    }

    _getDefaultRules() {
        return [
            // Critical: always ask
            { toolPattern: /^delete_file$/, level: PermissionLevel.CRITICAL, reason: 'Deleting a file is irreversible' },
            { toolPattern: /^execute_command$/, level: PermissionLevel.HIGH, reason: 'Executing shell commands' },
            { toolPattern: /^write_file$/, level: PermissionLevel.MEDIUM, reason: 'Modifying files' },
            { toolPattern: /^edit_file$/, level: PermissionLevel.MEDIUM, reason: 'Editing files' },
            { toolPattern: /^move_file$/, level: PermissionLevel.MEDIUM, reason: 'Moving files' },
            { toolPattern: /^copy_file$/, level: PermissionLevel.LOW, reason: 'Copying files' },
            { toolPattern: /^read_file$/, level: PermissionLevel.LOW, reason: 'Reading files' },
            { toolPattern: /^list_directory$/, level: PermissionLevel.LOW, reason: 'Listing directories' },
            { toolPattern: /^grep$/, level: PermissionLevel.LOW, reason: 'Searching files' },
            { toolPattern: /^glob$/, level: PermissionLevel.LOW, reason: 'Finding files' },
            { toolPattern: /^git_commit$/, level: PermissionLevel.HIGH, reason: 'Creating a git commit' },
            { toolPattern: /^git_rollback$/, level: PermissionLevel.CRITICAL, reason: 'Rolling back changes' },
            { toolPattern: /^execute_code$/, level: PermissionLevel.HIGH, reason: 'Executing code' },
        ];
    }
}

module.exports = { ApprovalGates, PermissionLevel };
module.exports.default = ApprovalGates;
