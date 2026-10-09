'use strict';

const EventEmitter3 = require('eventemitter3');

/**
 * AgentTeams - Multi-agent coordination and team management
 */
class AgentTeams {
  constructor() {
    this.emitter = new EventEmitter3();
    this.teams = new Map();
    this.tasks = new Map();
    this.results = new Map();
  }

  createTeam(teamId, config = {}) {
    const team = {
      id: teamId,
      name: config.name || teamId,
      agents: config.agents || [],
      strategy: config.strategy || 'parallel', // parallel, sequential, hybrid
      created: new Date().toISOString(),
      status: 'ready',
      taskCount: 0,
    };
    this.teams.set(teamId, team);
    return { success: true, team };
  }

  addAgentToTeam(teamId, agent) {
    const team = this.teams.get(teamId);
    if (!team) return { success: false, error: 'Team not found' };
    team.agents.push({ id: agent.id, role: agent.role || 'worker', capabilities: agent.capabilities || [] });
    return { success: true };
  }

  async delegateTask(teamId, task) {
    const team = this.teams.get(teamId);
    if (!team) return { success: false, error: 'Team not found' };

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const taskObj = {
      id: taskId,
      teamId,
      task,
      status: 'pending',
      assignedTo: [],
      created: new Date().toISOString(),
    };

    // Assign to agents based on capabilities
    if (task.requiredCapabilities) {
      taskObj.assignedTo = team.agents.filter(a =>
        task.requiredCapabilities.some(c => (a.capabilities || []).includes(c))
      );
    }
    if (taskObj.assignedTo.length === 0) {
      taskObj.assignedTo = team.agents; // Assign to all
    }

    this.tasks.set(taskId, taskObj);
    team.taskCount++;
    return { success: true, taskId, assignedTo: taskObj.assignedTo.map(a => a.id) };
  }

  async parallelExecute(teamId, tasks) {
    const results = [];
    for (const task of tasks) {
      const delegation = await this.delegateTask(teamId, task);
      if (delegation.success) {
        results.push({ taskId: delegation.taskId, status: 'delegated' });
      }
    }
    return { success: true, results };
  }

  recordResult(taskId, result) {
    const task = this.tasks.get(taskId);
    if (!task) return { success: false, error: 'Task not found' };
    task.status = result.success ? 'completed' : 'failed';
    task.result = result;
    task.completedAt = new Date().toISOString();
    this.results.set(taskId, result);
    this.emitter.emit('taskComplete', { taskId, result });
    return { success: true };
  }

  communicate(fromAgent, toAgent, message) {
    this.emitter.emit('agentMessage', { from: fromAgent, to: toAgent, message, timestamp: new Date().toISOString() });
    return { success: true };
  }

  getTeam(teamId) { return this.teams.get(teamId); }
  getTask(taskId) { return this.tasks.get(taskId); }
  getStats() {
    let completed = 0, failed = 0;
    for (const task of this.tasks.values()) {
      if (task.status === 'completed') completed++;
      if (task.status === 'failed') failed++;
    }
    return { teams: this.teams.size, tasks: this.tasks.size, completed, failed };
  }
}

module.exports = AgentTeams;
