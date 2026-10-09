/**
 * Execution Engine - Núcleo Central de Ejecución (JavaScript)
 *
 * Este es el MOTOR DE EJECUCIÓN que coordina toda la arquitectura.
 *
 * Responsabilidades:
 * 1. Recibir solicitudes y crear ejecuciones
 * 2. Descomponer solicitudes complejas en tareas (usando TaskPlanner)
 * 3. Ejecutar tareas en paralelo o secuencialmente
 * 4. Coordinar con WorkflowEngine para flujos complejos
 * 5. Gestionar el ciclo de vida de las ejecuciones
 * 6. Publicar eventos de ejecución para observabilidad
 *
 * FLUJO:
 * IntegrationManager → ExecutionEngine.execute() → TaskPlanner → Tasks → Runtimes
 */

const crypto = require('crypto');
const { getEventBus, EventType, EventPriority } = require('../EventBus');
const { getRuntimeRegistry } = require('../RuntimeRegistry');
const { getCapabilityRouter } = require('../CapabilityRouter');
const { getTaskPlanner, IntentCategory } = require('../TaskPlanner');

const logger = {
  debug: (...args) => console.log('[ExecutionEngine]', ...args),
  info: (...args) => console.log('[ExecutionEngine]', ...args),
  warn: (...args) => console.warn('[ExecutionEngine]', ...args),
  error: (...args) => console.error('[ExecutionEngine]', ...args),
};

// Estados de ejecución
const ExecutionStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

// Tipos de tarea
const TaskType = {
  SIMPLE: 'simple', // Una sola operación
  PARALLEL: 'parallel', // Múltiples operaciones en paralelo
  SEQUENTIAL: 'sequential', // Múltiples operaciones en secuencia
  WORKFLOW: 'workflow', // Workflow complejo con DAG
};

/**
 * Task - Representa una unidad de trabajo
 */
class Task {
  constructor(params) {
    this.id = params.id || crypto.randomUUID();
    this.type = params.type || TaskType.SIMPLE;
    this.name = params.name;
    this.description = params.description;
    this.runtime = params.runtime;
    this.provider = params.provider;
    this.model = params.model;
    this.input = params.input;
    this.output = null;
    this.status = ExecutionStatus.PENDING;
    this.result = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
    this.dependencies = params.dependencies || [];
    this.capabilities = params.capabilities || [];
    this.metadata = params.metadata || {};
  }

  get duration() {
    if (!this.startTime || !this.endTime) return null;
    return this.endTime - this.startTime;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      runtime: this.runtime,
      provider: this.provider,
      model: this.model,
      status: this.status,
      duration: this.duration,
      error: this.error,
      metadata: this.metadata,
    };
  }
}

/**
 * Execution - Representa una ejecución completa
 */
class Execution {
  constructor(params) {
    this.id = params.id || crypto.randomUUID();
    this.type = params.type || TaskType.SIMPLE;
    this.intent = params.intent;
    this.tasks = [];
    this.status = ExecutionStatus.PENDING;
    this.result = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
    this.parentExecutionId = params.parentExecutionId;
    this.correlationId = params.correlationId || crypto.randomUUID();
    this.metadata = params.metadata || {};
  }

  addTask(task) {
    this.tasks.push(task);
    return task;
  }

  get duration() {
    if (!this.startTime || !this.endTime) return null;
    return this.endTime - this.startTime;
  }

  get completedTasks() {
    return this.tasks.filter((t) => t.status === ExecutionStatus.COMPLETED);
  }

  get failedTasks() {
    return this.tasks.filter((t) => t.status === ExecutionStatus.FAILED);
  }

  get isComplete() {
    return this.tasks.every(
      (t) => t.status === ExecutionStatus.COMPLETED || t.status === ExecutionStatus.FAILED,
    );
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      intent: this.intent,
      status: this.status,
      duration: this.duration,
      taskCount: this.tasks.length,
      completedTasks: this.completedTasks.length,
      failedTasks: this.failedTasks.length,
      error: this.error,
      correlationId: this.correlationId,
      metadata: this.metadata,
    };
  }
}

/**
 * Execution Engine - Clase principal
 */
