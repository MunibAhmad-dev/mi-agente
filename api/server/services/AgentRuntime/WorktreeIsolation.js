/**
 * WorktreeIsolation — isolates each subagent in its own git worktree so
 * multiple subagents can work in parallel without filesystem conflicts
 * (Grok Build 8-parallel pattern, Claude Code 2026-05 worktree isolation).
 *
 * Uses `git worktree` (available wherever git is installed). Each subagent
 * gets a branch + working directory that it can mutate freely.
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const WORKTREE_BASE =
  process.env.HARNESS_WORKTREE_DIR || path.join(os.tmpdir(), 'harness-worktrees');

function execGit(args, cwd) {
  return new Promise((resolve) => {
    exec(
      `git ${args}`,
      { cwd: cwd || process.cwd(), maxBuffer: 2 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({ stdout: stdout || '', stderr: stderr || '', code: err ? err.code || 1 : 0 });
      },
    );
  });
}

/**
 * Create an isolated worktree for a subagent.
 * @param {object} session
 * @param {object} subagent
 * @returns {Promise<{worktree:string, path:string, branch:string}>}
 */
async function create(session, subagent) {
  const name = (subagent && (subagent.name || subagent.id)) || 'subagent';
  const id = crypto
    .createHash('sha1')
    .update(name + session.id)
    .digest('hex')
    .slice(0, 8);
  const branchName = `harness/${name}-${id}`;
  const wtPath = path.join(WORKTREE_BASE, `${name}-${id}`);

  try {
    fs.mkdirSync(WORKTREE_BASE, { recursive: true });
    const result = await execGit(`worktree add -b ${branchName} ${wtPath} HEAD`);
    if (result.code !== 0) {
      // fallback: don't isolate
      return { worktree: null, path: process.cwd(), branch: null, error: result.stderr };
    }
    subagent.worktree = { path: wtPath, branch: branchName };
    return { worktree: branchName, path: wtPath, branch: branchName };
  } catch (e) {
    return { worktree: null, path: process.cwd(), branch: null, error: e.message };
  }
}

/**
 * Remove a worktree when the subagent finishes.
 * @param {object} subagent
 * @returns {Promise<boolean>}
 */
async function remove(subagent) {
  if (!subagent || !subagent.worktree) {
    return false;
  }
  const wt = subagent.worktree;
  await execGit(`worktree remove --force ${wt.path}`);
  await execGit(`branch -D ${wt.branch}`);
  return true;
}

module.exports = { create, remove, WORKTREE_BASE };
