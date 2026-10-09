/**
 * Task Planner - Descomposición Inteligente de Tareas (JavaScript)
 *
 * Este componente analiza la intención del usuario y descompone
 * solicitudes complejas en tareas ejecutables.
 *
 * FLUJO:
 * ExecutionEngine → TaskPlanner.createPlan() → [SubTask1, SubTask2, ...]
 *
 * EJEMPLO:
 * "Analiza el repositorio y genera un informe"
 * ↓
 * [AnalyzeCode] → [SearchDependencies] → [ExecuteRuntimes] → [GenerateReport]
 */

const { getEventBus, EventType } = require('../EventBus');
const { Capability } = require('../RuntimeRegistry');

const logger = {
  debug: (...args) => console.log('[TaskPlanner]', ...args),
  info: (...args) => console.log('[TaskPlanner]', ...args),
  warn: (...args) => console.warn('[TaskPlanner]', ...args),
  error: (...args) => console.error('[TaskPlanner]', ...args),
};

// Tipos de análisis
const AnalysisType = {
  CODE: 'code_analysis',
  REPO: 'repository_analysis',
  DOCUMENTATION: 'documentation',
  DEPENDENCIES: 'dependency_analysis',
  SECURITY: 'security_analysis',
  PERFORMANCE: 'performance_analysis',
  WEB: 'web_research',
  IMAGE: 'image_generation',
  CHAT: 'chat',
};

// Categorías de intención
const IntentCategory = {
  CODE: 'code',
  SEARCH: 'search',
  IMAGE: 'image',
  ANALYSIS: 'analysis',
  CHAT: 'chat',
  WORKFLOW: 'workflow',
  UNKNOWN: 'unknown',
};

/**
 * SubTask - Representa una subtarea dentro de un plan
 */
class SubTask {
  constructor(params) {
    this.id = params.id || crypto.randomUUID();
    this.name = params.name;
    this.description = params.description;
    this.type = params.type;
    this.runtime = params.runtime;
    this.capabilities = params.capabilities || [];
    this.input = params.input;
    this.dependencies = params.dependencies || []; // IDs de tareas dependientes
    this.optional = params.optional || false;
    this.timeout = params.timeout || 30000;
    this.retry = params.retry || { maxAttempts: 2, backoff: 'exponential' };
    this.status = 'pending';
    this.result = null;
    this.error = null;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      runtime: this.runtime,
      dependencies: this.dependencies,
      optional: this.optional,
      status: this.status,
    };
  }
}

/**
 * Plan - Representa un plan de ejecución completo
 */
class Plan {
  constructor(params) {
    this.id = params.id || crypto.randomUUID();
    this.originalIntent = params.intent;
    this.category = params.category;
    this.analysis = params.analysis;
    this.tasks = [];
    this.metadata = params.metadata || {};
    this.createdAt = Date.now();
    this.executionGraph = null;
  }

  addTask(task) {
    this.tasks.push(task);
    return task;
  }

  getTask(id) {
    return this.tasks.find((t) => t.id === id);
  }

  getRootTasks() {
    return this.tasks.filter((t) => t.dependencies.length === 0);
  }

  getExecutableTasks(completedTaskIds = []) {
    return this.tasks.filter((t) => {
      if (t.status !== 'pending') return false;
      if (completedTaskIds.includes(t.id)) return false;
      return t.dependencies.every((depId) => completedTaskIds.includes(depId));
    });
  }

  get topologicalOrder() {
    const order = [];
    const completed = new Set();
    const remaining = [...this.tasks];

    while (remaining.length > 0) {
      const executable = remaining.filter((t) =>
        t.dependencies.every((depId) => completed.has(depId)),
      );

      if (executable.length === 0) {
        // Hay un ciclo o dependencia faltante
        break;
      }

      for (const task of executable) {
        order.push(task);
        completed.add(task.id);
        remaining.splice(remaining.indexOf(task), 1);
      }
    }

    return order;
  }

  toJSON() {
    return {
      id: this.id,
      originalIntent: this.originalIntent,
      category: this.category,
      analysis: this.analysis,
      taskCount: this.tasks.length,
      tasks: this.tasks.map((t) => t.toJSON()),
      createdAt: this.createdAt,
    };
  }
}

/**
 * Task Planner - Clase principal
 */
class TaskPlanner {
  constructor(config = {}) {
    this.eventBus = getEventBus();
    this.config = {
      maxTasksPerPlan: config.maxTasksPerPlan || 20,
      enableParallelExecution: config.enableParallelExecution !== false,
      analysisDepth: config.analysisDepth || 'standard',
    };
  }

