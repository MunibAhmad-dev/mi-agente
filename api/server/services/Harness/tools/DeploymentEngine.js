'use strict';

/**
 * DeploymentEngine - Deploy via Docker or SSH
 */
class DeploymentEngine {
  constructor(config = {}) {
    this.docker = null;
    this.ssh = null;
    this.deployments = new Map();
  }

  async initialize() {
    try {
      const Docker = require('dockerode');
      this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async deployDocker(config) {
    const { name, image, ports = [], env = {}, volumes = [] } = config;
    try {
      if (!this.docker) return { success: false, error: 'Docker not available' };
      const container = await this.docker.createContainer({
        Image: image,
        name,
        Env: Object.entries(env).map(([k, v]) => `${k}=${v}`),
        ExposedPorts: {},
        HostConfig: {
          PortBindings: ports.reduce((acc, p) => {
            acc[`${p}/tcp`] = [{ HostPort: String(p) }];
            return acc;
          }, {}),
          Binds: volumes,
        },
      });
      await container.start();
      const info = await container.inspect();
      const deployment = {
        id: info.Id.substring(0, 12),
        name,
        image,
        status: 'running',
        created: new Date().toISOString(),
      };
      this.deployments.set(deployment.id, deployment);
      return { success: true, ...deployment };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async deploySSH(config) {
    const { host, username, commands = [], privateKey } = config;
    try {
      const { NodeSSH } = require('node-ssh');
      const ssh = new NodeSSH();
      await ssh.connect({ host, username, privateKey });
      const results = [];
      for (const cmd of commands) {
        const result = await ssh.execCommand(cmd);
        results.push({ command: cmd, stdout: result.stdout, stderr: result.stderr, code: result.code });
      }
      ssh.dispose();
      const deployment = {
        id: `ssh_${Date.now()}`,
        host,
        status: results.every(r => r.code === 0) ? 'success' : 'failed',
        results,
        created: new Date().toISOString(),
      };
      this.deployments.set(deployment.id, deployment);
      return { success: true, ...deployment };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async listContainers() {
    if (!this.docker) return { success: false, error: 'Docker not available' };
    try {
      const containers = await this.docker.listContainers({ all: true });
      return { success: true, containers: containers.map(c => ({
        id: c.Id.substring(0, 12), name: c.Names[0], image: c.Image, status: c.Status, state: c.State,
      }))};
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async stopContainer(id) {
    if (!this.docker) return { success: false, error: 'Docker not available' };
    try {
      const container = this.docker.getContainer(id);
      await container.stop();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async rollback(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) return { success: false, error: 'Deployment not found' };
    if (deployment.image) {
      return this.deployDocker({ name: deployment.name, image: deployment.image });
    }
    return { success: true, message: 'Rollback noted (manual action may be needed)' };
  }

  getStats() {
    return { deployments: this.deployments.size, hasDocker: !!this.docker };
  }
}

module.exports = DeploymentEngine;
