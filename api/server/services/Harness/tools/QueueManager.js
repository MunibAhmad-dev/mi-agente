/**
 * QueueManager — Background job queue
 * License: MIT — Zero cost
 */

const EventEmitter = require('events');

class QueueManager extends EventEmitter {
  constructor() {
    super();
    this.queues = new Map();
    this.initialized = false;
    this.stats = { enqueued: 0, processed: 0, failed: 0 };
  }

  initialize() { this.initialized = true; return { status: 'ok', module: 'QueueManager' }; }

  createQueue(name, { concurrency = 1, processor } = {}) {
    this.queues.set(name, { name, jobs: [], processing: false, concurrency, processor, completed: 0, failed: 0 });
    return { success: true, name };
  }

  enqueue(queueName, job) {
    const q = this.queues.get(queueName);
    if (!q) return { success: false, error: 'Queue not found' };
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record = { id, data: job, status: 'pending', createdAt: new Date().toISOString(), attempts: 0 };
    q.jobs.push(record);
    this.stats.enqueued++;
    this._process(queueName);
    return { success: true, id };
  }

  async _process(name) {
    const q = this.queues.get(name);
    if (!q || q.processing) return;
    q.processing = true;
    while (q.jobs.length > 0) {
      const job = q.jobs.find(j => j.status === 'pending');
      if (!job) break;
      job.status = 'processing';
      job.attempts++;
      try {
        if (q.processor) await q.processor(job.data);
        job.status = 'completed';
        q.completed++;
        this.stats.processed++;
      } catch (err) {
        job.status = job.attempts >= 3 ? 'failed' : 'pending';
        if (job.status === 'failed') { q.failed++; this.stats.failed++; }
      }
    }
    q.processing = false;
  }

  getStatus(name) { const q = this.queues.get(name); return q ? { pending: q.jobs.filter(j => j.status === 'pending').length, completed: q.completed, failed: q.failed } : null; }
  list() { return Array.from(this.queues.keys()); }
  getStats() { return { ...this.stats, queues: this.queues.size }; }
}

module.exports = QueueManager;
