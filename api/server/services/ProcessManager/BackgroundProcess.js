/**
 * BackgroundProcess — Background command execution with streaming output.
 *
 * Spawns long-running commands in the background, captures stdout/stderr
 * with streaming, and supports cancellation. Integrates with EventBus to
 * emit output events that the agent UI can subscribe to.
 *
 * License: MIT
 */

const { spawn } = require('child_process');
const path = require('path');
const EventBusPath = path.join(__dirname, '..', 'EventBus');
const { getEventBus } = require(EventBusPath);

const _processes = new Map();

/**
 * Spawn a background process.
 * @param {object} opts
 * @param {string} opts.command - command to run
 * @param {string[]} [opts.args=[]] - arguments
 * @param {string} [opts.cwd] - working directory
 * @param {object} [opts.env] - environment variables
 * @param {number} [opts.timeout=0] - timeout in ms (0 = no timeout)
 * @returns {{id: string, pid: number, output: string[], cancel: function, status: string}}
 */
function spawnBackground(opts = {}) {
  const id = `bg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const command = opts.command;
  const args = opts.args || [];
  const cwd = opts.cwd || process.cwd();
  const env = opts.env || process.env;
  const timeout = opts.timeout || 0;

  if (!command) {
    throw new Error('BackgroundProcess.spawnBackground: command is required');
  }

  let eventBus;
  try {
    eventBus = getEventBus();
  } catch {
    eventBus = null;
  }

  const child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  const output = [];
  let status = 'running';
  let timer = null;

  const record = { id, pid: child.pid, output, status, command, args, cwd };

  const handleData = (stream, data) => {
    const text = data.toString();
    output.push({ stream, text, at: Date.now() });
    if (eventBus) {
      eventBus.publish('process.output', { id, stream, text }, 'BackgroundProcess');
    }
  };

  child.stdout.on('data', (d) => handleData('stdout', d));
  child.stderr.on('data', (d) => handleData('stderr', d));

  child.on('exit', (code, signal) => {
    if (code === 0) {
      status = 'completed';
    } else if (code != null) {
      status = 'failed';
    } else {
      status = 'killed';
    }
    record.status = status;
    record.exitCode = code;
    record.signal = signal;
    if (timer) clearTimeout(timer);
    if (eventBus) {
      eventBus.publish('process.exit', { id, status, exitCode: code, signal }, 'BackgroundProcess');
    }
    _processes.delete(id);
  });

  child.on('error', (err) => {
    status = 'error';
    record.status = status;
    record.error = err.message;
    output.push({ stream: 'error', text: err.message, at: Date.now() });
    if (eventBus) {
      eventBus.publish('process.error', { id, error: err.message }, 'BackgroundProcess');
    }
    _processes.delete(id);
  });

  if (timeout > 0) {
    timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
        status = 'timeout';
        record.status = status;
      } catch {
        // ignore
      }
    }, timeout);
  }

  record.cancel = () => {
    try {
      child.kill('SIGTERM');
      status = 'cancelled';
      record.status = status;
    } catch {
      // ignore
    }
  };

  _processes.set(id, record);
  return record;
}

/**
 * Get a background process by id.
 * @param {string} id
 * @returns {object|null}
 */
function getProcess(id) {
  return _processes.get(id) || null;
}

/**
 * List active background processes.
 * @returns {Array}
 */
function listProcesses() {
  return Array.from(_processes.values());
}

/**
 * Cancel a background process.
 * @param {string} id
 * @returns {boolean}
 */
function cancel(id) {
  const proc = _processes.get(id);
  if (proc && proc.cancel) {
    proc.cancel();
    return true;
  }
  return false;
}

/**
 * Get output for a process.
 * @param {string} id
 * @returns {Array|null}
 */
function getOutput(id) {
  const proc = _processes.get(id);
  return proc ? proc.output : null;
}

module.exports = {
  spawnBackground,
  getProcess,
  listProcesses,
  cancel,
  getOutput,
};
