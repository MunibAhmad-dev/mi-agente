/**
 * TaskPlanner — DAG-based task planning with dependency resolution.
 *
 * Features:
 *   - Parse natural language into structured task graph
 *   - Dependency resolution (topological sort)
 *   - Parallel execution groups
 *   - Progress tracking per task
 *   - Dynamic replanning on failure
 *   - Critical path detection
 *   - Task cancellation
 *
 * Task states: pending → running → completed | failed | skipped | cancelled
 */

const crypto = require('crypto');

const logger = {
  info: (...args) => console.info('[TaskPlanner]', ...args),
  debug: (...args) => console.log('[TaskPlanner]', ...args),
  warn: (...args) => console.warn('[TaskPlanner]', ...args),
  error: (...args) => console.error('[TaskPlanner]', ...args),
};

/**
 * Task states.
 */
const TaskState = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
};

/**
 * Individual task node.
 */
class TaskNode {
  constructor(params = {}) {
    this.id = params.id || crypto.randomUUID();
    this.name = params.name || 'Unnamed task';
    this.description = params.description || '';
    this.state = TaskState.PENDING;
    this.capability = params.capability || 'general';
    this.dependencies = params.dependencies || []; // IDs of tasks this depends on
    this.dependents = params.dependents || [];     // IDs of tasks that depend on this
    this.tools = params.tools || [];
    this.params = params.params || {};
    this.result = null;
    this.error = null;
    this.startedAt = null;
    this.completedAt = null;
    this.retries = 0;
    this.maxRetries = params.maxRetries || 2;
    this.critical = params.critical || false; // If true, failure blocks entire plan
    this.metadata = params.metadata || {};
  }

  canRun(completedTasks) {
    if (this.state !== TaskState.PENDING) return false;
    return this.dependencies.every(depId => completedTasks.has(depId));
  }

  toJSON() {
    return {
      id: this.id, name: this.name, description: this.description,
      state: this.state, capability: this.capability,
      dependencies: this.dependencies, dependents: this.dependents,
      tools: this.tools, result: this.result, error: this.error,
      startedAt: this.startedAt, completedAt: this.completedAt,
      retries: this.retries, critical: this.critical,
    };
  }
}

/**
 * TaskPlanner — manages a DAG of tasks.
 */
class TaskPlanner {
  constructor(config = {}) {
    this.config = {
      maxParallel: config.maxParallel || 5,
      maxRetries: config.maxRetries || 2,
      ...config,
    };

    this._tasks = new Map();      // id → TaskNode
    this._executionOrder = [];    // topological order
    this._completedSet = new Set(); // completed task IDs
    this._startTime = null;
  }

  // ============================================================
  // PLAN CREATION
  // ============================================================

  /**
   * Create a plan from a list of task definitions.
   *
   * @param {Array} taskDefs - [{ name, description, capability, dependencies: [name], ... }]
   * @returns {TaskPlanner} this (for chaining)
   */
  createPlan(taskDefs) {
    this._tasks.clear();
    this._completedSet.clear();
    this._executionOrder = [];

    // First pass: create all task nodes
    const nameToId = {};
    for (const def of taskDefs) {
      const node = new TaskNode({
        name: def.name,
        description: def.description,
        capability: def.capability,
        tools: def.tools,
        params: def.params,
        maxRetries: def.maxRetries || this.config.maxRetries,
        critical: def.critical || false,
        metadata: def.metadata,
      });
      this._tasks.set(node.id, node);
      nameToId[def.name] = node.id;
    }

    // Second pass: resolve dependencies by name → id
    for (const def of taskDefs) {
      const node = this._findByName(def.name);
      if (!node) continue;

      const depNames = def.dependencies || [];
      for (const depName of depNames) {
        const depId = nameToId[depName];
        if (depId) {
          node.dependencies.push(depId);
          const depNode = this._tasks.get(depId);
          if (depNode) depNode.dependents.push(node.id);
        }
      }
    }

    // Validate no cycles
    if (this._hasCycle()) {
      throw new Error('Task plan contains circular dependencies');
    }

    // Compute execution order
    this._executionOrder = this._topologicalSort();

    logger.info(
      `[TaskPlanner] Created plan: ${this._tasks.size} tasks, ` +
      `${this._executionOrder.length} execution groups`,
    );

    return this;
  }

  /**
   * Create a simple linear plan (no dependencies).
   */
  createLinearPlan(taskDefs) {
    const withDeps = taskDefs.map((def, i) => ({
      ...def,
      dependencies: i > 0 ? [taskDefs[i - 1].name] : [],
    }));
    return this.createPlan(withDeps);
  }