class ExecutionEngine {
  constructor(config = {}) {
    this.eventBus = getEventBus();
    this.runtimeRegistry = getRuntimeRegistry();
    this.capabilityRouter = getCapabilityRouter();
    this.taskPlanner = getTaskPlanner();

    this.config = {
      maxConcurrentExecutions: config.maxConcurrentExecutions || 50,
      maxTasksPerExecution: config.maxTasksPerExecution || 100,
      defaultTimeout: config.defaultTimeout || 120000,
      enableParallelExecution: config.enableParallelExecution !== false,
      enableWorkflowEngine: config.enableWorkflowEngine !== false,
      enableAdvancedPlanning: config.enableAdvancedPlanning !== false,
    };

    // Estado interno
    this.executions = new Map();
    this.activeExecutions = new Map();
    this.taskHandlers = new Map();
    this.middlewares = [];

    // Suscripciones de eventos
    this.setupEventSubscriptions();

    logger.info('[ExecutionEngine] Initialized with TaskPlanner', { config: this.config });
  }

  /**
   * Configurar suscripciones a eventos
   */
  setupEventSubscriptions() {
    // Escuchar eventos de cancelación
    this.eventBus.subscribe(EventType.EXECUTION_CANCELLED, (event) => {
      this.handleCancellation(event.payload);
    });

    // Escuchar eventos de task fallida para reintentar
    this.eventBus.subscribe('task.failed', (event) => {
      this.handleTaskFailure(event.payload);
    });
  }

