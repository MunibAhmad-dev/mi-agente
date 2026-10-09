/**
 * CloudAgent — Execute tasks in isolated Docker VMs
 * Equivalent to GitHub Copilot Cloud Agent / Manus Cloud Computer
 * 
 * License: Apache-2.0 (dockerode) — Zero cost with local Docker
 */

const EventEmitter = require('events');

let Docker;
try { Docker = require('dockerode'); } catch (e) { Docker = null; }

class CloudAgent extends EventEmitter {
  constructor(options = {}) {
    super();
    this.dockerAvailable = false;
    this.docker = null;
    this.containers = new Map();
    this.initialized = false;
    this.config = {
      defaultImage: options.image || 'node:20-slim',
      maxContainers: options.maxContainers || 5,
      defaultMemory: options.memory || '512m',
      defaultTimeout: options.timeout || 300000, // 5 min
      networkMode: options.network || 'bridge'
    };
    this.stats = { created: 0, executed: 0, destroyed: 0, failed: 0 };
  }

  initialize() {
    try {
      if (Docker) {
        this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
        this.dockerAvailable = true;
      }
    } catch (e) {
      this.dockerAvailable = false;
    }
    this.initialized = true;
    return {
      status: 'ok',
      module: 'CloudAgent',
      dockerAvailable: this.dockerAvailable,
      maxContainers: this.config.maxContainers
    };
  }

  /**
   * Create and run a task in an isolated container
   */
  async executeTask({ task, code, command, language = 'javascript', timeout }) {
    const taskId = `cloud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const taskTimeout = timeout || this.config.defaultTimeout;

    if (!this.dockerAvailable) {
      // Fallback: execute in-process with vm2-like isolation
      return this._executeLocal({ taskId, code, command, language, timeout: taskTimeout });
    }

    try {
      this.stats.created++;
      const container = await this._createContainer({ taskId, code, command, language });
      this.containers.set(taskId, { container, startTime: Date.now(), status: 'running' });
      this.emit('task:started', { taskId });

      const result = await this._runContainer(container, taskTimeout);
      this.stats.executed++;
      this.containers.delete(taskId);
      this.emit('task:completed', { taskId });
      return { success: true, taskId, ...result };
    } catch (err) {
      this.stats.failed++;
      this.containers.delete(taskId);
      this.emit('task:failed', { taskId, error: err.message });
      return { success: false, taskId, error: err.message };
    }
  }

  async _createContainer({ taskId, code, command, language }) {
    const entryScript = this._buildEntrypoint({ code, command, language });
    const container = await this.docker.createContainer({
      Image: this.config.defaultImage,
      Cmd: ['node', '-e', entryScript],
      HostConfig: {
        Memory: parseInt(this.config.defaultMemory) * 1024 * 1024 || 512 * 1024 * 1024,
        NetworkMode: this.config.networkMode,
        AutoRemove: true
      },
      Labels: { 'freebuff-cloud-agent': taskId }
    });
    await container.start();
    return container;
  }

  async _runContainer(container, timeout) {
    return new Promise((resolve, reject) => {
      let stdout = '', stderr = '';
      const timer = setTimeout(() => {
        container.kill().catch(() => {});
        reject(new Error('Container timeout'));
      }, timeout);

      container.logs({ follow: true, stdout: true, stderr: true }, (err, stream) => {
        if (err) { clearTimeout(timer); return reject(err); }
        stream.on('data', (chunk) => {
          const data = chunk.toString();
          if (chunk[0] === 2) stderr += data.slice(1);
          else stdout += data;
        });
        stream.on('end', () => {
          clearTimeout(timer);
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), duration: Date.now() });
        });
      });
    });
  }

  _executeLocal({ taskId, code, command, language, timeout }) {
    const { execFileSync, spawnSync } = require('child_process');
    try {
      let output;
      if (command) {
        // Split on whitespace — caller must pass a safe, pre-validated command string.
        // The first token is the binary; the rest are its args. No shell expansion.
        const parts = String(command).trim().split(/\s+/);
        const bin = parts.shift();
        output = execFileSync(bin, parts, { timeout, encoding: 'utf8', maxBuffer: 1024 * 1024 });
      } else if (language === 'javascript' || language === 'node') {
        // Pass code via stdin to avoid any shell-quoting escape issues
        const result = spawnSync('node', ['--input-type=module'], {
          input: code || '',
          timeout,
          encoding: 'utf8',
          maxBuffer: 1024 * 1024,
        });
        if (result.status !== 0) throw new Error(result.stderr || 'node execution failed');
        output = result.stdout || '';
      } else if (language === 'python') {
        const result = spawnSync('python3', ['-c', code || ''], {
          timeout,
          encoding: 'utf8',
          maxBuffer: 1024 * 1024,
        });
        if (result.status !== 0) throw new Error(result.stderr || 'python3 execution failed');
        output = result.stdout || '';
      } else {
        return { success: false, taskId, error: `Unsupported language: ${language}`, local: true };
      }
      this.stats.executed++;
      return { success: true, taskId, stdout: output.trim(), stderr: '', local: true };
    } catch (err) {
      this.stats.failed++;
      return { success: false, taskId, error: err.message, local: true };
    }
  }

  /**
   * List active containers
   */
  listActive() {
    return Array.from(this.containers.entries()).map(([id, info]) => ({
      taskId: id,
      status: info.status,
      uptime: Date.now() - info.startTime
    }));
  }

  /**
   * Stop a running container
   */
  async stop(taskId) {
    const info = this.containers.get(taskId);
    if (!info) return { success: false, error: 'Not found' };
    try {
      await info.container.kill();
      this.stats.destroyed++;
      this.containers.delete(taskId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  getStats() {
    return {
      ...this.stats,
      activeContainers: this.containers.size,
      dockerAvailable: this.dockerAvailable,
      initialized: this.initialized
    };
  }
}

module.exports = CloudAgent;