  // ============================================================
  // EXECUTION CONTROL
  // ============================================================

  /**
   * Get the next batch of tasks that can run (all dependencies met).
   */
  getNextBatch() {
    const batch = [];
    for (const id of this._executionOrder) {
      const task = this._tasks.get(id);
      if (task && task.canRun(this._completedSet)) {
        batch.push(task);
        if (batch.length >= this.config.maxParallel) break;
      }
    }
    return batch;
  }

  /**
   * Mark a task as running.
   */
  startTask(taskId) {
    const task = this._tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    task.state = TaskState.RUNNING;
    task.startedAt = new Date().toISOString();
    return task;
  }

  /**
   * Mark a task as completed.
   */
  completeTask(taskId, result = null) {
    const task = this._tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    task.state = TaskState.COMPLETED;
    task.result = result;
    task.completedAt = new Date().toISOString();
    this._completedSet.add(taskId);

    // Skip dependent tasks if this failed
    for (const depId of task.dependents) {
      const dep = this._tasks.get(depId);
      if (dep && dep.state === TaskState.PENDING) {
        // Check if all dependencies are met
        if (!dep.canRun(this._completedSet)) {
          logger.warn(`[TaskPlanner] Skipping ${dep.name} — dependency ${task.name} completed but others pending`);
        }
      }
    }

    return task;
  }

  /**
   * Mark a task as failed.
   */
  failTask(taskId, error) {
    const task = this._tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    task.retries++;
    task.error = error?.message || String(error);

    if (task.retries < task.maxRetries) {
      // Retry: reset to pending
      task.state = TaskState.PENDING;
      task.startedAt = null;
      logger.warn(`[TaskPlanner] Task ${task.name} failed, retry ${task.retries}/${task.maxRetries}`);
      return { task, retriable: true };
    }

    // Exhausted retries
    task.state = TaskState.FAILED;
    task.completedAt = new Date().toISOString();

    // If critical, cancel all dependent tasks
    if (task.critical) {
      this._cancelDependents(taskId);
    }

    logger.error(`[TaskPlanner] Task ${task.name} failed permanently: ${task.error}`);
    return { task, retriable: false };
  }

  /**
   * Cancel a task and all its dependents.
   */
  cancelTask(taskId) {
    const task = this._tasks.get(taskId);
    if (!task) return;
    task.state = TaskState.CANCELLED;
    task.completedAt = new Date().toISOString();
    this._cancelDependents(taskId);
  }