  /**
   * Crear un plan de ejecución basado en la intención
   */
  createPlan(intent, options = {}) {
    const intentLower = (intent || '').toLowerCase();

    // Analizar la intención
    const analysis = this.analyzeIntent(intentLower);
    const category = this.categorizeIntent(intentLower);

    logger.info('[TaskPlanner] Creating plan:', {
      intent: intent.substring(0, 50),
      category,
      analysis,
    });

    // Crear el plan
    const plan = new Plan({
      intent,
      category,
      analysis,
      metadata: options,
    });

    // Generar tareas según la categoría
    switch (category) {
      case IntentCategory.CODE:
        this.addCodeTasks(plan, intentLower, analysis);
        break;
      case IntentCategory.SEARCH:
        this.addSearchTasks(plan, intentLower, analysis);
        break;
      case IntentCategory.IMAGE:
        this.addImageTasks(plan, intentLower, analysis);
        break;
      case IntentCategory.ANALYSIS:
        this.addAnalysisTasks(plan, intentLower, analysis);
        break;
      case IntentCategory.WORKFLOW:
        this.addWorkflowTasks(plan, intentLower, analysis);
        break;
      default:
        this.addChatTasks(plan, intentLower, analysis);
    }

    // Validar el plan
    this.validatePlan(plan);

    // Publicar evento
    this.eventBus.publish(
      EventType.TASK_CREATED,
      {
        planId: plan.id,
        category,
        taskCount: plan.tasks.length,
      },
      'TaskPlanner',
    );

    return plan;
  }

  /**
   * Analizar la intención del usuario
   */
  analyzeIntent(intent) {
    const analysis = {
      requiresCode: false,
      requiresSearch: false,
      requiresImage: false,
      requiresBrowser: false,
      requiresFilesystem: false,
      requiresAnalysis: false,
      requiresDocumentation: false,
      complexity: 'simple',
      intent: [],
    };

    // Análisis por palabras clave
    const keywords = {
      code: [
        'codigo',
        'programa',
        'debug',
        'funcion',
        'script',
        'python',
        'javascript',
        'ejecuta',
        'implementa',
        'refactoriza',
        'test',
        'prueba',
      ],
      search: [
        'busca',
        'internet',
        'web',
        'google',
        'encuentra',
        'informacion',
        'investiga',
        'como',
        'que es',
      ],
      image: ['imagen', 'foto', 'dibuja', 'genera imagen', 'crea imagen', 'ilustracion', 'arte'],
      browser: ['navega', 'pagina', 'click', 'web', 'sitio'],
      filesystem: ['archivo', 'directorio', 'lee', 'escribe', 'crea', 'modifica', 'elimina'],
      analysis: ['analiza', 'analisis', 'revisar', 'examina', 'informe', 'reporte', 'evalua'],
      documentation: ['documenta', 'docs', 'readme', 'explica', 'describe', 'comenta'],
    };

    // Verificar cada categoría
    for (const [category, words] of Object.entries(keywords)) {
      for (const word of words) {
        if (intent.includes(word)) {
          analysis[`requires${category.charAt(0).toUpperCase() + category.slice(1)}`] = true;
          analysis.intent.push(category);
          break;
        }
      }
    }

    // Detectar complejidad
    const complexIndicators = [
      'analiza',
      'compara',
      'evalua',
      'informe',
      'reporte',
      'multiple',
      'completo',
    ];
    const mediumIndicators = ['explica', 'como', 'diferencia', 'ventajas'];

    if (complexIndicators.some((w) => intent.includes(w))) {
      analysis.complexity = 'complex';
    } else if (mediumIndicators.some((w) => intent.includes(w))) {
      analysis.complexity = 'medium';
    }

    return analysis;
  }

  /**
   * Categorizar la intención
   */
  categorizeIntent(intent) {
    // Búsqueda primero para capturar "busca información sobre Python"
    if (/busca|internet|web|google|encuentra|informacion|investiga/i.test(intent)) {
      return IntentCategory.SEARCH;
    }
    if (/imagen|foto|dibuja|genera imagen|crea imagen/i.test(intent)) {
      return IntentCategory.IMAGE;
    }
    if (/analiza|analisis|revisar|examina|informe|reporte|evalua/i.test(intent)) {
      return IntentCategory.ANALYSIS;
    }
    if (/workflow|automatiza|pipeline|flujo/i.test(intent)) {
      return IntentCategory.WORKFLOW;
    }
    // Código al final para evitar falsos positivos
    if (/codigo|programa|debug|funcion|script|python|javascript|ejecuta|implementa/i.test(intent)) {
      return IntentCategory.CODE;
    }
    return IntentCategory.CHAT;
  }

