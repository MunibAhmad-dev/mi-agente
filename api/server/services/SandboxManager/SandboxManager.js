/**
 * SandboxManager Service
 *
 * Sistema de aislamiento para agentes IA.
 * Permite ejecutar operaciones en un entorno sandbox con:
 * - Workspace virtual aislado
 * - Sincronización bidireccional con workspace real
 * - Sistema de promoción de cambios
 * - Límites de recursos
 */

const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const Docker = require('dockerode');
const { logger } = require('@librechat/data-schemas');

// EventBus integration
let eventBus = null;
try {
  const eventBusModule = require('../EventBus');
  eventBus = eventBusModule.getEventBus();
} catch (err) {
  console.warn('[SandboxManager] EventBus not available:', err.message);
}

// Supervisor Event Types
const {
  SupervisorEventTypes,
  createSandboxPayload,
  createCommandPayload,
  createFilePayload,
} = require('../EventBus/SupervisorEventTypes');

const SANDBOX_BASE_PATH = process.env.SANDBOX_BASE_PATH || '/tmp/librechat-sandboxes';
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE || 'ubuntu:22.04';

/**
 * Tipos de estado del sandbox
 */
const SandboxStatus = {
  CREATING: 'creating',
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  ERROR: 'error',
};

/**
 * Tipos de cambios en archivos
 */
const ChangeType = {
  MODIFIED: 'modified',
  ADDED: 'added',
  DELETED: 'deleted',
};

/**
 * Clase principal del SandboxManager
 */
class SandboxManager {
  constructor() {
    this.sandboxes = new Map();
    this.docker = null;
    this.initialized = false;
  }

  /**
   * Inicializar conexión con Docker
   */
  async initialize() {
    if (this.initialized) return;

    try {
      this.docker = new Docker();
      await this.docker.ping();
      logger.info('[SandboxManager] Docker connection established');
      this.initialized = true;
    } catch (error) {
      console.warn('[SandboxManager] Docker not available, using fallback mode:', error.message);
      this.docker = null;
    }
  }

  /**
   * Publicar eventos al EventBus global
   */
  publishToEventBus(eventType, payload, metadata = {}) {
    if (!eventBus) return;

    try {
      eventBus.publish(eventType, payload, 'SandboxManager', {
        metadata: {
          ...metadata,
          service: 'SandboxManager',
        },
      });
    } catch (err) {
      console.error('[SandboxManager] Failed to publish to EventBus:', err.message);
    }
  }

  /**
   * Crear un nuevo sandbox para una sesión
   * @param {Object} params - Parámetros de creación
   * @param {string} params.sessionId - ID de la sesión
   * @param {string} params.userId - ID del usuario
   * @param {string} params.workspacePath - Ruta del workspace a copiar
   * @param {Object} params.resources - Límites de recursos
   * @returns {Promise<Object>} Sandbox creado
   */
  async createSandbox({ sessionId, userId, workspacePath, resources = {} }) {
    await this.initialize();

    const sandboxId = `sbx_${sessionId}_${uuidv4().slice(0, 8)}`;
    const sandboxPath = path.join(SANDBOX_BASE_PATH, sandboxId);
    const changesPath = path.join(sandboxPath, '.changes');

    const sandbox = {
      id: sandboxId,
      sessionId,
      userId,
      status: SandboxStatus.CREATING,
      createdAt: new Date(),
      workspacePath,
      sandboxPath,
      changesPath,
      containerId: null,
      resources: {
        cpu: resources.cpu || '1',
        memory: resources.memory || '512m',
        timeout: resources.timeout || 3600,
      },
      files: {
        tracked: new Map(),
        modified: new Map(),
        pending: [],
      },
      terminal: {
        history: [],
        running: false,
      },
    };

    try {
      // Crear directorio del sandbox
      await fs.mkdir(sandboxPath, { recursive: true });
      await fs.mkdir(changesPath, { recursive: true });

      // Copiar workspace si existe
      if (workspacePath && (await this.exists(workspacePath))) {
        await this.copyDirectory(workspacePath, path.join(sandboxPath, 'workspace'));
        sandbox.workspacePath = path.join(sandboxPath, 'workspace');
      } else {
        // Crear workspace vacío
        await fs.mkdir(path.join(sandboxPath, 'workspace'), { recursive: true });
        sandbox.workspacePath = path.join(sandboxPath, 'workspace');
      }

      // Escanear archivos iniciales
      sandbox.files.tracked = await this.scanFiles(sandbox.workspacePath);

      // Crear container Docker si está disponible
      if (this.docker) {
        sandbox.containerId = await this.createDockerContainer(sandbox);
      }

      sandbox.status = SandboxStatus.READY;
      this.sandboxes.set(sandboxId, sandbox);

      logger.info(`[SandboxManager] Created sandbox: ${sandboxId}`);

      // Publicar evento de sandbox creado
      this.publishToEventBus(SupervisorEventTypes.SANDBOX_CREATED, {
        sandboxId,
        sessionId,
        userId,
        workspacePath: sandbox.workspacePath,
        status: sandbox.status,
      });

      return this.formatSandbox(sandbox);
    } catch (error) {
      sandbox.status = SandboxStatus.ERROR;
      sandbox.error = error.message;
      console.error(`[SandboxManager] Error creating sandbox ${sandboxId}:`, error);
      throw error;
    }
  }

