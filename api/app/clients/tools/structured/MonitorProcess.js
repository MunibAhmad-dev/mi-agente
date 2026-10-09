const { Tool } = require('@librechat/agents/langchain/tools');
const { BackgroundProcess } = require('~/server/services/ProcessManager');

const monitorProcessJsonSchema = {
  type: 'object',
  properties: {
    process_id: {
      type: 'string',
      minLength: 1,
      description: 'The background process ID to monitor.',
    },
    action: {
      type: 'string',
      enum: ['status', 'output', 'cancel'],
      description: 'Action: check status (default), get output, or cancel the process.',
    },
    tail: {
      type: 'integer',
      minimum: 1,
      description: 'Number of recent output lines to return (default: 50).',
    },
  },
  required: ['process_id'],
};

/**
 * MonitorProcess — Monitor, retrieve output, or cancel a background process.
 */
class MonitorProcess extends Tool {
  static lc_name() {
    return 'monitor_process';
  }

  static get jsonSchema() {
    return monitorProcessJsonSchema;
  }

  constructor(fields = {}) {
    super(fields);
    this.name = 'monitor_process';
    this.description =
      'Monitor a background process: check its status, retrieve output, or cancel it. ' +
      'Use after background_exec to check progress of long-running commands.';
    this.schema = monitorProcessJsonSchema;
  }

  async _call(input) {
    const { process_id, action = 'status', tail = 50 } = input;
    if (!process_id) {
      throw new Error('process_id is required');
    }

    const proc = BackgroundProcess.getProcess(process_id);
    if (!proc) {
      return JSON.stringify({
        process_id,
        found: false,
        message: 'Process not found (may have completed and been cleaned up).',
      });
    }

    if (action === 'cancel') {
      const cancelled = BackgroundProcess.cancel(process_id);
      return JSON.stringify({
        process_id,
        action: 'cancel',
        cancelled,
        status: cancelled ? 'cancelled' : proc.status,
      });
    }

    if (action === 'output') {
      const output = BackgroundProcess.getOutput(process_id) || [];
      const tailed = output.slice(-tail);
      return JSON.stringify({
        process_id,
        status: proc.status,
        total_lines: output.length,
        returned_lines: tailed.length,
        output: tailed,
      });
    }

    // Default: status
    return JSON.stringify({
      process_id,
      pid: proc.pid,
      command: proc.command,
      status: proc.status,
      exit_code: proc.exitCode,
      signal: proc.signal,
      error: proc.error,
      output_lines: proc.output?.length || 0,
    });
  }
}

module.exports = MonitorProcess;