  /**
   * Agregar tareas para código
   */
  addCodeTasks(plan, intent, analysis) {
    // Tarea principal de chat/código
    plan.addTask(
      new SubTask({
        name: 'Code Generation Task',
        description: 'Generar o analizar código según la intención',
        type: 'code',
        runtime: 'LLMRuntime',
        capabilities: [Capability.LLM_CHAT, Capability.CODE_EXECUTION],
        input: { intent, context: 'code_generation' },
      }),
    );

    // Si requiere ejecución
    if (/ejecuta|run|test|prueba/i.test(intent)) {
      plan.addTask(
        new SubTask({
          name: 'Code Execution Task',
          description: 'Ejecutar el código generado',
          type: 'execution',
          runtime: 'CodeRuntime',
          capabilities: [Capability.CODE_EXECUTION],
          input: { intent },
          dependencies: [],
          optional: false,
        }),
      );
    }
  }

  /**
   * Agregar tareas para búsqueda
   */
  addSearchTasks(plan, intent, analysis) {
    // Tarea de búsqueda web
    plan.addTask(
      new SubTask({
        name: 'Web Search Task',
        description: 'Buscar información en la web',
        type: 'search',
        runtime: 'SearchRuntime',
        capabilities: [Capability.WEB_SEARCH],
        input: { query: intent },
      }),
    );

    // Tarea de síntesis (opcional)
    if (analysis.complexity !== 'simple') {
      plan.addTask(
        new SubTask({
          name: 'Search Synthesis Task',
          description: 'Sintetizar resultados de búsqueda',
          type: 'synthesis',
          runtime: 'LLMRuntime',
          capabilities: [Capability.LLM_CHAT],
          input: { intent },
          dependencies: [],
          optional: true,
        }),
      );
    }
  }

  /**
   * Agregar tareas para imágenes
   */
  addImageTasks(plan, intent, analysis) {
    // Tarea de generación de imagen
    plan.addTask(
      new SubTask({
        name: 'Image Generation Task',
        description: 'Generar imagen según la descripción',
        type: 'image',
        runtime: 'ImageRuntime',
        capabilities: [Capability.IMAGE_GENERATION],
        input: { prompt: intent },
      }),
    );

    // Tarea de refinamiento (opcional)
    if (/refina|mejora|modifica/i.test(intent)) {
      plan.addTask(
        new SubTask({
          name: 'Image Refinement Task',
          description: 'Refinar la imagen generada',
          type: 'image_edit',
          runtime: 'ImageRuntime',
          capabilities: [Capability.IMAGE_EDITING],
          input: { intent },
          dependencies: [],
          optional: true,
        }),
      );
    }
  }

  /**
   * Agregar tareas para análisis
   */
  addAnalysisTasks(plan, intent, analysis) {
    // Tarea de análisis
    plan.addTask(
      new SubTask({
        name: 'Analysis Task',
        description: 'Analizar y procesar la solicitud',
        type: 'analysis',
        runtime: 'LLMRuntime',
        capabilities: [Capability.LLM_CHAT, Capability.LLM_REASONING],
        input: { intent, analysisType: analysis },
      }),
    );

    // Tareas adicionales según complejidad
    if (analysis.requiresSearch) {
      plan.addTask(
        new SubTask({
          name: 'Research Task',
          description: 'Investigar información relevante',
          type: 'search',
          runtime: 'SearchRuntime',
          capabilities: [Capability.WEB_SEARCH],
          input: { query: intent },
          dependencies: [],
          optional: true,
        }),
      );
    }

    if (analysis.requiresDocumentation) {
      plan.addTask(
        new SubTask({
          name: 'Documentation Task',
          description: 'Generar documentación del análisis',
          type: 'documentation',
          runtime: 'LLMRuntime',
          capabilities: [Capability.LLM_CHAT],
          input: { intent },
          dependencies: [],
          optional: true,
        }),
      );
    }

    // Tarea final de informe
    if (analysis.complexity === 'complex') {
      plan.addTask(
        new SubTask({
          name: 'Report Generation Task',
          description: 'Generar informe completo',
          type: 'report',
          runtime: 'LLMRuntime',
          capabilities: [Capability.LLM_CHAT],
          input: { intent },
          dependencies: [],
          optional: true,
        }),
      );
    }
  }

  /**
   * Agregar tareas para workflows
   */
  addWorkflowTasks(plan, intent, analysis) {
    // Tareas secuenciales para workflow
    const workflowSteps = this.extractWorkflowSteps(intent);

    for (let i = 0; i < workflowSteps.length; i++) {
      const step = workflowSteps[i];
      const prevStepId = i > 0 ? plan.tasks[i - 1].id : null;

      plan.addTask(
        new SubTask({
          name: `Workflow Step ${i + 1}: ${step.name}`,
          description: step.description,
          type: 'workflow_step',
          runtime: step.runtime || 'LLMRuntime',
          capabilities: step.capabilities || [Capability.LLM_CHAT],
          input: { step, originalIntent: intent },
          dependencies: prevStepId ? [prevStepId] : [],
        }),
      );
    }
  }

