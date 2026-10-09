/**
 * Workflow Engine - Motor de Flujos de Trabajo (JavaScript)
 *
 * Permite ejecutar flujos de trabajo complejos con múltiples pasos,
 * dependencias entre tareas, y manejo de errores.
 *
 * FLUJO:
 * WorkflowEngine → Steps → Runtimes → Results
 */

const { getEventBus, EventType } = require('../EventBus');
const crypto = require('crypto');
const { saveWorkflow } = require('./workflowPersistence');

const logger = {
  debug: (...args) => console.log('[WorkflowEngine]', ...args),
  info: (...args) => console.log('[WorkflowEngine]', ...args),
  warn: (...args) => console.warn('[WorkflowEngine]', ...args),
  error: (...args) => console.error('[WorkflowEngine]', ...args),
};

// Estados de workflow
const WorkflowStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

// Estados de paso
const StepStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

/**
 * Workflow Step - Paso individual del workflow
 */
class WorkflowStep {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name || `Step ${this.id.substring(0, 8)}`;
    this.type = config.type || 'task';
    this.action = config.action;
    this.runtime = config.runtime; // LLMRuntime, SearchRuntime, etc.
    this.input = config.input || {};
    this.dependsOn = config.dependsOn || []; // IDs de pasos anteriores
    this.optional = config.optional || false;
    this.retry = config.retry || { maxAttempts: 1, delay: 1000 };
    this.timeout = config.timeout || 60000;

    this.status = StepStatus.PENDING;
    this.result = null;
    this.error = null;
    this.attempts = 0;
    this.startedAt = null;
    this.completedAt = null;
  }

  canExecute(completedSteps) {
    // Verificar si todas las dependencias están completadas
    for (const depId of this.dependsOn) {
      const dep = completedSteps.get(depId);
      if (!dep) {
        logger.debug(`[WorkflowStep] Dependency ${depId} not found`);
        return false;
      }
      if (dep.status !== StepStatus.COMPLETED) {
        return false;
      }
      // Verificar si la dependencia falló y no es opcional
      if (dep.status === StepStatus.FAILED && !this.optional) {
        return false;
      }
    }
    return true;
  }

  getInputFromContext(context) {
    const resolved = { ...this.input };

    // Reemplazar referencias a otros pasos {{step_id.output}}
    for (const [key, value] of Object.entries(resolved)) {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        const ref = value.slice(2, -2);
        const [stepId, outputPath] = ref.split('.');

        const depStep = context.get(stepId);
        if (depStep && depStep.result) {
          if (outputPath) {
            resolved[key] = depStep.result[outputPath];
          } else {
            resolved[key] = depStep.result;
          }
        }
      }
    }

    return resolved;
  }

  execute(runtimeRegistry) {
    this.attempts++;
    this.startedAt = new Date();
    this.status = StepStatus.RUNNING;

    return new Promise(async (resolve, reject) => {
      try {
        // Obtener el runtime
        const runtime = runtimeRegistry.get(this.runtime);

        if (!runtime) {
          throw new Error(`Runtime ${this.runtime} not found`);
        }

        // Ejecutar la tarea
        const result = await runtime.execute({
          ...this.getInputFromContext({}),
          intent: this.input.intent || this.input.prompt || this.action,
        });

        this.result = result;
        this.status = StepStatus.COMPLETED;
        this.completedAt = new Date();

        resolve(result);
      } catch (error) {
        this.error = error.message;

        // Verificar si podemos reintentar
        if (this.attempts < this.retry.maxAttempts) {
          logger.warn(
            `[WorkflowStep] ${this.name} failed, retrying... (${this.attempts}/${this.retry.maxAttempts})`,
          );

          setTimeout(() => {
            this.execute(runtimeRegistry).then(resolve).catch(reject);
          }, this.retry.delay);
        } else {
          this.status = this.optional ? StepStatus.SKIPPED : StepStatus.FAILED;
          this.completedAt = new Date();
          reject(error);
        }
      }
    });
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: this.status,
      result: this.result ? this.result.text || this.result.imageUrl || this.result : null,
      error: this.error,
      attempts: this.attempts,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      duration: this.completedAt && this.startedAt ? this.completedAt - this.startedAt : null,
    };
  }
}

/**
 * Workflow - Representa un flujo de trabajo
 */
