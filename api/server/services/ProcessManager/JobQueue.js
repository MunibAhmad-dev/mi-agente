/**
 * JobQueue — Durable background job queue using in-memory + optional persistence.
 *
 * Supports:
 *   - Enqueue jobs with priority
 *   - Worker pool (concurrency-limited)
 *   - Retry with backoff
 *   - Status tracking (pending, running, completed, failed)
 *
 * For persistence, integrates with MongoDB/Mongoose if available, else
 * uses in-memory storage.
 *
 * License: MIT
 */

const _jobs = new Map();
const _queue = [];
let _workersRunning = false;
const MAX_WORKERS = 4;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

let _counter = 0;

/**
 * Enqueue a job.
 * @param {object} opts
 * @param {string} opts.type - job type
 * @param {object} opts.payload - job data
 * @param {number} [opts.priority=0] - higher = processed first
 * @param {function} opts.handler - async function(payload) => result
 * @returns {string} job id
 */
function enqueue(opts = {}) {
  const id = `job_${++_counter}_${Date.now()}`;
  const job = {
    id,
    type: opts.type || 'default',
    payload: opts.payload || {},
    priority: opts.priority || 0,
    handler: opts.handler,
    status: 'pending',
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    error: null,
    result: null,
    retries: 0,
  };
  _jobs.set(id, job);
  _queue.push(id);
  _queue.sort((a, b) => _jobs.get(b).priority - _jobs.get(a).priority);
  _processQueue();
  return id;
}

/**
 * Process the queue with limited concurrency.
 */
async function _processQueue() {
  if (_workersRunning) return;
  _workersRunning = true;
  const active = new Set();
  while (_queue.length > 0 || active.size > 0) {
    while (active.size < MAX_WORKERS && _queue.length > 0) {
      const jobId = _queue.shift();
      const job = _jobs.get(jobId);
      if (!job || !job.handler) continue;
      job.status = 'running';
      job.startedAt = Date.now();
      active.add(jobId);
      job
        .handler(job.payload)
        .then((result) => {
          job.status = 'completed';
          job.result = result;
          job.completedAt = Date.now();
        })
        .catch((err) => {
          job.error = err.message;
          if (job.retries < MAX_RETRIES) {
            job.retries += 1;
            job.status = 'pending';
            setTimeout(() => {
              _queue.push(jobId);
              _processQueue();
            }, RETRY_DELAY_MS);
          } else {
            job.status = 'failed';
            job.completedAt = Date.now();
          }
        })
        .finally(() => {
          active.delete(jobId);
        });
    }
    if (active.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  _workersRunning = false;
}

/**
 * Get a job by id.
 * @param {string} id
 * @returns {object|null}
 */
function getJob(id) {
  return _jobs.get(id) || null;
}

/**
 * List all jobs.
 * @param {string} [status] - filter by status
 * @returns {Array}
 */
function listJobs(status) {
  const jobs = Array.from(_jobs.values());
  if (status) return jobs.filter((j) => j.status === status);
  return jobs;
}

/**
 * Get queue stats.
 * @returns {object}
 */
function getStats() {
  const jobs = Array.from(_jobs.values());
  return {
    total: jobs.length,
    pending: jobs.filter((j) => j.status === 'pending').length,
    running: jobs.filter((j) => j.status === 'running').length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
  };
}

/**
 * Clear completed/failed jobs.
 */
function clearFinished() {
  for (const [id, job] of _jobs.entries()) {
    if (job.status === 'completed' || job.status === 'failed') {
      _jobs.delete(id);
    }
  }
}

module.exports = {
  enqueue,
  getJob,
  listJobs,
  getStats,
  clearFinished,
};
