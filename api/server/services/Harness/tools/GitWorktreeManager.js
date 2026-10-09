/**
 * GitWorktreeManager.js — Git Worktrees for Isolated Work
 * 
 * Creates temporary worktrees for sub-agents:
 * - Create worktree for isolated work
 * - Clean up when done
 * - Merge if successful
 * - Rollback if failed
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const logger = {
    debug: (...args) => console.log('[GitWorktreeManager]', ...args),
    info: (...args) => console.info('[GitWorktreeManager]', ...args),
    warn: (...args) => console.warn('[GitWorktreeManager]', ...args),
    error: (...args) => console.error('[GitWorktreeManager]', ...args),
};

class GitWorktreeManager {
    constructor(config = {}) {
        this._name = 'GitWorktreeManager';
        this._workingDir = config.workingDir || process.cwd();
        this._worktreeDir = config.worktreeDir || path.join(this._workingDir, '.worktrees');
        this._activeWorktrees = new Map();
    }

    /**
     * Create a new worktree for isolated work.
     */
    async createWorktree(branchName = null) {
        const branch = branchName || `worktree-${Date.now()}`;
        const worktreePath = path.join(this._worktreeDir, branch);

        try {
            // Ensure .worktrees directory exists
            if (!fs.existsSync(this._worktreeDir)) {
                fs.mkdirSync(this._worktreeDir, { recursive: true });
            }

            // Create worktree — use execFileSync with structured args (no shell injection)
            execFileSync('git', ['worktree', 'add', worktreePath, '-b', branch], {
                cwd: this._workingDir,
                stdio: 'pipe',
            });

            this._activeWorktrees.set(branch, {
                path: worktreePath,
                branch,
                createdAt: new Date(),
            });

            logger.info(`[GitWorktreeManager] Created worktree: ${branch}`);

            return {
                success: true,
                branch,
                path: worktreePath,
            };
        } catch (error) {
            // If branch already exists, try without -b
            try {
                execFileSync('git', ['worktree', 'add', worktreePath, branch], {
                    cwd: this._workingDir,
                    stdio: 'pipe',
                });

                this._activeWorktrees.set(branch, {
                    path: worktreePath,
                    branch,
                    createdAt: new Date(),
                });

                return { success: true, branch, path: worktreePath };
            } catch (e) {
                throw new Error(`Failed to create worktree: ${error.message}`);
            }
        }
    }

    /**
     * Remove a worktree.
     */
    async removeWorktree(branch) {
        const worktree = this._activeWorktrees.get(branch);
        if (!worktree) {
            throw new Error(`Worktree not found: ${branch}`);
        }

        try {
            execFileSync('git', ['worktree', 'remove', worktree.path, '--force'], {
                cwd: this._workingDir,
                stdio: 'pipe',
            });

            this._activeWorktrees.delete(branch);
            logger.info(`[GitWorktreeManager] Removed worktree: ${branch}`);

            return { success: true };
        } catch (error) {
            throw new Error(`Failed to remove worktree: ${error.message}`);
        }
    }

    /**
     * Merge a worktree's changes back to the main branch.
     */
    async mergeWorktree(branch, targetBranch = 'main') {
        const worktree = this._activeWorktrees.get(branch);
        if (!worktree) {
            throw new Error(`Worktree not found: ${branch}`);
        }

        try {
            // Commit changes in worktree — structured args, no shell injection
            execFileSync('git', ['add', '-A'], { cwd: worktree.path, stdio: 'pipe' });
            execFileSync('git', ['commit', '-m', `Worktree: ${branch}`], { cwd: worktree.path, stdio: 'pipe' });

            // Switch to target branch and merge — separate calls, no shell chaining
            if (!/^[a-zA-Z0-9_.\-/]+$/.test(targetBranch)) throw new Error('Invalid target branch name');
            if (!/^[a-zA-Z0-9_.\-/]+$/.test(branch)) throw new Error('Invalid branch name');
            execFileSync('git', ['checkout', targetBranch], { cwd: this._workingDir, stdio: 'pipe' });
            execFileSync('git', ['merge', branch, '--no-ff', '-m', `Merge worktree: ${branch}`], { cwd: this._workingDir, stdio: 'pipe' });

            logger.info(`[GitWorktreeManager] Merged worktree: ${branch} → ${targetBranch}`);

            return { success: true, branch, targetBranch };
        } catch (error) {
            throw new Error(`Failed to merge worktree: ${error.message}`);
        }
    }

    /**
     * List active worktrees.
     */
    listWorktrees() {
        const worktrees = [];
        for (const [branch, info] of this._activeWorktrees) {
            worktrees.push({
                branch,
                path: info.path,
                createdAt: info.createdAt,
                age: Date.now() - info.createdAt.getTime(),
            });
        }
        return worktrees;
    }

    /**
     * Get worktree info.
     */
    getWorktreeInfo(branch) {
        const worktree = this._activeWorktrees.get(branch);
        if (!worktree) return null;

        try {
            const status = execFileSync('git', ['status', '--porcelain'], {
                cwd: worktree.path,
                stdio: 'pipe',
            }).toString().trim();

            return {
                branch,
                path: worktree.path,
                createdAt: worktree.createdAt,
                changes: status.split('\n').filter(l => l.length > 0).length,
            };
        } catch (error) {
            return { branch, path: worktree.path, error: error.message };
        }
    }
}

module.exports = { GitWorktreeManager };
module.exports.default = GitWorktreeManager;
