/**
 * IssueToPRAutomation — assigns a GitHub/GitLab issue to the agent, which
 * creates a branch, implements the fix, and opens a pull request. Inspired
 * by PR-Agent (Apache-2.0) and GitHub Copilot's cloud agent mode.
 *
 * Flow: parse issue → create branch → run harness on task → commit → push → PR
 *
 * Uses GitHub CLI (gh) when available, falls back to GitHub API via curl.
 * Zero mandatory dependencies.
 */

const { exec } = require('child_process');
const crypto = require('crypto');

function execGit(args, opts = {}) {
  return new Promise((resolve) => {
    exec(
      `git ${args}`,
      { cwd: opts.cwd || process.cwd(), maxBuffer: 2 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({
          stdout: (stdout || '').trim(),
          stderr: (stderr || '').trim(),
          code: err ? err.code || 1 : 0,
        });
      },
    );
  });
}

function execCmd(cmd, opts = {}) {
  return new Promise((resolve) => {
    exec(
      cmd,
      { cwd: opts.cwd || process.cwd(), maxBuffer: 2 * 1024 * 1024, env: opts.env || process.env },
      (err, stdout, stderr) => {
        resolve({
          stdout: (stdout || '').trim(),
          stderr: (stderr || '').trim(),
          code: err ? err.code || 1 : 0,
        });
      },
    );
  });
}

/**
 * Parse a GitHub issue URL or number.
 * @param {string} issueRef URL or "#123" or "123"
 * @returns {{owner:string, repo:string, number:string|null, url:string|null}}
 */
function parseIssueRef(issueRef) {
  if (!issueRef) return { owner: null, repo: null, number: null, url: null };
  const ghMatch = issueRef.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (ghMatch) {
    return { owner: ghMatch[1], repo: ghMatch[2], number: ghMatch[3], url: issueRef };
  }
  const numMatch = issueRef.match(/^#?(\d+)$/);
  if (numMatch) {
    return { owner: null, repo: null, number: numMatch[1], url: null };
  }
  return { owner: null, repo: null, number: null, url: issueRef };
}

/**
 * Fetch issue details via gh CLI or GitHub API.
 * @param {object} ref { owner, repo, number }
 * @returns {Promise<{title:string, body:string, labels:string[]}>}
 */
async function fetchIssue(ref) {
  if (ref.owner && ref.repo && ref.number) {
    const r = await execCmd(
      `gh issue view ${ref.number} -R ${ref.owner}/${ref.repo} --json title,body,labels`,
    );
    if (r.code === 0) {
      try {
        const parsed = JSON.parse(r.stdout);
        return {
          title: parsed.title,
          body: parsed.body || '',
          labels: (parsed.labels || []).map((l) => l.name || l),
        };
      } catch {
        // fall through
      }
    }
  }
  if (ref.number) {
    const r = await execCmd(`gh issue view ${ref.number} --json title,body,labels`);
    if (r.code === 0) {
      try {
        const parsed = JSON.parse(r.stdout);
        return {
          title: parsed.title,
          body: parsed.body || '',
          labels: (parsed.labels || []).map((l) => l.name || l),
        };
      } catch {
        // fall through
      }
    }
  }
  return { title: `Issue ${ref.number}`, body: '', labels: [] };
}

/**
 * Create a branch for the issue.
 * @param {object} ref
 * @returns {Promise<{branch:string, created:boolean}>}
 */
async function createBranch(ref) {
  const slug = (ref.title || `issue-${ref.number}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const branch = `fix/${ref.number || 'task'}-${slug}-${crypto.randomBytes(3).toString('hex')}`;
  const r = await execGit(`checkout -b ${branch}`);
  return { branch, created: r.code === 0 };
}

/**
 * Process an issue: fetch, branch, run harness, commit, push, open PR.
 * @param {string} issueRef
 * @param {object} opts { harnessSession, commitMessage, prTitle, prBody }
 * @returns {Promise<object>}
 */
async function processIssue(issueRef, opts = {}) {
  const ref = parseIssueRef(issueRef);
  if (!ref.number && !ref.url) {
    return { success: false, error: 'Could not parse issue reference' };
  }

  // 1. Fetch issue
  const issue = await fetchIssue(ref);
  const task = `${issue.title}\n\n${issue.body}`.trim();

  // 2. Create branch
  const { branch, created } = await createBranch({ ...ref, title: issue.title });
  if (!created) {
    return { success: false, error: 'Failed to create branch', branch };
  }

  // 3. Run harness on the task (delegated to caller via callback)
  let harnessResult = null;
  if (opts.harnessSession && typeof opts.runHarness === 'function') {
    harnessResult = await opts.runHarness(opts.harnessSession, task);
  }

  // 4. Commit changes
  await execGit('add -A');
  const commitMsg = opts.commitMessage || `fix: ${issue.title}\n\nCloses #${ref.number}`;
  const commitR = await execGit(`commit -m ${JSON.stringify(commitMsg)}`);
  if (commitR.code !== 0) {
    return { success: false, error: 'No changes to commit or commit failed', branch, issue };
  }

  // 5. Push
  const pushR = await execGit(`push -u origin ${branch}`);
  if (pushR.code !== 0) {
    return { success: false, error: `push failed: ${pushR.stderr}`, branch, issue };
  }

  // 6. Open PR
  const prTitle = opts.prTitle || `Fix: ${issue.title}`;
  const prBody =
    opts.prBody ||
    `Closes #${ref.number}\n\n${issue.body}\n\n---\n_This PR was created by an AI agent._`;
  const prCmd = `gh pr create --title ${JSON.stringify(prTitle)} --body ${JSON.stringify(prBody)} --base main`;
  const prR = await execCmd(prCmd);
  if (prR.code !== 0) {
    return {
      success: false,
      error: `PR creation failed: ${prR.stderr}`,
      branch,
      issue,
      pushed: true,
    };
  }

  return {
    success: true,
    branch,
    issue,
    prUrl: prR.stdout,
    harnessResult,
  };
}

module.exports = {
  parseIssueRef,
  fetchIssue,
  createBranch,
  processIssue,
};
