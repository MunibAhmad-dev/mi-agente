/**
 * MultiAgentController Service
 *
 * Controlador para gestionar múltiples agentes IA simultáneamente
 */

const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

// EventBus integration
let eventBus = null;
try {
  const eventBusModule = require('../EventBus');
  eventBus = eventBusModule.getEventBus();
} catch (err) {
  console.warn('[MultiAgentController] EventBus not available:', err.message);
}

// Supervisor Event Types
const {
  SupervisorEventTypes,
  createSessionPayload,
  createAgentPayload,
  createTaskPayload,
} = require('../EventBus/SupervisorEventTypes');

/**
 * Estados de un agente
 */
const AgentStatus = {
  IDLE: 'idle',
  THINKING: 'thinking',
  ACTING: 'acting',
  WAITING: 'waiting',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  ERROR: 'error',
};

/**
 * Estados de la sesión multi-agente
 */
const SessionStatus = {
  CREATING: 'creating',
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
  STOPPED: 'stopped',
};

/**
 * Tipos de agente
 */
const AgentType = {
  COORDINATOR: 'coordinator',
  RESEARCHER: 'researcher',
  CODER: 'coder',
  REVIEWER: 'reviewer',
  TESTER: 'tester',
  CUSTOM: 'custom',
};

/**
 * Prioridades de tarea
 */
const TaskPriority = {
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/**
 * Adaptador de persistencia por defecto: modelo Mongoose real
 * (api/models/MultiAgentSession). Se carga de forma perezosa para que los
 * tests unitarios no dependan del alias `~` ni de una base de datos.
 *
 * Interfaz esperada por el controller:
 *   upsert(doc) → Promise
 *   remove(sid) → Promise
 *   list()      → Promise<Array<doc>>  (docs con `sid`, `agents`, `tasks`, …)
 */
function createMongoPersistence() {
  let model = null;
  const getModel = () => {
    if (!model) {
      model = require('~/models/MultiAgentSession');
    }
    return model;
  };
  return {
    async upsert(doc) {
      await getModel().findOneAndUpdate({ sid: doc.sid }, doc, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      });
    },
    async remove(sid) {
      await getModel().deleteOne({ sid });
    },
    async list() {
      return getModel().find().lean();
    },
  };
}

/**
 * Clase principal del MultiAgentController
 */
class MultiAgentController extends EventEmitter {
  constructor({ persistence } = {}) {
    super();
    this.sessions = new Map();
    this.agents = new Map();
    this.tasks = new Map();
    this.initialized = false;
    // Cierre del pendiente del gate de FASE 1: persistencia en Mongo para que
    // sesiones, agentes y tareas sobrevivan reinicios del API. Se inyecta en
    // tests (adaptador fake); por defecto usa el modelo Mongoose real.
    this.persistence = persistence || createMongoPersistence();
    this.persistFailures = 0;
  }

