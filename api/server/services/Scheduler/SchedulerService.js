/**
 * Scheduler Service
 * =================
 * Sistema de scheduling para tareas periódicas y programadas
 *
 * Características:
 * - Tareas periódicas (CRON)
 * - Tareas delayed (una vez)
 * - Cola de tareas con retry
 * - Persistencia en Redis
 *
 * @example
 * const scheduler = require('./SchedulerService');
 *
 * // Tarea periódica cada 5 minutos (cron: cada 5 min)
 * scheduler.addRecurringTask('cleanup', 'EVERY_5_MINUTES', async () => {
 *   await cleanupOldData();
 * });
 *
 * // Tarea delayed
 * scheduler.addDelayedTask('notify', 60000, async () => {
 *   await sendNotification();
 * });
 */

const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { getLogStores } = require('~/cache');

function getScheduledJobModel() {
  if (mongoose.models.ScheduledJob) {
    return mongoose.models.ScheduledJob;
  }
  try {
    return require('~/models/ScheduledJob');
  } catch {
    return null;
  }
}

const TASK_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

const TASK_COLLECTION = 'scheduled_tasks';
const TASK_LOCK_TTL = 300; // 5 minutes lock

/**
 * Parser de CRON simple
 */
function parseCronExpression(expression) {
  const parts = expression.split(' ');
  if (parts.length !== 5) {
    throw new Error('Invalid CRON expression. Expected 5 parts: minute hour day month weekday');
  }

  const [minute, hour, day, month, weekday] = parts;

  return {
    minute: parseCronField(minute, 0, 59),
    hour: parseCronField(hour, 0, 23),
    day: parseCronField(day, 1, 31),
    month: parseCronField(month, 1, 12),
    weekday: parseCronField(weekday, 0, 6),
  };
}

function parseCronField(field, min, max) {
  if (field === '*') {
    return { type: 'any', min, max };
  }

  if (field.includes('/')) {
    const [range, step] = field.split('/');
    return {
      type: 'step',
      min: range === '*' ? min : parseInt(range),
      max,
      step: parseInt(step),
    };
  }

  if (field.includes(',')) {
    return {
      type: 'list',
      values: field.split(',').map((v) => parseInt(v)),
    };
  }

  if (field.includes('-')) {
    const [start, end] = field.split('-');
    return {
      type: 'range',
      start: parseInt(start),
      end: parseInt(end),
    };
  }

  return {
    type: 'fixed',
    value: parseInt(field),
  };
}

function matchesCronField(value, field) {
  switch (field.type) {
    case 'any':
      return true;
    case 'fixed':
      return value === field.value;
    case 'range':
      return value >= field.start && value <= field.end;
    case 'step':
      return (value - field.min) % field.step === 0;
    case 'list':
      return field.values.includes(value);
    default:
      return false;
  }
}

function shouldRunNow(cron, date = new Date()) {
  return (
    matchesCronField(date.getMinutes(), cron.minute) &&
    matchesCronField(date.getHours(), cron.hour) &&
    matchesCronField(date.getDate(), cron.day) &&
    matchesCronField(date.getMonth() + 1, cron.month) &&
    matchesCronField(date.getDay(), cron.weekday)
  );
}

/**
 * Calcula el próximo tick de una expresión CRON
 */
function getNextCronTick(cron, fromDate = new Date()) {
  let date = new Date(fromDate);
  date.setSeconds(0);
  date.setMilliseconds(0);
  date.setMinutes(date.getMinutes() + 1);

  const maxIterations = 366 * 24 * 60; // 1 year of minutes max

  for (let i = 0; i < maxIterations; i++) {
    if (shouldRunNow(cron, date)) {
      return date;
    }
    date.setMinutes(date.getMinutes() + 1);
  }

  return null;
}

/**
 * Scheduler Service
 */