  /**
   * Agregar tareas para chat simple
   */
  addChatTasks(plan, intent, analysis) {
    plan.addTask(
      new SubTask({
        name: 'Chat Task',
        description: 'Responder al usuario',
        type: 'chat',
        runtime: 'LLMRuntime',
        capabilities: [Capability.LLM_CHAT],
        input: { intent },
      }),
    );
  }

  /**
   * Extraer pasos de un workflow
   */
  extractWorkflowSteps(intent) {
    const steps = [];

    // Detectar conectores de secuencia
    const connectors = ['primero', 'luego', 'después', 'finally', 'finally'];

    // Dividir por conectores
    const parts = intent.split(new RegExp(connectors.join('|'), 'i'));

    for (const part of parts) {
      if (part.trim()) {
        steps.push({
          name: part.trim().substring(0, 30),
          description: part.trim(),
          runtime: 'LLMRuntime',
          capabilities: [Capability.LLM_CHAT],
        });
      }
    }

    // Si no hay pasos claros, crear un paso único
    if (steps.length === 0) {
      steps.push({
        name: 'Main Task',
        description: intent,
        runtime: 'LLMRuntime',
        capabilities: [Capability.LLM_CHAT],
      });
    }

    return steps;
  }

  /**
   * Validar el plan
   */
  validatePlan(plan) {
    if (plan.tasks.length > this.config.maxTasksPerPlan) {
      logger.warn('[TaskPlanner] Plan exceeds max tasks, truncating');
      plan.tasks = plan.tasks.slice(0, this.config.maxTasksPerPlan);
    }

    // Verificar dependencias válidas
    const taskIds = new Set(plan.tasks.map((t) => t.id));
    for (const task of plan.tasks) {
      for (const depId of task.dependencies) {
        if (!taskIds.has(depId)) {
          logger.warn(`[TaskPlanner] Invalid dependency: ${depId} for task ${task.id}`);
          task.dependencies = task.dependencies.filter((id) => id !== depId);
        }
      }
    }

    return plan;
  }

  /**
   * Ejecutar un plan
   */
  async executePlan(plan, executor) {
    const results = [];
    const completedTaskIds = [];

    logger.info(`[TaskPlanner] Executing plan ${plan.id} with ${plan.tasks.length} tasks`);

    // Publicar evento de inicio
    this.eventBus.publish(
      'workflow.started',
      {
        planId: plan.id,
        taskCount: plan.tasks.length,
      },
      'TaskPlanner',
    );

    try {
      // Ejecutar en orden topológico
      const executionOrder = plan.topologicalOrder;

      for (const task of executionOrder) {
        // Verificar que las dependencias están completas
        const depsCompleted = task.dependencies.every((depId) => completedTaskIds.includes(depId));

        if (!depsCompleted) {
          logger.warn(`[TaskPlanner] Skipping task ${task.id} - dependencies not met`);
          continue;
        }

        logger.info(`[TaskPlanner] Executing task: ${task.name}`);

        this.eventBus.publish(
          'workflow.step_started',
          {
            planId: plan.id,
            taskId: task.id,
            taskName: task.name,
          },
          'TaskPlanner',
        );

        try {
          // Ejecutar la tarea usando el executor
          const result = await executor(task);
          task.result = result;
          task.status = 'completed';
          completedTaskIds.push(task.id);
          results.push({ taskId: task.id, result, success: true });

          this.eventBus.publish(
            'workflow.step_finished',
            {
              planId: plan.id,
              taskId: task.id,
              taskName: task.name,
            },
            'TaskPlanner',
          );
        } catch (error) {
          task.error = error.message;
          task.status = task.optional ? 'skipped' : 'failed';
          results.push({ taskId: task.id, error: error.message, success: false });

          if (!task.optional) {
            throw error;
          }
        }
      }

      this.eventBus.publish(
        'workflow.completed',
        {
          planId: plan.id,
          completedTasks: completedTaskIds.length,
          totalTasks: plan.tasks.length,
        },
        'TaskPlanner',
      );

      return {
        success: true,
        planId: plan.id,
        results,
        completedTasks: completedTaskIds.length,
      };
    } catch (error) {
      this.eventBus.publish(
        'workflow.failed',
        {
          planId: plan.id,
          error: error.message,
        },
        'TaskPlanner',
      );

      return {
        success: false,
        planId: plan.id,
        error: error.message,
        results,
        completedTasks: completedTaskIds.length,
      };
    }
  }
}

// Singleton
let plannerInstance = null;

function getTaskPlanner() {
  if (!plannerInstance) {
    plannerInstance = new TaskPlanner();
  }
  return plannerInstance;
}

module.exports = {
  TaskPlanner,
  SubTask,
  Plan,
  IntentCategory,
  AnalysisType,
  getTaskPlanner,
};