  /**
   * Check if the plan is complete.
   */
  isComplete() {
    for (const [, task] of this._tasks) {
      if (task.state === TaskState.PENDING || task.state === TaskState.RUNNING) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if the plan has any failures.
   */
  hasFailures() {
    for (const [, task] of this._tasks) {
      if (task.state === TaskState.FAILED) return true;
    }
    return false;
  }

  /**
   * Get the critical path (longest dependency chain).
   */
  getCriticalPath() {
    const path = [];
    // Find tasks with no dependents (endpoints)
    const endpoints = [];
    for (const [, task] of this._tasks) {
      if (task.dependents.length === 0) endpoints.push(task);
    }

    // Walk backward from each endpoint
    for (const end of endpoints) {
      const chain = [];
      let current = end;
      while (current) {
        chain.unshift(current);
        if (current.dependencies.length > 0) {
          current = this._tasks.get(current.dependencies[0]);
        } else {
          current = null;
        }
      }
      if (chain.length > path.length) {
        path.length = 0;
        path.push(...chain);
      }
    }

    return path;
  }

  // ============================================================
  // PROGRESS
  // ============================================================

  /**
   * Get plan progress summary.
   */
  getProgress() {
    const tasks = Array.from(this._tasks.values());
    const byState = {};
    for (const task of tasks) {
      byState[task.state] = (byState[task.state] || 0) + 1;
    }

    return {
      total: tasks.length,
      completed: byState[TaskState.COMPLETED] || 0,
      failed: byState[TaskState.FAILED] || 0,
      running: byState[TaskState.RUNNING] || 0,
      pending: byState[TaskState.PENDING] || 0,
      skipped: byState[TaskState.SKIPPED] || 0,
      cancelled: byState[TaskState.CANCELLED] || 0,
      percentComplete: tasks.length > 0
        ? Math.round(((byState[TaskState.COMPLETED] || 0) / tasks.length) * 100)
        : 0,
      elapsed: this._startTime ? Date.now() - this._startTime : 0,
    };
  }

  /**
   * Get all tasks in execution order.
   */
  getAllTasks() {
    return this._executionOrder.map(id => this._tasks.get(id)).filter(Boolean);
  }

  /**
   * Get a specific task.
   */
  getTask(taskId) {
    return this._tasks.get(taskId);
  }

  /**
   * Start tracking execution time.
   */
  startTracking() {
    this._startTime = Date.now();
  }

  // ============================================================
  // REPLAN
  // ============================================================

  /**
   * Add a new task dynamically.
   */
  addTask(taskDef) {
    const node = new TaskNode({
      name: taskDef.name,
      description: taskDef.description,
      capability: taskDef.capability,
      dependencies: (taskDef.dependencies || []).map(depName => {
        const dep = this._findByName(depName);
        return dep ? dep.id : null;
      }).filter(Boolean),
      tools: taskDef.tools,
      params: taskDef.params,
      critical: taskDef.critical || false,
    });

    this._tasks.set(node.id, node);

    // Update dependents of dependencies
    for (const depId of node.dependencies) {
      const dep = this._tasks.get(depId);
      if (dep) dep.dependents.push(node.id);
    }

    // Rebuild execution order
    this._executionOrder = this._topologicalSort();

    logger.info(`[TaskPlanner] Added task: ${node.name} (${node.id})`);
    return node;
  }

  /**
   * Remove a pending task.
   */
  removeTask(taskId) {
    const task = this._tasks.get(taskId);
    if (!task || task.state !== TaskState.PENDING) return false;

    // Remove from dependencies
    for (const depId of task.dependencies) {
      const dep = this._tasks.get(depId);
      if (dep) dep.dependents = dep.dependents.filter(id => id !== taskId);
    }
    for (const depId of task.dependents) {
      const dep = this._tasks.get(depId);
      if (dep) dep.dependencies = dep.dependencies.filter(id => id !== taskId);
    }

    this._tasks.delete(taskId);
    this._executionOrder = this._executionOrder.filter(id => id !== taskId);
    return true;
  }

  /**
   * Export plan for serialization/persistence.
   */
  exportPlan() {
    return {
      tasks: Array.from(this._tasks.values()).map(t => t.toJSON()),
      executionOrder: this._executionOrder,
      progress: this.getProgress(),
      startTime: this._startTime,
    };
  }

  // ============================================================
  // INTERNAL HELPERS
  // ============================================================

  _findByName(name) {
    for (const [, task] of this._tasks) {
      if (task.name === name) return task;
    }
    return null;
  }

  _cancelDependents(taskId) {
    const task = this._tasks.get(taskId);
    if (!task) return;
    for (const depId of task.dependents) {
      const dep = this._tasks.get(depId);
      if (dep && dep.state === TaskState.PENDING) {
        dep.state = TaskState.CANCELLED;
        dep.completedAt = new Date().toISOString();
        logger.info(`[TaskPlanner] Cancelled dependent: ${dep.name}`);
        this._cancelDependents(depId); // Recurse
      }
    }
  }

  /**
   * Topological sort (Kahn's algorithm).
   */
  _topologicalSort() {
    const inDegree = new Map();
    const adjacency = new Map();

    for (const [id, task] of this._tasks) {
      inDegree.set(id, task.dependencies.length);
      adjacency.set(id, task.dependents.slice());
    }

    const queue = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    const sorted = [];
    while (queue.length > 0) {
      const id = queue.shift();
      sorted.push(id);
      for (const depId of (adjacency.get(id) || [])) {
        const newDegree = (inDegree.get(depId) || 1) - 1;
        inDegree.set(depId, newDegree);
        if (newDegree === 0) queue.push(depId);
      }
    }

    if (sorted.length !== this._tasks.size) {
      logger.warn('[TaskPlanner] Topological sort: not all tasks reachable (possible disconnected graph)');
    }

    return sorted;
  }

  /**
   * Detect cycles using DFS.
   */
  _hasCycle() {
    const visited = new Set();
    const inStack = new Set();

    const dfs = (taskId) => {
      if (inStack.has(taskId)) return true;
      if (visited.has(taskId)) return false;
      visited.add(taskId);
      inStack.add(taskId);
      const task = this._tasks.get(taskId);
      if (task) {
        for (const depId of task.dependencies) {
          if (dfs(depId)) return true;
        }
      }
      inStack.delete(taskId);
      return false;
    };

    for (const id of this._tasks.keys()) {
      if (dfs(id)) return true;
    }
    return false;
  }
}

module.exports = { TaskPlanner, TaskNode, TaskState };