  /**
   * Registrar middleware
   */
  use(middleware) {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Ejecutar middleware
   */
  async runMiddlewares(context, phase) {
    for (const middleware of this.middlewares) {
      if (typeof middleware[phase] === 'function') {
        await middleware[phase](context);
      }
    }
  }

  /**
   * Ejecutar una solicitud
   */
  async execute(params) {
    const executionId = crypto.randomUUID();
    const startTime = Date.now();

    // Publicar evento de ejecución solicitada
    this.eventBus.publish(
      EventType.EXECUTION_REQUESTED,
      {
        executionId,
        intent: params.intent,
        type: params.type,
        correlationId: params.correlationId,
      },
      'ExecutionEngine',
      { priority: EventPriority.HIGH },
    );

    // Crear contexto de ejecución
    const context = {
      executionId,
      intent: params.intent,
      type: params.type,
      messages: params.messages,
      capabilities: params.capabilities || [],
      constraints: params.constraints,
      options: params.options,
      correlationId: params.correlationId || crypto.randomUUID(),
      metadata: params.metadata || {},
    };

    await this.runMiddlewares(context, 'beforeExecution');

    // Crear ejecución
    const execution = new Execution({
      id: executionId,
      type: params.type || TaskType.SIMPLE,
      intent: params.intent,
      correlationId: context.correlationId,
      metadata: context.metadata,
    });

    this.executions.set(executionId, execution);
    this.activeExecutions.set(executionId, execution);

    try {
      // Iniciar ejecución
      execution.status = ExecutionStatus.RUNNING;
      execution.startTime = startTime;

      this.eventBus.publish(
        EventType.EXECUTION_STARTED,
        {
          executionId,
          type: execution.type,
          correlationId: execution.correlationId,
        },
        'ExecutionEngine',
        { priority: EventPriority.HIGH },
      );

      // Descomponer en tareas
      const tasks = await this.decompose(execution, params);

      for (const task of tasks) {
        execution.addTask(task);
      }

      // Ejecutar tareas
      const result = await this.executeTasks(execution, tasks);

      // Completar ejecución
      execution.status = ExecutionStatus.COMPLETED;
      execution.result = result;
      execution.endTime = Date.now();

      await this.runMiddlewares(context, 'afterExecution');

      this.eventBus.publish(
        EventType.EXECUTION_COMPLETED,
        {
          executionId,
          duration: execution.duration,
          taskCount: tasks.length,
          correlationId: execution.correlationId,
        },
        'ExecutionEngine',
      );

      // Limpiar de activas
      this.activeExecutions.delete(executionId);

      return {
        executionId,
        status: ExecutionStatus.COMPLETED,
        result,
        tasks: execution.tasks.map((t) => t.toJSON()),
        duration: execution.duration,
      };
    } catch (error) {
      execution.status = ExecutionStatus.FAILED;
      execution.error = error.message;
      execution.endTime = Date.now();

      this.eventBus.publish(
        EventType.EXECUTION_FAILED,
        {
          executionId,
          error: error.message,
          duration: execution.duration,
          correlationId: execution.correlationId,
        },
        'ExecutionEngine',
        { priority: EventPriority.HIGH },
      );

      this.activeExecutions.delete(executionId);

      await this.runMiddlewares(context, 'onError');

      throw error;
    }
  }

  /**
   * Descomponer una solicitud en tareas usando TaskPlanner
   */
  async decompose(execution, params) {
    const intent = params.intent || '';

    // Usar TaskPlanner para análisis avanzado
    const plan = this.taskPlanner.createPlan(intent, {
      messages: params.messages,
      capabilities: params.capabilities,
    });

    logger.debug('[ExecutionEngine] Created plan:', {
      planId: plan.id,
      category: plan.category,
      taskCount: plan.tasks.length,
      analysis: plan.analysis,
    });

    // Convertir subtareas del plan a tareas de ejecución
    const tasks = plan.tasks.map((subTask) => {
      const routing = this.capabilityRouter.route({
        intent: subTask.input?.intent || intent,
        capabilities: subTask.capabilities,
        constraints: params.constraints || {},
      });

      // If explicit provider/model was requested, override routing
      const taskProvider = params.provider || routing.provider;
      const taskModel = params.model || routing.model;

      return new Task({
        id: subTask.id,
        name: subTask.name,
        description: subTask.description,
        type: subTask.type === 'workflow_step' ? TaskType.SEQUENTIAL : TaskType.SIMPLE,
        runtime: subTask.runtime || routing.runtime,
        provider: taskProvider,
        model: taskModel,
        input: subTask.input,
        capabilities: subTask.capabilities,
        dependencies: subTask.dependencies,
        metadata: {
          originalSubTask: subTask,
          planId: plan.id,
          category: plan.category,
        },
      });
    });

    logger.debug('[ExecutionEngine] Decomposed into tasks:', {
      taskCount: tasks.length,
      tasks: tasks.map((t) => t.name),
    });

    return tasks;
  }

  /**
   * Ejecutar tareas
   */
  async executeTasks(execution, tasks) {
    const results = [];

    if (this.config.enableParallelExecution && tasks.length > 1) {
      // Ejecutar tareas en paralelo si no tienen dependencias
      const independentTasks = tasks.filter((t) => t.dependencies.length === 0);
      const dependentTasks = tasks.filter((t) => t.dependencies.length > 0);

      // Ejecutar independientes en paralelo
      const parallelPromises = independentTasks.map((task) => this.executeTask(execution, task));
      const parallelResults = await Promise.allSettled(parallelPromises);

      for (let i = 0; i < independentTasks.length; i++) {
        const task = independentTasks[i];
        const result = parallelResults[i];
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({ error: result.reason.message });
        }
      }

      // Ejecutar dependientes en secuencia
      for (const task of dependentTasks) {
        const result = await this.executeTask(execution, task);
        results.push(result);
      }
    } else {
      // Ejecutar en secuencia
      for (const task of tasks) {
        const result = await this.executeTask(execution, task);
        results.push(result);
      }
    }

    // Combinar resultados
    return this.combineResults(results);
  }

  /**
   * Ejecutar una tarea individual
   */
  async executeTask(execution, task) {
    task.status = ExecutionStatus.RUNNING;
    task.startTime = Date.now();

    this.eventBus.publish(
      'task.started',
      {
        taskId: task.id,
        executionId: execution.id,
        taskName: task.name,
        runtime: task.runtime,
        correlationId: execution.correlationId,
      },
      'ExecutionEngine',
    );

    try {
      // Obtener runtime
      const runtime = this.runtimeRegistry.get(task.runtime);

      if (!runtime) {
        throw new Error(`Runtime not found: ${task.runtime}`);
      }

      // Ejecutar en runtime
      let result;
      if (typeof runtime.execute === 'function') {
        result = await this.executeWithTimeout(
          runtime.execute({
            intent: task.input.intent || task.input.query || task.input.prompt,
            messages: task.input.messages,
            provider: task.provider,
            model: task.model,
            capabilities: task.capabilities,
          }),
          this.config.defaultTimeout,
        );
      } else {
        // Runtime placeholder
        result = await this.executePlaceholder(task);
      }

      task.status = ExecutionStatus.COMPLETED;
      task.result = result;
      task.output = result;
      task.endTime = Date.now();

      this.eventBus.publish(
        'task.completed',
        {
          taskId: task.id,
          executionId: execution.id,
          taskName: task.name,
          duration: task.duration,
          correlationId: execution.correlationId,
        },
        'ExecutionEngine',
      );

      return result;
    } catch (error) {
      task.status = ExecutionStatus.FAILED;
      task.error = error.message;
      task.endTime = Date.now();

      this.eventBus.publish(
        'task.failed',
        {
          taskId: task.id,
          executionId: execution.id,
          taskName: task.name,
          error: error.message,
          correlationId: execution.correlationId,
        },
        'ExecutionEngine',
      );

      throw error;
    }
  }