  /**
   * Crear container Docker para el sandbox
   */
  async createDockerContainer(sandbox) {
    if (!this.docker) return null;

    try {
      // Verificar si la imagen existe, si no descargarla
      try {
        await this.docker.getImage(SANDBOX_IMAGE).inspect();
      } catch {
        logger.info(`[SandboxManager] Pulling image ${SANDBOX_IMAGE}...`);
        await new Promise((resolve, reject) => {
          this.docker.pull(SANDBOX_IMAGE, (err, stream) => {
            if (err) return reject(err);
            this.docker.modem.followProgress(stream, (err, output) => {
              if (err) return reject(err);
              resolve(output);
            });
          });
        });
      }

      const container = await this.docker.createContainer({
        Image: SANDBOX_IMAGE,
        Cmd: ['sleep', 'infinity'],
        HostConfig: {
          Binds: [`${sandbox.sandboxPath}:/workspace:rw`],
          Memory: this.parseMemory(sandbox.resources.memory),
          NanoCpus: parseInt(sandbox.resources.cpu) * 1e9,
          NetworkMode: 'bridge',
          ReadonlyRootfs: false,
        },
        Env: [`SANDBOX_ID=${sandbox.id}`, `SESSION_ID=${sandbox.sessionId}`],
      });

      await container.start();
      logger.info(`[SandboxManager] Docker container created: ${container.id.slice(0, 12)}`);
      return container.id;
    } catch (error) {
      console.warn('[SandboxManager] Docker container creation failed:', error.message);
      return null;
    }
  }

  /**
   * Obtener estado de un sandbox
   */
  async getSandboxStatus(sandboxId) {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      return { found: false, error: 'Sandbox not found' };
    }

    // Verificar estado del container si existe
    if (sandbox.containerId && this.docker) {
      try {
        const container = this.docker.getContainer(sandbox.containerId);
        const info = await container.inspect();
        if (!info.State.Running) {
          sandbox.status = SandboxStatus.STOPPED;
        }
      } catch (error) {
        console.warn(`[SandboxManager] Container check failed for ${sandboxId}:`, error.message);
      }
    }