class Workflow {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name || `Workflow ${this.id.substring(0, 8)}`;
    this.description = config.description || '';
    this.steps = new Map();
    this.status = WorkflowStatus.PENDING;
    this.result = null;
    this.error = null;
    this.createdAt = new Date();
    this.startedAt = null;
    this.completedAt = null;

    // Agregar pasos iniciales
    if (config.steps) {
      for (const stepConfig of config.steps) {
        this.addStep(new WorkflowStep(stepConfig));
      }
    }
  }

  addStep(step) {
    this.steps.set(step.id, step);
    return step;
  }

  getStep(stepId) {
    return this.steps.get(stepId);
  }

  getStepsByStatus(status) {
    return Array.from(this.steps.values()).filter((s) => s.status === status);
  }

  canStart() {
    // Verificar que haya pasos disponibles
    if (this.steps.size === 0) {
      return false;
    }

    // Verificar que haya al menos un paso que pueda ejecutarse
    const pendingSteps = this.getStepsByStatus(StepStatus.PENDING);
    return pendingSteps.some((step) => step.canExecute(this.steps));
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      status: this.status,
      steps: Array.from(this.steps.values()).map((s) => s.toJSON()),
      result: this.result,
      error: this.error,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      duration: this.completedAt && this.startedAt ? this.completedAt - this.startedAt : null,
    };
  }
}

/**
 * Workflow Engine - Clase principal
 */
class WorkflowEngine {
  constructor(config = {}) {
    this.eventBus = getEventBus();
    this.name = 'WorkflowEngine';
    this.status = 'initializing';
    this.config = {
      maxConcurrentSteps: config.maxConcurrentSteps || 3,
      defaultTimeout: config.defaultTimeout || 300000, // 5 min
      ...config,
    };

    this.activeWorkflows = new Map();
    this.completedWorkflows = [];
    this.maxCompletedHistory = config.maxHistory || 100;
  }

  /**
   * Inicializar el engine
   */
  async initialize() {
    this.status = 'ready';
    logger.info('[WorkflowEngine] Initialized');

    this.eventBus.publish(
      'runtime.ready',
      {
        runtime: this.name,
      },
      'WorkflowEngine',
    );

    return true;
  }

  /**
   * Crear un workflow desde configuración
   */
  createWorkflow(config) {
    const workflow = new Workflow(config);
    return workflow;
  }

  /**
   * Ejecutar un workflow
   */
  async execute(workflow, runtimeRegistry) {
    const startTime = Date.now();
    workflow.startedAt = new Date();
    workflow.status = WorkflowStatus.RUNNING;

    this.activeWorkflows.set(workflow.id, workflow);
    await saveWorkflow(workflow, workflow._createdBy);

    logger.info(`[WorkflowEngine] Starting workflow: ${workflow.name} (${workflow.id})`);

    this.eventBus.publish(
      EventType.EXECUTION_STARTED,
      {
        workflowId: workflow.id,
        workflowName: workflow.name,
        stepCount: workflow.steps.size,
      },
      'WorkflowEngine',
    );

    try {
      // Ejecutar pasos hasta que todos estén completados o fallen
      await this.executeSteps(workflow, runtimeRegistry);

      // Verificar resultado
      const failedSteps = workflow.getStepsByStatus(StepStatus.FAILED);
      const completedSteps = workflow.getStepsByStatus(StepStatus.COMPLETED);

      if (failedSteps.length > 0) {
        workflow.status = WorkflowStatus.FAILED;
        workflow.error = `Failed steps: ${failedSteps.map((s) => s.name).join(', ')}`;
      } else {
        workflow.status = WorkflowStatus.COMPLETED;
        workflow.result = this.aggregateResults(workflow);
      }
    } catch (error) {
      workflow.status = WorkflowStatus.FAILED;
      workflow.error = error.message;
    }

    workflow.completedAt = new Date();
    const duration = Date.now() - startTime;

    // Mover a historial
    this.activeWorkflows.delete(workflow.id);
    this.completedWorkflows.push(workflow);

    // Limitar historial
    if (this.completedWorkflows.length > this.maxCompletedHistory) {
      this.completedWorkflows.shift();
    }

    this.eventBus.publish(
      EventType.EXECUTION_COMPLETED,
      {
        workflowId: workflow.id,
        status: workflow.status,
        duration,
      },
      'WorkflowEngine',
    );

    await saveWorkflow(workflow, workflow._createdBy);
    logger.info(`[WorkflowEngine] Workflow ${workflow.name} ${workflow.status} in ${duration}ms`);

    return workflow;
  }