class SchedulerService {
  constructor() {
    /** @type {Map<string, {id: string, cron: object, handler: Function, lastRun: Date|null, nextRun: Date|null}>} */
    this.recurringTasks = new Map();

    /** @type {Map<string, {id: string, delay: number, handler: Function, scheduledAt: Date}>} */
    this.delayedTasks = new Map();

    /** @type {NodeJS.Timeout|null} */
    this.tickInterval = null;

    /** @type {boolean} */
    this.isRunning = false;

    /** @type {Redis|undefined} */
    this.cache = undefined;
  }

  /**
   * Inicializa el scheduler
   */
  async initialize() {
    if (this.isRunning) {
      return;
    }

    try {
      this.cache = getLogStores(TASK_COLLECTION);
      logger.info('[SchedulerService] Initialized');

      // Cargar tareas persistidas
      await this.loadPersistedTasks();

      // Iniciar tick
      this.startTick();

      this.isRunning = true;
    } catch (error) {
      logger.error('[SchedulerService] Failed to initialize', error);
    }
  }

  /**
   * Carga tareas persistidas desde Redis
   */
  async loadPersistedTasks() {
    let loadedFromRedis = false;

    if (this.cache) {
      try {
        const taskIds = await this.cache.keys('task:*');
        for (const taskId of taskIds) {
          const task = await this.cache.get(taskId);
          if (task) {
            const parsed = JSON.parse(task);
            if (parsed.type === 'recurring') {
              this.recurringTasks.set(parsed.id, {
                id: parsed.id,
                cron: parseCronExpression(parsed.cronExpression),
                handler: null,
                lastRun: null,
                nextRun: getNextCronTick(parseCronExpression(parsed.cronExpression)),
              });
              loadedFromRedis = true;
            }
          }
        }
      } catch (error) {
        logger.warn('[SchedulerService] Failed to load persisted tasks from Redis', error);
      }
    }

    if (!loadedFromRedis) {
      const ScheduledJob = getScheduledJobModel();
      if (ScheduledJob) {
        try {
          const jobs = await ScheduledJob.find({ active: true }).lean();
          for (const job of jobs) {
            if (job.expression && !this.recurringTasks.has(job.jobId)) {
              try {
                const cron = parseCronExpression(job.expression);
                this.recurringTasks.set(job.jobId, {
                  id: job.jobId,
                  cron,
                  handler: null,
                  lastRun: job.lastRun || null,
                  nextRun: getNextCronTick(cron),
                });
              } catch {
                logger.warn(`[SchedulerService] Invalid cron for job ${job.jobId}: ${job.expression}`);
              }
            }
          }
          logger.info(`[SchedulerService] Loaded ${jobs.length} jobs from Mongo`);
        } catch (error) {
          logger.warn('[SchedulerService] Failed to load persisted tasks from Mongo', error);
        }
      }
    }
  }