  /**
   * Error para runtimes no implementados.
   * NO devuelve respuestas falsas — falla con honestidad.
   */
  async executePlaceholder(task) {
    throw new Error(
      `ExecutionEngine: runtime "${task.runtime}" does not have an execute() method. ` +
      `Provider: ${task.provider}, Model: ${task.model}. ` +
      `Register a proper runtime or use LLMRuntime for LLM tasks.`
    );
  }

  /**
   * Ejecutar con timeout
   */
  async executeWithTimeout(promise, timeoutMs) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Execution timeout after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  }

  /**
   * Combinar resultados de tareas
   */
  combineResults(results) {
    // Si hay un solo resultado, retornarlo directamente
    if (results.length === 1) {
      return results[0];
    }

    // Combinar múltiples resultados
    const combined = {
      results: results,
      count: results.length,
    };

    // Extraer textos si hay múltiples
    const texts = results.map((r) => r?.text || r?.content).filter(Boolean);

    if (texts.length > 0) {
      combined.text = texts.join('\n\n');
    }

    return combined;
  }

  /**
   * Cancelar una ejecución
   */
  async cancel(executionId) {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (
      execution.status === ExecutionStatus.COMPLETED ||
      execution.status === ExecutionStatus.CANCELLED
    ) {
      return { cancelled: false, reason: 'Already completed or cancelled' };
    }

    execution.status = ExecutionStatus.CANCELLED;
    execution.endTime = Date.now();

    // Cancelar tareas activas
    for (const task of execution.tasks) {
      if (task.status === ExecutionStatus.RUNNING) {
        task.status = ExecutionStatus.CANCELLED;
        task.endTime = Date.now();
      }
    }

    this.activeExecutions.delete(executionId);

    this.eventBus.publish(
      EventType.EXECUTION_CANCELLED,
      {
        executionId,
        duration: execution.duration,
      },
      'ExecutionEngine',
    );

    return { cancelled: true, executionId };
  }

  /**
   * Manejar cancelación desde eventos
   */
  handleCancellation(payload) {
    const { executionId } = payload;
    const execution = this.executions.get(executionId);
    if (execution) {
      this.cancel(executionId);
    }
  }

  /**
   * Manejar fallo de tarea
   */
  handleTaskFailure(payload) {
    // Log para análisis
    logger.warn('[ExecutionEngine] Task failure:', payload);
  }

  /**
   * Obtener estado de una ejecución
   */
  getExecution(executionId) {
    return this.executions.get(executionId);
  }

  /**
   * Obtener todas las ejecuciones
   */
  getAllExecutions() {
    return Array.from(this.executions.values()).map((e) => e.toJSON());
  }

  /**
   * Obtener ejecuciones activas
   */
  getActiveExecutions() {
    return Array.from(this.activeExecutions.values()).map((e) => e.toJSON());
  }

  /**
   * Obtener estado del engine
   */
  getStatus() {
    return {
      activeExecutions: this.activeExecutions.size,
      totalExecutions: this.executions.size,
      config: this.config,
    };
  }
}

// Singleton
let engineInstance = null;

function getExecutionEngine() {
  if (!engineInstance) {
    engineInstance = new ExecutionEngine();
  }
  return engineInstance;
}

function createExecutionEngine(config) {
  engineInstance = new ExecutionEngine(config);
  return engineInstance;
}

module.exports = {
  ExecutionEngine,
  Execution,
  Task,
  ExecutionStatus,
  TaskType,
  getExecutionEngine,
  createExecutionEngine,
};