  /**
   * Inicializar el controlador: hidrata los Mapas desde la persistencia.
   * Se llama automáticamente al inicio de cualquier operación (lectura o
   * escritura), de modo que tras un reinicio del API las sesiones se
   * recuperan sin configuración extra. Si la base no está disponible, el
   * controlador continúa en memoria (nunca rompe la operación).
   */
  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const docs = await this.persistence.list();
      for (const doc of docs) {
        this._loadSession(doc);
      }
      console.log(`[MultiAgentController] Hydrated ${docs.length} session(s) from persistence`);
    } catch (err) {
      console.warn(
        `[MultiAgentController] Hydration failed (continuing in-memory): ${err.message}`,
      );
    }
  }

  /**
   * Reconstruye una sesión (con agentes y tareas) en los Mapas a partir de un
   * documento persistido. Semántica de recuperación tras reinicio:
   *   - agentes THINKING/ACTING/WAITING → IDLE;
   *   - tareas assigned/in_progress → pending y desasignadas (se re-despachan).
   */
  _loadSession(doc) {
    const session = {
      id: doc.sid,
      userId: doc.userId,
      name: doc.name || `Session ${doc.sid}`,
      description: doc.description || '',
      status: doc.status || SessionStatus.READY,
      createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date(),
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : new Date(),
      agents: [],
      tasks: [],
      events: Array.isArray(doc.events) ? doc.events : [],
      config: doc.config || {},
      stats: doc.stats || { totalTasks: 0, completedTasks: 0, failedTasks: 0, totalMessages: 0 },
    };

    for (const a of doc.agents || []) {
      const agent = {
        id: a.id,
        sessionId: a.sessionId || session.id,
        type: a.type || AgentType.CUSTOM,
        name: a.name || `${a.type || 'Agent'} ${a.id}`,
        status: a.status || AgentStatus.IDLE,
        createdAt: a.createdAt ? new Date(a.createdAt) : new Date(),
        lastActive: a.lastActive ? new Date(a.lastActive) : new Date(),
        capabilities: a.capabilities || [],
        tools: a.tools || [],
        config: a.config || {},
        stats: a.stats || {
          tasksCompleted: 0,
          tasksFailed: 0,
          messagesReceived: 0,
          messagesSent: 0,
        },
        currentTask: null,
        queue: a.queue || [],
      };
      if ([AgentStatus.THINKING, AgentStatus.ACTING, AgentStatus.WAITING].includes(agent.status)) {
        agent.status = AgentStatus.IDLE;
      }
      this.agents.set(agent.id, agent);
      session.agents.push(agent.id);
    }

    for (const t of doc.tasks || []) {
      const task = {
        id: t.id,
        sessionId: t.sessionId || session.id,
        agentId: t.agentId || null,
        title: t.title || '',
        description: t.description || '',
        status: t.status || 'pending',
        priority: t.priority || TaskPriority.NORMAL,
        createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
        assignedAt: t.assignedAt ? new Date(t.assignedAt) : null,
        startedAt: t.startedAt ? new Date(t.startedAt) : null,
        completedAt: t.completedAt ? new Date(t.completedAt) : null,
        result: t.result ?? null,
        error: t.error ?? null,
        context: t.context || {},
        dependencies: t.dependencies || [],
        subtasks: t.subtasks || [],
        contextReport: t.contextReport ?? null,
      };
      if (task.status === 'assigned' || task.status === 'in_progress') {
        task.status = 'pending';
        task.agentId = null;
        task.assignedAt = null;
        task.startedAt = null;
      }
      this.tasks.set(task.id, task);
      session.tasks.push(task.id);
    }

    this.sessions.set(session.id, session);
  }

  /**
   * Persiste el estado completo de una sesión (best-effort). Nunca lanza:
   * si la base falla, la operación en memoria continúa y el error se cuenta.
   */
  async _persist(session) {
    if (!this.persistence || !session) return;
    try {
      await this.persistence.upsert({
        sid: session.id,
        userId: session.userId,
        name: session.name,
        description: session.description,
        status: session.status,
        createdAt: session.createdAt,
        updatedAt: new Date(),
        config: session.config,
        stats: session.stats,
        agents: session.agents
          .map((id) => this.agents.get(id))
          .filter(Boolean)
          .map((a) => ({ ...a })),
        tasks: session.tasks
          .map((id) => this.tasks.get(id))
          .filter(Boolean)
          .map((t) => ({ ...t })),
        events: session.events.slice(-1000),
      });
    } catch (err) {
      this.persistFailures += 1;
      console.warn(`[MultiAgentController] Persist failed (${session.id}): ${err.message}`);
    }
  }

  /** Elimina una sesión de la persistencia (best-effort). */
  async _destroyPersisted(sessionId) {
    if (!this.persistence) return;
    try {
      await this.persistence.remove(sessionId);
    } catch (err) {
      console.warn(`[MultiAgentController] Remove persisted failed (${sessionId}): ${err.message}`);
    }
  }

  /**
   * Crear una nueva sesión multi-agente
   */
  async createSession({ userId, name, description, config = {} }) {
    await this.initialize();

    const sessionId = `session_${uuidv4().slice(0, 8)}`;

    const session = {
      id: sessionId,
      userId,
      name: name || `Session ${sessionId}`,
      description: description || '',
      status: SessionStatus.CREATING,
      createdAt: new Date(),
      updatedAt: new Date(),
      agents: [],
      tasks: [],
      events: [],
      config: {
        maxConcurrentAgents: config.maxConcurrentAgents || 3,
        allowAgentCommunication: config.allowAgentCommunication ?? true,
        enableCoordinator: config.enableCoordinator ?? true,
        taskDistribution: config.taskDistribution || 'auto', // auto, manual, priority
        ...config,
      },
      stats: {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        totalMessages: 0,
      },
    };

    // FASE 1: la sesión pasa a READY tras crearse (antes quedaba en 'creating'
    // para siempre porque no había transición).
    session.status = SessionStatus.READY;

    this.sessions.set(sessionId, session);
    console.log(`[MultiAgentController] Created session: ${sessionId}`);

    // Emitir evento de sesión creada
    this.emitEvent(sessionId, 'session_created', { name: session.name });

    // FASE 1 (pendiente cerrado): persistir para que la sesión sobreviva
    // reinicios del API.
    await this._persist(session);

    return this.formatSession(session);
  }

  /**
   * Agregar un agente a una sesión
   */
  async addAgent({ sessionId, type, name, config = {} }) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const agentId = `agent_${uuidv4().slice(0, 8)}`;

    const agent = {
      id: agentId,
      sessionId,
      type: type || AgentType.CUSTOM,
      name: name || `${type || 'Agent'} ${agentId}`,
      status: AgentStatus.IDLE,
      createdAt: new Date(),
      lastActive: new Date(),
      capabilities: config.capabilities || [],
      tools: config.tools || [],
      config: {
        model: config.model || 'default',
        temperature: config.temperature || 0.7,
        maxTokens: config.maxTokens || 4000,
        ...config,
      },
      stats: {
        tasksCompleted: 0,
        tasksFailed: 0,
        messagesReceived: 0,
        messagesSent: 0,
      },
      currentTask: null,
      queue: [],
    };

    this.agents.set(agentId, agent);
    session.agents.push(agentId);

    this.emitEvent(sessionId, 'agent_added', {
      agentId,
      type: agent.type,
      name: agent.name,
    });

    await this._persist(session);

    return this.formatAgent(agent);
  }

  /**
   * Crear una tarea para un agente o sesión
   */
  async createTask({ sessionId, agentId, title, description, priority, context = {} }) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const taskId = `task_${uuidv4().slice(0, 8)}`;

    const task = {
      id: taskId,
      sessionId,
      agentId: agentId || null,
      title,
      description: description || '',
      status: 'pending', // pending, assigned, in_progress, completed, failed
      priority: priority || TaskPriority.NORMAL,
      createdAt: new Date(),
      assignedAt: null,
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
      context,
      dependencies: [],
      subtasks: [],
    };

    this.tasks.set(taskId, task);
    session.tasks.push(taskId);
    session.stats.totalTasks++;

    this.emitEvent(sessionId, 'task_created', {
      taskId,
      title: task.title,
      priority: task.priority,
    });

    // Distribuir tarea si está habilitado
    if (session.config.taskDistribution === 'auto' && !agentId) {
      await this.distributeTask(taskId);
    }

    await this._persist(session);

    return this.formatTask(task);
  }

  /**
   * Distribuir tarea a un agente disponible
   */
  async distributeTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const session = this.sessions.get(task.sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Encontrar agentes disponibles
    const availableAgents = session.agents
      .map((id) => this.agents.get(id))
      .filter((agent) => agent && agent.status === AgentStatus.IDLE);

    if (availableAgents.length === 0) {
      console.log(`[MultiAgentController] No available agents for task ${taskId}`);
      return null;
    }

    // Seleccionar agente según prioridad o round-robin
    let selectedAgent;
    if (task.priority >= TaskPriority.HIGH) {
      // Prioridad alta: usar primer agente disponible
      selectedAgent = availableAgents[0];
    } else {
      // Normal: usar agente con menos tareas
      selectedAgent = availableAgents.reduce((best, agent) => {
        return best.stats.tasksCompleted <= agent.stats.tasksCompleted ? best : agent;
      });
    }

    return this.assignTask({ taskId, agentId: selectedAgent.id });
  }

  /**
   * Asignar tarea a un agente específico
   */
  async assignTask({ taskId, agentId }) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    task.agentId = agentId;
    task.status = 'assigned';
    task.assignedAt = new Date();

    agent.currentTask = taskId;
    agent.status = AgentStatus.WAITING;

    this.emitEvent(task.sessionId, 'task_assigned', {
      taskId,
      agentId,
      agentName: agent.name,
    });

    await this._persist(this.sessions.get(task.sessionId));

    return this.formatTask(task);
  }

  /**
   * Iniciar ejecución de un agente
   */
  async startAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    const session = this.sessions.get(agent.sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (agent.currentTask) {
      const task = this.tasks.get(agent.currentTask);
      if (task) {
        task.status = 'in_progress';
        task.startedAt = new Date();
      }
      agent.status = AgentStatus.THINKING;
      session.status = SessionStatus.RUNNING;
      // FASE 1 — EJECUCIÓN REAL: lanza la tarea contra un LLM real (Ollama local,
      // mismo runtime que el chat del dashboard). No bloquea startAgent: la
      // finalización llega por evento (task_completed / task_failed).
      void this.executeTaskWithModel(task, agent);
    } else {
      agent.status = AgentStatus.IDLE;
    }

    agent.lastActive = new Date();

    this.emitEvent(session.id, 'agent_started', {
      agentId,
      agentName: agent.name,
    });

    await this._persist(session);

    return this.formatAgent(agent);
  }

  /**
   * Pausar un agente
   */
  async pauseAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    const previousStatus = agent.status;
    agent.status = AgentStatus.PAUSED;
    agent.lastActive = new Date();

    this.emitEvent(agent.sessionId, 'agent_paused', {
      agentId,
      previousStatus,
    });

    await this._persist(this.sessions.get(agent.sessionId));

    return this.formatAgent(agent);
  }

  /**
   * Reanudar un agente pausado
   */
  async resumeAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    agent.status = AgentStatus.IDLE;
    agent.lastActive = new Date();

    if (agent.currentTask) {
      const task = this.tasks.get(agent.currentTask);
      if (task) {
        task.status = 'in_progress';
        agent.status = AgentStatus.THINKING;
      }
    }

    this.emitEvent(agent.sessionId, 'agent_resumed', {
      agentId,
      agentName: agent.name,
    });

    await this._persist(this.sessions.get(agent.sessionId));

    return this.formatAgent(agent);
  }

  /**
   * Detener un agente
   */
  async stopAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    if (agent.currentTask) {
      const task = this.tasks.get(agent.currentTask);
      if (task && task.status === 'in_progress') {
        task.status = 'pending';
        task.agentId = null;
        task.startedAt = null;
      }
    }

    agent.status = AgentStatus.STOPPED;
    agent.currentTask = null;
    agent.lastActive = new Date();

    this.emitEvent(agent.sessionId, 'agent_stopped', {
      agentId,
      agentName: agent.name,
    });

    await this._persist(this.sessions.get(agent.sessionId));

    return this.formatAgent(agent);
  }

  /**
   * FASE 1 — EJECUTOR REAL de tareas de agentes.
   *
   * Ejecuta la tarea asignada a un agente contra un LLM REAL (Ollama local,
   * endpoint OpenAI-compatible de chat-ollama en la red del stack). Al terminar:
   *   - éxito → completeTask (el agente vuelve a IDLE y se distribuye la siguiente)
   *   - error → failTask (el agente pasa a ERROR)
   *
   * El modelo sale de `agent.config.model` (default qwen3:0.6b, rápido en CPU).
   * Es asíncrono y no bloquea startAgent: la finalización llega por evento.
   */
  /**
   * FASE 5 — CONTEXT MANAGER: ensambla el contexto relevante del agente
   * (memoria del proyecto + RAG vectorial + ejecuciones previas de la sesión)
   * con relevancia, deduplicación y presupuesto de tokens. Nunca rompe la
   * ejecución: si una fuente falla, el agente trabaja sin esa fuente.
   */
  async buildContextForTask(task, agent, prompt) {
    try {
      const { fetchContextForAgent } = require('../AgentArchitect/contextManager');
      const session = this.sessions.get(agent.sessionId);
      const history =
        (session?.tasks || [])
          .map((id) => this.tasks.get(id))
          .filter((t) => t && t.result)
          .slice(-5)
          .map((t) => ({
            taskId: t.id,
            title: t.title,
            description: t.description,
            result: t.result,
          })) || [];
      const ctx = await fetchContextForAgent({
        task: prompt,
        agent: { name: agent.name, type: agent.type },
        userId: session?.userId,
        executionHistory: history,
        budgetTokens: Number(process.env.AGENT_CONTEXT_BUDGET_TOKENS || 3000),
        logger: console,
      });
      const text = ctx.blocks.length
        ? ctx.blocks
            .map((b) => `[${b.source}]${b.key ? ` (${b.key})` : ''}: ${b.content}`)
            .join('\n')
        : '';
      return {
        text,
        report: {
          ...ctx.stats,
          sourceErrors: ctx.sourceErrors,
          blocks: ctx.blocks.map((b) => ({
            source: b.source,
            tokens: b.tokens,
            relevance: b.relevance,
          })),
        },
      };
    } catch (err) {
      console.warn(`[MultiAgentController] Context build falló (no fatal): ${err.message}`);
      return { text: '', report: { error: err.message } };
    }
  }

  async executeTaskWithModel(task, agent) {
    const model = agent.config?.model || 'qwen3:0.6b';
    const prompt = task.description || task.title;
    const OLLAMA_URL = process.env.OLLAMA_INTERNAL_URL || 'http://ollama:11434/v1/chat/completions';
    try {
      // FASE 5: contexto relevante (memoria + RAG + ejecuciones previas).
      const { text: contextText, report: contextReport } = await this.buildContextForTask(
        task,
        agent,
        prompt,
      );
      task.contextReport = contextReport;

      agent.status = AgentStatus.ACTING;
      this.emitEvent(agent.sessionId, 'task_progress', {
        taskId: task.id,
        agentId: agent.id,
        progress: 0.1,
      });
      // FASE 1 (persistencia): guardar el reporte de contexto para que
      // sobreviva a un reinicio a mitad de ejecución.
      await this._persist(this.sessions.get(agent.sessionId));
      const systemContent =
        `Eres "${agent.name}" (rol: ${agent.type}). Completa la tarea asignada ` +
        'con precisión y concisión, en el idioma de la tarea.' +
        (contextText
          ? '\n\nUsa SOLO el contexto relevante que se te da; no inventes datos que no estén en él.\n' +
            'CONTEXTO RELEVANTE:\n' +
            contextText
          : '');
      const res = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemContent },
            { role: 'user', content: prompt },
          ],
          stream: false,
        }),
        signal: AbortSignal.timeout(240000),
      });
      if (!res.ok) {
        throw new Error(`Ollama respondió HTTP ${res.status}`);
      }
      const json = await res.json();
      const text = json?.choices?.[0]?.message?.content || '';
      if (!text.trim()) {
        throw new Error('El modelo devolvió una respuesta vacía');
      }
      agent.stats.messagesReceived += 1;
      agent.stats.messagesSent += 1;
      await this.completeTask({ taskId: task.id, result: text.trim() });
    } catch (error) {
      console.error(
        `[MultiAgentController] Agent ${agent.id} (${agent.name}) falló:`,
        error.message,
      );
      await this.failTask({ taskId: task.id, error: error.message });
    }
  }

  /**
   * Marcar tarea como completada
   */
  async completeTask({ taskId, result }) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const session = this.sessions.get(task.sessionId);
    const agent = task.agentId ? this.agents.get(task.agentId) : null;

    task.status = 'completed';
    task.completedAt = new Date();
    task.result = result;

    if (agent) {
      agent.currentTask = null;
      agent.status = AgentStatus.IDLE;
      agent.stats.tasksCompleted++;
    }

    if (session) {
      session.stats.completedTasks++;
    }

    this.emitEvent(task.sessionId, 'task_completed', {
      taskId,
      result,
    });

    // Distribuir siguiente tarea si hay
    if (session && session.config.taskDistribution === 'auto') {
      const pendingTasks = session.tasks
        .map((id) => this.tasks.get(id))
        .filter((t) => t && t.status === 'pending');

      if (pendingTasks.length > 0) {
        await this.distributeTask(pendingTasks[0].id);
      }
    }

    await this._persist(session);

    return this.formatTask(task);
  }

  /**
   * Marcar tarea como fallida
   */
  async failTask({ taskId, error }) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const session = this.sessions.get(task.sessionId);
    const agent = task.agentId ? this.agents.get(task.agentId) : null;

    task.status = 'failed';
    task.completedAt = new Date();
    task.error = error;

    if (agent) {
      agent.currentTask = null;
      agent.status = AgentStatus.ERROR;
      agent.stats.tasksFailed++;
    }

    if (session) {
      session.stats.failedTasks++;
    }

    this.emitEvent(task.sessionId, 'task_failed', {
      taskId,
      error,
    });

    await this._persist(session);

    return this.formatTask(task);
  }

  /**
   * Enviar mensaje entre agentes
   */
  async sendMessage({ fromAgentId, toAgentId, content, type = 'text' }) {
    const fromAgent = this.agents.get(fromAgentId);
    const toAgent = this.agents.get(toAgentId);

    if (!fromAgent || !toAgent) {
      throw new Error('Agent not found');
    }

    // FASE 1: comparación corregida (antes `!a === b` era siempre falsa y dejaba
    // pasar mensajes entre sesiones distintas).
    if (fromAgent.sessionId !== toAgent.sessionId) {
      throw new Error('Agents must be in the same session');
    }

    const message = {
      id: `msg_${uuidv4().slice(0, 8)}`,
      fromAgentId,
      toAgentId,
      content,
      type,
      timestamp: new Date(),
    };

    fromAgent.stats.messagesSent++;
    toAgent.stats.messagesReceived++;

    const session = this.sessions.get(fromAgent.sessionId);
    if (session) {
      session.stats.totalMessages++;
    }

    this.emitEvent(fromAgent.sessionId, 'agent_message', message);

    await this._persist(session);

    return message;
  }

  /**
   * Obtener estado de sesión
   */
  async getSession(sessionId) {
    await this.initialize();
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return this.formatSession(session);
  }

  /**
   * Listar sesiones de un usuario
   */
  async listSessions(userId) {
    await this.initialize();
    const userSessions = [];
    for (const [id, session] of this.sessions) {
      if (session.userId === userId) {
        userSessions.push(this.formatSession(session));
      }
    }
    return userSessions;
  }

  /**
   * Obtener agentes de una sesión
   */
  async getSessionAgents(sessionId) {
    await this.initialize();
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    return session.agents
      .map((id) => this.agents.get(id))
      .filter(Boolean)
      .map((agent) => this.formatAgent(agent));
  }

  /**
   * Obtener tareas de una sesión
   */
  async getSessionTasks(sessionId, options = {}) {
    await this.initialize();
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    let tasks = session.tasks
      .map((id) => this.tasks.get(id))
      .filter(Boolean)
      .map((task) => this.formatTask(task));

    // Filtrar por estado
    if (options.status) {
      tasks = tasks.filter((t) => t.status === options.status);
    }

    // Ordenar por prioridad (descendente)
    tasks.sort((a, b) => b.priority - a.priority);

    return tasks;
  }

  /**
   * Pausar sesión completa
   */
  async pauseSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.status = SessionStatus.PAUSED;
    session.updatedAt = new Date();

    // Pausar todos los agentes
    for (const agentId of session.agents) {
      const agent = this.agents.get(agentId);
      if (agent && agent.status !== AgentStatus.STOPPED) {
        agent.status = AgentStatus.PAUSED;
      }
    }

    this.emitEvent(sessionId, 'session_paused', {});

    await this._persist(session);

    return this.formatSession(session);
  }

  /**
   * Reanudar sesión
   */
  async resumeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.status = SessionStatus.RUNNING;
    session.updatedAt = new Date();

    // Reanudar agentes
    for (const agentId of session.agents) {
      const agent = this.agents.get(agentId);
      if (agent && agent.status === AgentStatus.PAUSED) {
        agent.status = AgentStatus.IDLE;
      }
    }

    this.emitEvent(sessionId, 'session_resumed', {});

    await this._persist(session);

    return this.formatSession(session);
  }

  /**
   * Destruir sesión
   */
  async destroySession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Detener y remover agentes
    for (const agentId of session.agents) {
      const agent = this.agents.get(agentId);
      if (agent) {
        agent.status = AgentStatus.STOPPED;
        this.emitEvent(sessionId, 'agent_stopped', { agentId });
        this.agents.delete(agentId);
      }
    }

    // Remover tareas
    for (const taskId of session.tasks) {
      this.tasks.delete(taskId);
    }

    // Emitir evento de sesión terminada antes de eliminar
    this.emitEvent(sessionId, 'session_ended', {});

    this.sessions.delete(sessionId);
    console.log(`[MultiAgentController] Destroyed session: ${sessionId}`);

    await this._destroyPersisted(sessionId);

    return { success: true };
  }

  // ============ Métodos auxiliares ============

  /**
   * Emitir evento
   */
  emitEvent(sessionId, eventType, data) {
    const event = {
      id: `evt_${uuidv4().slice(0, 8)}`,
      sessionId,
      type: eventType,
      data,
      timestamp: new Date(),
    };

    const session = this.sessions.get(sessionId);
    if (session) {
      session.events.push(event);
      // Limitar historial a últimos 1000 eventos
      if (session.events.length > 1000) {
        session.events = session.events.slice(-1000);
      }
    }

    this.emit('event', event);

    // Publish to global EventBus
    this.publishToEventBus(sessionId, eventType, data, session?.userId);
  }

  /**
   * Publicar eventos al EventBus global
   */
  publishToEventBus(sessionId, internalEventType, data, userId) {
    if (!eventBus) return;

    try {
      const eventMapping = {
        // Sesiones
        session_created: {
          type: SupervisorEventTypes.SUPERVISOR_SESSION_CREATED,
          payload: (d) => ({ sessionId, name: d.name, userId }),
        },
        session_ended: {
          type: SupervisorEventTypes.SUPERVISOR_SESSION_ENDED,
          payload: (d) => ({ sessionId, userId }),
        },
        session_paused: {
          type: SupervisorEventTypes.SUPERVISOR_SESSION_PAUSED,
          payload: (d) => ({ sessionId, userId }),
        },
        session_resumed: {
          type: SupervisorEventTypes.SUPERVISOR_SESSION_RESUMED,
          payload: (d) => ({ sessionId, userId }),
        },
        // Agentes
        agent_added: {
          type: SupervisorEventTypes.SUPERVISOR_AGENT_ADDED,
          payload: (d) => ({ sessionId, agentId: d.agentId, type: d.type, name: d.name, userId }),
        },
        agent_removed: {
          type: SupervisorEventTypes.SUPERVISOR_AGENT_REMOVED,
          payload: (d) => ({ sessionId, agentId: d.agentId, userId }),
        },
        agent_started: {
          type: SupervisorEventTypes.SUPERVISOR_AGENT_STARTED,
          payload: (d) => ({ sessionId, agentId: d.agentId, userId }),
        },
        agent_paused: {
          type: SupervisorEventTypes.SUPERVISOR_AGENT_PAUSED,
          payload: (d) => ({ sessionId, agentId: d.agentId, userId }),
        },
        agent_resumed: {
          type: SupervisorEventTypes.SUPERVISOR_AGENT_RESUMED,
          payload: (d) => ({ sessionId, agentId: d.agentId, userId }),
        },
        agent_stopped: {
          type: SupervisorEventTypes.SUPERVISOR_AGENT_STOPPED,
          payload: (d) => ({ sessionId, agentId: d.agentId, userId }),
        },
        // Tareas
        task_created: {
          type: SupervisorEventTypes.SUPERVISOR_TASK_CREATED,
          payload: (d) => ({
            sessionId,
            taskId: d.taskId,
            title: d.title,
            priority: d.priority,
            userId,
          }),
        },
        task_assigned: {
          type: SupervisorEventTypes.SUPERVISOR_TASK_ASSIGNED,
          payload: (d) => ({ sessionId, taskId: d.taskId, agentId: d.agentId, userId }),
        },
        task_started: {
          type: SupervisorEventTypes.SUPERVISOR_TASK_STARTED,
          payload: (d) => ({ sessionId, taskId: d.taskId, agentId: d.agentId, userId }),
        },
        task_completed: {
          type: SupervisorEventTypes.SUPERVISOR_TASK_COMPLETED,
          payload: (d) => ({
            sessionId,
            taskId: d.taskId,
            agentId: d.agentId,
            result: d.result,
            userId,
          }),
        },
        task_failed: {
          type: SupervisorEventTypes.SUPERVISOR_TASK_FAILED,
          payload: (d) => ({
            sessionId,
            taskId: d.taskId,
            agentId: d.agentId,
            error: d.error,
            userId,
          }),
        },
        task_progress: {
          type: SupervisorEventTypes.SUPERVISOR_TASK_PROGRESS,
          payload: (d) => ({
            sessionId,
            taskId: d.taskId,
            agentId: d.agentId,
            progress: d.progress,
            userId,
          }),
        },
        // Mensajes
        message_sent: {
          type: SupervisorEventTypes.SUPERVISOR_MESSAGE_SENT,
          payload: (d) => ({
            sessionId,
            fromAgentId: d.fromAgentId,
            toAgentId: d.toAgentId,
            userId,
          }),
        },
      };

      const mapping = eventMapping[internalEventType];
      if (mapping) {
        // FASE 1: publish ya construye el evento internamente; la llamada previa
        // a eventBus.createEvent (función de módulo, no método de la instancia)
        // lanzaba "createEvent is not a function" y bloqueaba el EventBus global.
        eventBus.publish(mapping.type, mapping.payload(data), 'MultiAgentController', {
          metadata: { sessionId, userId },
        });
      }
    } catch (err) {
      console.error('[MultiAgentController] Failed to publish to EventBus:', err.message);
    }
  }

  /**
   * Formatear sesión para respuesta
   */
  formatSession(session) {
    return {
      id: session.id,
      userId: session.userId,
      name: session.name,
      description: session.description,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      agentCount: session.agents.length,
      taskCount: session.tasks.length,
      config: session.config,
      stats: session.stats,
    };
  }

  /**
   * Formatear agente para respuesta
   */
  formatAgent(agent) {
    return {
      id: agent.id,
      sessionId: agent.sessionId,
      type: agent.type,
      name: agent.name,
      status: agent.status,
      createdAt: agent.createdAt,
      lastActive: agent.lastActive,
      capabilities: agent.capabilities,
      tools: agent.tools,
      config: agent.config,
      stats: agent.stats,
      currentTask: agent.currentTask,
      queueLength: agent.queue.length,
    };
  }

  /**
   * Formatear tarea para respuesta
   */
  formatTask(task) {
    return {
      id: task.id,
      sessionId: task.sessionId,
      agentId: task.agentId,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      createdAt: task.createdAt,
      assignedAt: task.assignedAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      result: task.result,
      error: task.error,
      dependencies: task.dependencies,
      subtasks: task.subtasks,
      // FASE 5: reporte de contexto ensamblado (fuentes, tokens, dedup, drop).
      contextReport: task.contextReport ?? null,
    };
  }
}

// Singleton
const multiAgentController = new MultiAgentController();

module.exports = {
  MultiAgentController,
  multiAgentController,
  AgentStatus,
  SessionStatus,
  AgentType,
  TaskPriority,
};
