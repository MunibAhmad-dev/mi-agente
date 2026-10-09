const { Tool } = require('@librechat/agents/langchain/tools');
const { BackgroundProcess } = require('~/server/services/ProcessManager');

const backgroundExecJsonSchema = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      minLength: 1,
      description: 'The command to execute in the background.',
    },
    args: {
      type: 'array',
      items: { type: 'string' },
      description: 'Arguments for the command.',
    },
    cwd: {
      type: 'string',
      description: 'Working directory. Defaults to process cwd.',
    },
    timeout: {
      type: 'integer',
      minimum: 0,
      description: 'Timeout in milliseconds. 0 = no timeout.',
    },
  },
  required: ['command'],
};

/**
 * BackgroundExec — Execute a command in the background with streaming output.
 *
 * Spawns a long-running process and returns its process ID immediately.
 * Use MonitorProcess to check status and retrieve output.
 */
class BackgroundExec extends Tool {
  static lc_name() {
    return 'background_exec';
  }

  static get jsonSchema() {
    return backgroundExecJsonSchema;
  }

  constructor(fields = {}) {
    super(fields);
    this.name = 'background_exec';
    this.description =
      'Execute a command in the background (non-blocking). Returns a process ID immediately. ' +
      'Use monitor_process to check status and retrieve output. Useful for long-running tasks ' +
      'like builds, tests, and servers.';
    this.schema = backgroundExecJsonSchema;
  }

  async _call(input) {
    const { command, args = [], cwd, timeout = 0 } = input;
    if (!command) {
      throw new Error('command is required');
    }
    const proc = BackgroundProcess.spawnBackground({
      command,
      args: Array.isArray(args) ? args : [String(args)],
      cwd,
      timeout,
    });
    return JSON.stringify({
      process_id: proc.id,
      pid: proc.pid,
      command,
      args,
      status: proc.status,
    });
  }
}

module.exports = BackgroundExec;
