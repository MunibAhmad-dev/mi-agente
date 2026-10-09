/**
 * GitRollback.js — Git Rollback System
 * 
 * Undo changes and revert to previous state:
 * - Commit before modifications
 * - Rollback to specific commit
 * - Compare versions
 * - List changes
 */

const { execFileSync } = require('child_process');

const logger = {
    debug: (...args) => console.log('[GitRollback]', ...args),
    info: (...args) => console.info('[GitRollback]', ...args),
    warn: (...args) => console.warn('[GitRollback]', ...args),
    error: (...args) => console.error('[GitRollback]', ...args),
};

class GitRollback {
    constructor(config = {}) {
        this._name = 'GitRollback';
        this._workingDir = config.workingDir || process.cwd();
    }

    getToolDefinitions() {
        return [
            {
                type: 'function',
                function: {
                    name: 'git_commit',
                    description: 'Create a git commit with current changes.',
                    parameters: {
                        type: 'object',
                        properties: {
                            message: { type: 'string', description: 'Commit message' },
                            files: { type: 'array', items: { type: 'string' }, description: 'Specific files to commit' },
                        },
                        required: ['message'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'git_rollback',
                    description: 'Rollback to a specific commit or undo the last commit.',
                    parameters: {
                        type: 'object',
                        properties: {
                            commitHash: { type: 'string', description: 'Commit hash to rollback to (empty for last commit)' },
                            hard: { type: 'boolean', description: 'Hard rollback (discard all changes)' },
                        },
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'git_log',
                    description: 'Show recent git commits.',
                    parameters: {
                        type: 'object',
                        properties: {
                            count: { type: 'number', description: 'Number of commits to show (default: 10)' },
                        },
                    },
                },
            },
        ];
    }

    async execute(toolName, params, context = {}) {
        const cwd = context.workingDir || this._workingDir;
        switch (toolName) {
            case 'git_commit': return this.commit(params, cwd);
            case 'git_rollback': return this.rollback(params, cwd);
            case 'git_log': return this.getLog(params, cwd);
            default: throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    /**
     * Create a git commit.
     */
    async commit(params, cwd) {
        const { message, files } = params;

        try {
            // Stage files — use execFile to avoid shell injection
            if (files && files.length > 0) {
                for (const file of files) {
                    execFileSync('git', ['add', '--', file], { cwd, stdio: 'pipe' });
                }
            } else {
                execFileSync('git', ['add', '-A'], { cwd, stdio: 'pipe' });
            }

            // Commit — message passed as structured arg, no shell interpolation
            execFileSync('git', ['commit', '-m', message], { cwd, stdio: 'pipe' });

            // Get commit hash
            const hash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, stdio: 'pipe' }).toString().trim();

            logger.info(`[GitRollback] Committed: ${hash.substring(0, 7)} - ${message}`);

            return { success: true, hash, message };
        } catch (error) {
            throw new Error(`Commit failed: ${error.message}`);
        }
    }

    /**
     * Rollback to a commit.
     */
    async rollback(params = {}, cwd) {
        const { commitHash, hard = false } = params;

        try {
            if (commitHash) {
                // Validate commit hash format to prevent injection
                if (!/^[0-9a-f]{4,40}$/i.test(commitHash)) throw new Error('Invalid commit hash format');
                const args = hard ? ['reset', '--hard', commitHash] : ['reset', commitHash];
                execFileSync('git', args, { cwd, stdio: 'pipe' });
                logger.info(`[GitRollback] Rolled back to: ${commitHash.substring(0, 7)}`);
                return { success: true, rolledBackTo: commitHash, hard };
            } else {
                // Undo last commit
                const args = hard ? ['reset', '--hard', 'HEAD~1'] : ['reset', '--soft', 'HEAD~1'];
                execFileSync('git', args, { cwd, stdio: 'pipe' });
                logger.info(`[GitRollback] Undid last commit`);
                return { success: true, action: 'undid last commit', hard };
            }
        } catch (error) {
            throw new Error(`Rollback failed: ${error.message}`);
        }
    }

    /**
     * Get git log.
     */
    async getLog(params = {}, cwd) {
        const count = params.count || 10;

        try {
            const log = execFileSync(
                'git', ['log', '--oneline', '-n', String(parseInt(count, 10) || 10)],
                { cwd, stdio: 'pipe' }
            ).toString().trim();

            return { success: true, log };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = { GitRollback };
module.exports.default = GitRollback;