  /**
   * Ejecutar pasos del workflow
   */
  async executeSteps(workflow, runtimeRegistry) {
    const maxIterations = workflow.steps.size * 2; // Safety limit
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      // Verificar si todos los pasos están terminados
      const pendingSteps = workflow.getStepsByStatus(StepStatus.PENDING);
      const runningSteps = workflow.getStepsByStatus(StepStatus.RUNNING);

      if (pendingSteps.length === 0 && runningSteps.length === 0) {
        break; // Workflow completado
      }

      // Ejecutar pasos pendientes que puedan ejecutarse
      for (const step of pendingSteps) {
        if (step.canExecute(workflow.steps)) {
          // Ejecutar en paralelo si hay capacidad
          const currentRunning = workflow.getStepsByStatus(StepStatus.RUNNING).length;

          if (currentRunning < this.config.maxConcurrentSteps) {
            this.executeStep(step, workflow, runtimeRegistry);
          }
        }
      }

      // Esperar un poco antes de verificar de nuevo
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * Ejecutar un paso individual
   */
  async executeStep(step, workflow, runtimeRegistry) {
    logger.debug(`[WorkflowEngine] Executing step: ${step.name}`);

    this.eventBus.publish(
      'workflow.step_started',
      {
        workflowId: workflow.id,
        stepId: step.id,
        stepName: step.name,
      },
      'WorkflowEngine',
    );

    try {
      const result = await Promise.race([
        step.execute(runtimeRegistry),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Step timeout')), step.timeout),
        ),
      ]);

      this.eventBus.publish(
        'workflow.step_completed',
        {
          workflowId: workflow.id,
          stepId: step.id,
          stepName: step.name,
        },
        'WorkflowEngine',
      );
    } catch (error) {
      step.status = step.optional ? StepStatus.SKIPPED : StepStatus.FAILED;
      step.error = error.message;

      this.eventBus.publish(
        'workflow.step_failed',
        {
          workflowId: workflow.id,
          stepId: step.id,
          stepName: step.name,
          error: error.message,
        },
        'WorkflowEngine',
      );
      // Status is already set to FAILED on the step; execute() checks for
      // failed steps after executeSteps() returns. Do not rethrow here —
      // executeStep is called without await so any throw becomes an
      // unhandled rejection.
    }
  }

  /**
   * Agregar resultados de pasos
   */
  aggregateResults(workflow) {
    const results = {};

    for (const step of workflow.steps.values()) {
      if (step.result) {
        results[step.id] = step.result;
      }
    }

    return results;
  }

  /**
   * Obtener workflow activo
   */
  getWorkflow(workflowId) {
    return (
      this.activeWorkflows.get(workflowId) ||
      this.completedWorkflows.find((w) => w.id === workflowId)
    );
  }

  /**
   * Listar workflows
   */
  listWorkflows() {
    return {
      active: Array.from(this.activeWorkflows.values()).map((w) => w.toJSON()),
      completed: this.completedWorkflows.slice(-20).map((w) => w.toJSON()),
    };
  }

  /**
   * Cancelar workflow
   */
  cancelWorkflow(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);

    if (workflow) {
      workflow.status = WorkflowStatus.CANCELLED;
      workflow.completedAt = new Date();

      // Marcar pasos pendientes como cancelados
      for (const step of workflow.steps.values()) {
        if (step.status === StepStatus.PENDING || step.status === StepStatus.RUNNING) {
          step.status = StepStatus.SKIPPED;
        }
      }

      saveWorkflow(workflow, workflow._createdBy);
      logger.info(`[WorkflowEngine] Workflow ${workflowId} cancelled`);
      return true;
    }

    return false;
  }

  /**
   * Verificar salud
   */
  async healthCheck() {
    return this.status === 'ready';
  }

  /**
   * Apagar
   */
  async shutdown() {
    // Cancelar workflows activos
    for (const workflow of this.activeWorkflows.values()) {
      this.cancelWorkflow(workflow.id);
    }

    this.status = 'shutdown';
    logger.info('[WorkflowEngine] Shutdown complete');
  }
}

// Singleton
let engineInstance = null;

function getWorkflowEngine(config) {
  if (!engineInstance) {
    engineInstance = new WorkflowEngine(config);
  }
  return engineInstance;
}

module.exports = {
  WorkflowEngine,
  Workflow,
  WorkflowStep,
  WorkflowStatus,
  StepStatus,
  getWorkflowEngine,
};