    return {
      found: true,
      status: sandbox.status,
      containerId: sandbox.containerId,
      uptime: Date.now() - sandbox.createdAt.getTime(),
    };
  }

  /**
   * Ejecutar comando en el sandbox
   */
  async executeInSandbox(sandboxId, command, options = {}) {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error('Sandbox not found');
    }

    if (sandbox.status !== SandboxStatus.READY && sandbox.status !== SandboxStatus.RUNNING) {
      throw new Error(`Sandbox not ready: ${sandbox.status}`);
    }

    const executionId = uuidv4();
    const timeout = options.timeout || sandbox.resources.timeout * 1000;

    try {
      let result;

      if (sandbox.containerId && this.docker) {
        // Ejecutar en Docker
        result = await this.executeInDocker(sandbox, command, timeout);
      } else {
        // Docker not available — refuse to execute on the host for security.
        throw new Error(
          'Sandbox execution refused: Docker is not available. ' +
          'Commands cannot run on the host process. Start Docker and retry.',
        );
      }

      // Registrar en historial
      sandbox.terminal.history.push({
        id: executionId,
        command,
        result,
        timestamp: new Date(),
      });

      // Limitar historial a últimos 100
      if (sandbox.terminal.history.length > 100) {
        sandbox.terminal.history = sandbox.terminal.history.slice(-100);
      }

      // Publicar evento de comando ejecutado
      this.publishToEventBus(
        SupervisorEventTypes.SANDBOX_COMMAND_EXECUTED,
        {
          sandboxId,
          executionId,
          command,
          exitCode: result.exitCode,
          success: result.success,
          duration: result.duration,
        },
        { sessionId: sandbox.sessionId, userId: sandbox.userId },
      );

      // Verificar cambios después de ejecutar
      await this.detectChanges(sandboxId);

      return result;
    } catch (error) {
      // Publicar evento de error de comando
      this.publishToEventBus(
        SupervisorEventTypes.SANDBOX_COMMAND_ERROR,
        {
          sandboxId,
          executionId,
          command,
          error: error.message,
        },
        { sessionId: sandbox.sessionId, userId: sandbox.userId },
      );

      return {
        executionId,
        success: false,
        error: error.message,
        stdout: '',
        stderr: error.stack,
        exitCode: -1,
        duration: 0,
      };
    }
  }

  /**
   * Ejecutar comando en Docker
   */
  async executeInDocker(sandbox, command, timeout) {
    const container = this.docker.getContainer(sandbox.containerId);
    const startTime = Date.now();

    const exec = await container.exec({
      Cmd: ['bash', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });

    const stream = await exec.start({ hijack: true, stdin: false });

    let stdout = '';
    let stderr = '';

    await new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        stream.destroy();
        reject(new Error('Command timeout'));
      }, timeout);

      stream.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      stream.on('error', (err) => {
        stderr += err.toString();
      });

      stream.on('end', () => {
        clearTimeout(timeoutHandle);
        resolve();
      });
    });

    const info = await exec.inspect();
    const duration = Date.now() - startTime;

    return {
      executionId: uuidv4(),
      success: info.ExitCode === 0,
      stdout,
      stderr,
      exitCode: info.ExitCode,
      duration,
    };
  }

  /**
   * Ejecutar comando localmente (fallback)
   */
  async executeLocally(sandbox, command, timeout) {
    const { exec } = require('child_process');
    const startTime = Date.now();

    return new Promise((resolve) => {
      exec(
        command,
        { cwd: sandbox.workspacePath, timeout, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          resolve({
            executionId: uuidv4(),
            success: !error,
            stdout,
            stderr,
            exitCode: error?.code || 0,
            duration: Date.now() - startTime,
          });
        },
      );
    });
  }

  /**
   * Leer archivo del sandbox
   */
  async readFile(sandboxId, filePath) {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error('Sandbox not found');
    }

    const fullPath = this.resolveSandboxPath(sandbox, filePath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const stats = await fs.stat(fullPath);

      return {
        success: true,
        path: filePath,
        content,
        size: stats.size,
        modified: stats.mtime,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Escribir archivo en el sandbox
   */
  async writeFile(sandboxId, filePath, content) {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error('Sandbox not found');
    }

    const fullPath = this.resolveSandboxPath(sandbox, filePath);

    try {
      // Asegurar que el directorio existe
      await fs.mkdir(path.dirname(fullPath), { recursive: true });

      // Leer contenido anterior para comparar
      let oldContent = '';
      try {
        oldContent = await fs.readFile(fullPath, 'utf-8');
      } catch {
        // Archivo nuevo
      }

      // Escribir nuevo contenido
      await fs.writeFile(fullPath, content, 'utf-8');

      // Registrar cambio
      const changeType = oldContent ? ChangeType.MODIFIED : ChangeType.ADDED;
      await this.recordChange(sandbox, filePath, changeType, oldContent, content);

      return {
        success: true,
        path: filePath,
        changeType,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Listar archivos modificados
   */
  async getModifiedFiles(sandboxId, options = {}) {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error('Sandbox not found');
    }

    const changes = [];
    for (const [filePath, change] of sandbox.files.modified) {
      changes.push({
        path: filePath,
        type: change.type,
        oldSize: change.oldContent?.length || 0,
        newSize: change.newContent?.length || 0,
        modifiedAt: change.modifiedAt,
        staged: change.staged || false,
      });
    }

    // Filtrar y ordenar
    let result = changes;
    if (options.type) {
      result = result.filter((c) => c.type === options.type);
    }
    if (options.staged !== undefined) {
      result = result.filter((c) => c.staged === options.staged);
    }

    return result.sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  /**
   * Detectar cambios en archivos
   */
  async detectChanges(sandboxId) {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) return [];

    const currentFiles = await this.scanFiles(sandbox.workspacePath);
    const changes = [];

    for (const [filePath, currentInfo] of currentFiles) {
      const trackedInfo = sandbox.files.tracked.get(filePath);

      if (!trackedInfo) {
        // Archivo nuevo
        changes.push({ path: filePath, type: ChangeType.ADDED });
        sandbox.files.modified.set(filePath, {
          type: ChangeType.ADDED,
          newContent: await this.readFileContent(path.join(sandbox.workspacePath, filePath)),
          modifiedAt: new Date(),
        });
      } else if (trackedInfo.hash !== currentInfo.hash) {
        // Archivo modificado
        changes.push({ path: filePath, type: ChangeType.MODIFIED });
        const newContent = await this.readFileContent(path.join(sandbox.workspacePath, filePath));
        sandbox.files.modified.set(filePath, {
          type: ChangeType.MODIFIED,
          oldContent: trackedInfo.content,
          newContent,
          modifiedAt: new Date(),
        });
      }
    }

    // Detectar archivos eliminados
    for (const [filePath, trackedInfo] of sandbox.files.tracked) {
      if (!currentFiles.has(filePath)) {
        changes.push({ path: filePath, type: ChangeType.DELETED });
        sandbox.files.modified.set(filePath, {
          type: ChangeType.DELETED,
          oldContent: trackedInfo.content,
          modifiedAt: new Date(),
        });
      }
    }

    return changes;
  }

  /**
   * Preparar cambio para promoción (staging)
   */
  async stageChange(sandboxId, filePaths) {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error('Sandbox not found');
    }

    const staged = [];
    for (const filePath of filePaths) {
      const change = sandbox.files.modified.get(filePath);
      if (change) {
        change.staged = true;
        staged.push(filePath);

        // Copiar a carpeta de cambios pendientes
        const changeFile = path.join(sandbox.changesPath, path.basename(filePath));
        await fs.writeFile(
          changeFile + '.meta.json',
          JSON.stringify({ originalPath: filePath, ...change }, null, 2),
        );

        // Publicar evento de archivo staged
        this.publishToEventBus(
          SupervisorEventTypes.SANDBOX_FILE_STAGED,
          {
            sandboxId,
            filePath,
            changeType: change.type,
          },
          { sessionId: sandbox.sessionId, userId: sandbox.userId },
        );
      }
    }

    return { staged, count: staged.length };
  }

  /**
   * Promover cambios al workspace real
   */
  async promoteChanges(sandboxId, filePaths, options = {}) {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error('Sandbox not found');
    }

    const promoted = [];
    const errors = [];

    for (const filePath of filePaths) {
      const change = sandbox.files.modified.get(filePath);

      if (!change) {
        errors.push({ filePath, error: 'Change not found' });
        continue;
      }

      try {
        const targetPath = options.targetPath || sandbox.workspacePath;
        const fullTargetPath = path.join(targetPath, filePath);

        if (change.type === ChangeType.DELETED) {
          // Eliminar archivo
          await fs.unlink(fullTargetPath);
        } else {
          // Asegurar directorio y escribir
          await fs.mkdir(path.dirname(fullTargetPath), { recursive: true });
          await fs.writeFile(fullTargetPath, change.newContent, 'utf-8');
        }

        // Limpiar de modificaciones pendientes
        sandbox.files.modified.delete(filePath);

        // Publicar evento de archivo promovido
        this.publishToEventBus(
          SupervisorEventTypes.SANDBOX_FILE_PROMOTED,
          {
            sandboxId,
            filePath,
            changeType: change.type,
            targetPath: fullTargetPath,
          },
          { sessionId: sandbox.sessionId, userId: sandbox.userId },
        );

        promoted.push(filePath);
      } catch (error) {
        errors.push({ filePath, error: error.message });
      }
    }

    // Limpiar los que se promovieron
    for (const filePath of promoted) {
      sandbox.files.modified.delete(filePath);
    }

    return {
      promoted,
      errors,
      count: promoted.length,
    };
  }

  /**
   * Descartar cambios
   */
  async discardChanges(sandboxId, filePaths = null) {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error('Sandbox not found');
    }

    const discarded = [];

    // Si no se especifican archivos, descartar todos
    const filesToDiscard = filePaths || Array.from(sandbox.files.modified.keys());

    for (const filePath of filesToDiscard) {
      const change = sandbox.files.modified.get(filePath);
      if (change) {
        sandbox.files.modified.delete(filePath);
        discarded.push(filePath);

        // Publicar evento de archivo descartado
        this.publishToEventBus(
          SupervisorEventTypes.SANDBOX_FILE_DISCARDED,
          {
            sandboxId,
            filePath,
            changeType: change.type,
          },
          { sessionId: sandbox.sessionId, userId: sandbox.userId },
        );
      }
    }

    return { discarded, count: discarded.length };
  }

  /**
   * Destruir sandbox
   */
  async destroySandbox(sandboxId) {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error('Sandbox not found');
    }

    try {
      // Detener container si existe
      if (sandbox.containerId && this.docker) {
        const container = this.docker.getContainer(sandbox.containerId);
        await container.stop();
        await container.remove();
      }

      // Eliminar directorio del sandbox
      await fs.rm(sandbox.sandboxPath, { recursive: true, force: true });

      // Publicar evento de sandbox destruido
      this.publishToEventBus(
        SupervisorEventTypes.SANDBOX_DESTROYED,
        {
          sandboxId,
          sessionId: sandbox.sessionId,
          userId: sandbox.userId,
        },
        { sessionId: sandbox.sessionId, userId: sandbox.userId },
      );

      this.sandboxes.delete(sandboxId);
      logger.info(`[SandboxManager] Destroyed sandbox: ${sandboxId}`);

      return { success: true };
    } catch (error) {
      console.error(`[SandboxManager] Error destroying sandbox ${sandboxId}:`, error);
      throw error;
    }
  }

  /**
   * Obtener historial de eventos del sandbox
   */
  getSandboxHistory(sandboxId, limit = 100) {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      return [];
    }
    return sandbox.events || [];
  }

  // ============ Métodos auxiliares ============

  /**
   * Resolver ruta dentro del sandbox con confinamiento estricto.
   * Throws if the resolved path escapes the workspace root.
   */
  resolveSandboxPath(sandbox, filePath) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path');
    }
    const workspaceRoot = path.resolve(sandbox.workspacePath);
    const resolved = path.resolve(workspaceRoot, filePath);
    // The resolved path must start with workspaceRoot + sep (or equal it exactly)
    const confined = resolved === workspaceRoot || resolved.startsWith(workspaceRoot + path.sep);
    if (!confined) {
      throw new Error(`Path traversal blocked: "${filePath}" escapes sandbox confinement`);
    }
    return resolved;
  }

  /**
   * Verificar si existe archivo/directorio
   */
  async exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Copiar directorio recursivamente
   */
  async copyDirectory(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Escanear archivos y calcular hashes
   */
  async scanFiles(dirPath, basePath = '') {
    const files = new Map();

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        // Ignorar archivos ocultos y node_modules
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

        const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          const subFiles = await this.scanFiles(fullPath, relativePath);
          for (const [p, info] of subFiles) {
            files.set(p, info);
          }
        } else {
          const content = await this.readFileContent(fullPath);
          files.set(relativePath, {
            path: relativePath,
            size: content.length,
            hash: this.simpleHash(content),
            content,
          });
        }
      }
    } catch (error) {
      console.warn(`[SandboxManager] Error scanning ${dirPath}:`, error.message);
    }

    return files;
  }

  /**
   * Leer contenido de archivo
   */
  async readFileContent(filePath) {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  /**
   * Calcular hash simple
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Registrar cambio en historial
   */
  async recordChange(sandbox, filePath, type, oldContent, newContent) {
    sandbox.files.modified.set(filePath, {
      type,
      oldContent: oldContent || '',
      newContent: newContent || '',
      modifiedAt: new Date(),
      staged: false,
    });
  }

  /**
   * Formatear sandbox para respuesta JSON
   */
  formatSandbox(sandbox) {
    return {
      id: sandbox.id,
      sessionId: sandbox.sessionId,
      userId: sandbox.userId,
      status: sandbox.status,
      createdAt: sandbox.createdAt,
      workspacePath: sandbox.workspacePath,
      sandboxPath: sandbox.sandboxPath,
      containerId: sandbox.containerId,
      resources: sandbox.resources,
      changesCount: sandbox.files.modified.size,
    };
  }

  /**
   * Parsear string de memoria a bytes
   */
  parseMemory(memStr) {
    const match = memStr.match(/^(\d+)([kmg]?)$/i);
    if (!match) return 512 * 1024 * 1024; // default 512MB

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 'k':
        return value * 1024;
      case 'm':
        return value * 1024 * 1024;
      case 'g':
        return value * 1024 * 1024 * 1024;
      default:
        return value;
    }
  }

  /**
   * Listar todos los sandboxes de un usuario
   */
  async listSandboxes(userId) {
    const userSandboxes = [];
    for (const [id, sandbox] of this.sandboxes) {
      if (sandbox.userId === userId) {
        userSandboxes.push(this.formatSandbox(sandbox));
      }
    }
    return userSandboxes;
  }

  /**
   * Obtener terminal history
   */
  async getTerminalHistory(sandboxId) {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error('Sandbox not found');
    }
    return sandbox.terminal.history;
  }
}

// Singleton
const sandboxManager = new SandboxManager();

module.exports = {
  SandboxManager,
  sandboxManager,
  SandboxStatus,
  ChangeType,
};