  /**
   * Inicia el loop de tick
   */
  startTick() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
    }

    this.tickInterval = setInterval(() => this.tick(), 60000); // Cada minuto
    logger.info('[SchedulerService] Tick started (every 60 seconds)');
  }

  /**
   * Detiene el scheduler
   */
  stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.isRunning = false;
    logger.info('[SchedulerService] Stopped');
  }

  /**
   * Tick principal
   */
  async tick() {
    const now = new Date();

    // Ejecutar tareas recurrentes
    for (const [taskId, task] of this.recurringTasks) {
      if (task.nextRun && now >= task.nextRun) {
        await this.executeRecurringTask(taskId);

        // Calcular próximo tick
        task.lastRun = now;
        task.nextRun = getNextCronTick(task.cron, now);
      }
    }

    // Verificar tareas delayed
    for (const [taskId, task] of this.delayedTasks) {
      if (now >= task.scheduledAt) {
        await this.executeDelayedTask(taskId);
      }
    }
  }

  /**
   * Ejecuta una tarea recurrente
   */
  async executeRecurringTask(taskId) {
    const task = this.recurringTasks.get(taskId);
    if (!task || !task.handler) {
      return;
    }

    // Intentar adquirir lock
    const lockKey = `lock:task:${taskId}`;
    const lockAcquired = await this.acquireLock(lockKey, TASK_LOCK_TTL);

    if (!lockAcquired) {
      logger.debug(`[SchedulerService] Task ${taskId} already running on another instance`);
      return;
    }

    const startTime = Date.now();

    try {
      logger.info(`[SchedulerService] Running recurring task: ${taskId}`);

      await task.handler();

      const duration = Date.now() - startTime;
      logger.info(`[SchedulerService] Task ${taskId} completed in ${duration}ms`);

      // Registrar ejecución
      await this.recordExecution(taskId, TASK_STATUS.COMPLETED, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[SchedulerService] Task ${taskId} failed after ${duration}ms`, error);

      await this.recordExecution(taskId, TASK_STATUS.FAILED, duration, error.message);
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  /**
   * Ejecuta una tarea delayed
   */
  async executeDelayedTask(taskId) {
    const task = this.delayedTasks.get(taskId);
    if (!task) {
      return;
    }

    this.delayedTasks.delete(taskId);

    try {
      logger.info(`[SchedulerService] Running delayed task: ${taskId}`);
      await task.handler();
    } catch (error) {
      logger.error(`[SchedulerService] Delayed task ${taskId} failed`, error);
      await this.recordExecution(taskId, TASK_STATUS.FAILED, 0, error.message);
    }
  }

  /**
   * Agrega una tarea recurrente
   * @param {string} id - Identificador único
   * @param {string} cronExpression - Expresión CRON
   * @param {Function} handler - Función a ejecutar
   * @param {object} options - Opciones adicionales
   */
  addRecurringTask(id, cronExpression, handler, options = {}) {
    if (this.recurringTasks.has(id)) {
      logger.warn(`[SchedulerService] Task ${id} already exists, replacing`);
    }

    const cron = parseCronExpression(cronExpression);
    const nextRun = getNextCronTick(cron);

    const task = {
      id,
      cron,
      handler,
      lastRun: null,
      nextRun,
      options,
    };

    this.recurringTasks.set(id, task);

    // Persistir tarea
    this.persistTask(id, {
      type: 'recurring',
      cronExpression,
      options,
    });

    logger.info(`[SchedulerService] Added recurring task: ${id} (next run: ${nextRun})`);

    return id;
  }

  /**
   * Agrega una tarea delayed
   * @param {string} id - Identificador único
   * @param {number} delayMs - Delay en milisegundos
   * @param {Function} handler - Función a ejecutar
   */
  addDelayedTask(id, delayMs, handler) {
    if (this.delayedTasks.has(id)) {
      logger.warn(`[SchedulerService] Delayed task ${id} already exists, replacing`);
    }

    const scheduledAt = new Date(Date.now() + delayMs);

    const task = {
      id,
      handler,
      scheduledAt,
    };

    this.delayedTasks.set(id, task);

    logger.info(`[SchedulerService] Added delayed task: ${id} (scheduled: ${scheduledAt})`);

    return id;
  }

  /**
   * Elimina una tarea
   * @param {string} id - Identificador de la tarea
   */
  removeTask(id) {
    const removed = this.recurringTasks.delete(id) || this.delayedTasks.delete(id);

    if (removed) {
      this.removePersistedTask(id);
      logger.info(`[SchedulerService] Removed task: ${id}`);
    }

    return removed;
  }

  /**
   * Cancela una tarea delayed
   * @param {string} id - Identificador de la tarea
   */
  cancelDelayedTask(id) {
    const task = this.delayedTasks.get(id);
    if (task) {
      this.delayedTasks.delete(id);
      logger.info(`[SchedulerService] Cancelled delayed task: ${id}`);
      return true;
    }
    return false;
  }

  /**
   * Obtiene el estado de una tarea
   * @param {string} id - Identificador de la tarea
   */
  getTaskStatus(id) {
    const recurringTask = this.recurringTasks.get(id);
    if (recurringTask) {
      return {
        id,
        type: 'recurring',
        lastRun: recurringTask.lastRun,
        nextRun: recurringTask.nextRun,
        status: TASK_STATUS.PENDING,
      };
    }

    const delayedTask = this.delayedTasks.get(id);
    if (delayedTask) {
      return {
        id,
        type: 'delayed',
        scheduledAt: delayedTask.scheduledAt,
        status: TASK_STATUS.PENDING,
      };
    }

    return null;
  }

  /**
   * Lista todas las tareas
   */
  listTasks() {
    const tasks = [];

    for (const [id, task] of this.recurringTasks) {
      tasks.push({
        id,
        type: 'recurring',
        lastRun: task.lastRun,
        nextRun: task.nextRun,
      });
    }

    for (const [id, task] of this.delayedTasks) {
      tasks.push({
        id,
        type: 'delayed',
        scheduledAt: task.scheduledAt,
      });
    }

    return tasks;
  }

  /**
   * Obtiene historial de ejecuciones
   * @param {string} taskId - Identificador de la tarea
   * @param {number} limit - Límite de resultados
   */
  async getExecutionHistory(taskId, limit = 100) {
    if (!this.cache) {
      return [];
    }

    const key = `history:${taskId}`;
    const history = await this.cache.lrange(key, 0, limit - 1);

    return history.map((h) => JSON.parse(h)).reverse();
  }

  // Métodos de lock y persistencia

  async acquireLock(key, ttl) {
    if (!this.cache) {
      return true; // Sin Redis, permitir ejecución
    }

    try {
      const result = await this.cache.setNX(key, Date.now(), ttl);
      return result === 1;
    } catch {
      return true; // En caso de error, permitir ejecución
    }
  }

  async releaseLock(key) {
    if (!this.cache) {
      return;
    }

    try {
      await this.cache.del(key);
    } catch (error) {
      logger.warn(`[SchedulerService] Failed to release lock: ${key}`, error);
    }
  }

  async persistTask(taskId, data) {
    if (this.cache) {
      try {
        await this.cache.set(`task:${taskId}`, JSON.stringify(data));
      } catch (error) {
        logger.warn(`[SchedulerService] Failed to persist task to Redis: ${taskId}`, error);
      }
    }

    const ScheduledJob = getScheduledJobModel();
    if (ScheduledJob) {
      try {
        await ScheduledJob.findOneAndUpdate(
          { jobId: taskId },
          {
            jobId: taskId,
            expression: data.cronExpression || '',
            options: data.options || {},
            active: true,
            createdAt: new Date().toISOString(),
          },
          { upsert: true, new: true },
        );
      } catch (error) {
        logger.warn(`[SchedulerService] Failed to persist task to Mongo: ${taskId}`, error);
      }
    }
  }

  async removePersistedTask(taskId) {
    if (this.cache) {
      try {
        await this.cache.del(`task:${taskId}`);
      } catch (error) {
        logger.warn(`[SchedulerService] Failed to remove persisted task from Redis: ${taskId}`, error);
      }
    }

    const ScheduledJob = getScheduledJobModel();
    if (ScheduledJob) {
      try {
        await ScheduledJob.findOneAndUpdate({ jobId: taskId }, { active: false });
      } catch (error) {
        logger.warn(`[SchedulerService] Failed to remove persisted task from Mongo: ${taskId}`, error);
      }
    }
  }

  async recordExecution(taskId, status, duration, error = null) {
    if (!this.cache) {
      return;
    }

    try {
      const record = {
        taskId,
        status,
        duration,
        error,
        timestamp: new Date().toISOString(),
      };

      const key = `history:${taskId}`;
      await this.cache.rpush(key, JSON.stringify(record));

      // Limitar historial a 1000 entradas
      await this.cache.ltrim(key, -1000, -1);
    } catch (error) {
      logger.warn(`[SchedulerService] Failed to record execution: ${taskId}`, error);
    }
  }
}

// Singleton
let instance = null;

function getSchedulerService() {
  if (!instance) {
    instance = new SchedulerService();
  }
  return instance;
}

module.exports = {
  SchedulerService,
  getSchedulerService,
  TASK_STATUS,
};
