'use strict';

/**
 * CICDIntegration - CI/CD pipeline integration via GitHub Actions API
 */
class CICDIntegration {
  constructor(config = {}) {
    this.token = config.githubToken || process.env.GITHUB_TOKEN;
    this.octokit = null;
    this.git = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      if (this.token) {
        const { Octokit } = require('@octokit/rest');
        this.octokit = new Octokit({ auth: this.token });
      }
      const simpleGit = require('simple-git');
      this.git = simpleGit();
      this.initialized = true;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async triggerWorkflow(owner, repo, workflowId, ref = 'main') {
    if (!this.octokit) return { success: false, error: 'GitHub token not configured' };
    try {
      const result = await this.octokit.actions.createWorkflowDispatch({
        owner, repo, workflow_id: workflowId, ref,
      });
      return { success: true, status: result.status };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getBuildStatus(owner, repo, runId) {
    if (!this.octokit) return { success: false, error: 'GitHub token not configured' };
    try {
      const { data } = await this.octokit.actions.getWorkflowRun({ owner, repo, run_id: runId });
      return {
        success: true,
        status: data.status,
        conclusion: data.conclusion,
        url: data.html_url,
        duration: data.updated_at - data.created_at,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async createPR(owner, repo, title, body, head, base = 'main') {
    if (!this.octokit) return { success: false, error: 'GitHub token not configured' };
    try {
      const { data } = await this.octokit.pulls.create({
        owner, repo, title, body, head, base,
      });
      return { success: true, number: data.number, url: data.html_url };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getRecentRuns(owner, repo, limit = 10) {
    if (!this.octokit) return { success: false, error: 'GitHub token not configured' };
    try {
      const { data } = await this.octokit.actions.listWorkflowRunsForRepo({
        owner, repo, per_page: limit,
      });
      return {
        success: true,
        runs: data.workflow_runs.map(r => ({
          id: r.id,
          name: r.name,
          status: r.status,
          conclusion: r.conclusion,
          url: r.html_url,
          created: r.created_at,
        })),
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async gitStatus() {
    try {
      const status = await this.git.status();
      return { success: true, ...status };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async gitCommit(message) {
    try {
      await this.git.add('.');
      const result = await this.git.commit(message);
      return { success: true, commit: result.commit };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async gitPush(remote = 'origin', branch = 'main') {
    try {
      await this.git.push(remote, branch);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  getStats() {
    return {
      initialized: this.initialized,
      hasGitHubToken: !!this.octokit,
      hasGit: !!this.git,
    };
  }
}

module.exports = CICDIntegration;
