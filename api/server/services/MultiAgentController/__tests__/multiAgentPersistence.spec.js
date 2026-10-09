/**
 * multiAgentPersistence.spec.js — cierre del pendiente del gate de FASE 1:
 * persistencia de sesiones/agentes/tareas del MultiAgentController en Mongo.
 *
 * Tests unitarios con un adaptador de persistencia fake (DI, sin base de
 * datos): se verifica que cada mutación persiste y que una instancia NUEVA
 * del controller (simulando un reinicio del API) rehidrata el estado desde
 * el almacenamiento, con la semántica de recuperación correcta (tareas en
 * vuelo → pending, agentes activos → idle).
 */
const { MultiAgentController, AgentStatus, SessionStatus } = require('../MultiAgentController');

/** Adaptador fake con la misma interfaz que el de Mongo (upsert/remove/list). */
function createFakePersistence() {
  const store = new Map(); // sid -> doc
  return {
    store,
    async upsert(doc) {
      store.set(doc.sid, JSON.parse(JSON.stringify(doc)));
    },
    async remove(sid) {
      store.delete(sid);
    },
    async list() {
      return [...store.values()];
    },
  };
}

describe('MultiAgentController persistence (FASE 1 gate)', () => {
  it('createSession persiste la sesión con estado READY', async () => {
    const p = createFakePersistence();
    const c = new MultiAgentController({ persistence: p });
    const session = await c.createSession({ userId: 'u1', name: 'S1' });

    const stored = p.store.get(session.id);
    expect(stored).toBeTruthy();
    expect(stored.sid).toBe(session.id);
    expect(stored.userId).toBe('u1');
    expect(stored.status).toBe(SessionStatus.READY);
  });

  it('addAgent persiste el agente dentro de la sesión', async () => {
    const p = createFakePersistence();
    const c = new MultiAgentController({ persistence: p });
    const session = await c.createSession({ userId: 'u1', name: 'S1' });
    const agent = await c.addAgent({ sessionId: session.id, type: 'researcher', name: 'R1' });

    const stored = p.store.get(session.id);
    expect(stored.agents).toHaveLength(1);
    expect(stored.agents[0].id).toBe(agent.id);
    expect(stored.agents[0].name).toBe('R1');
  });

  it('completeTask persiste el resultado y sobrevive a un "reinicio" (instancia nueva)', async () => {
    const p = createFakePersistence();
    const c1 = new MultiAgentController({ persistence: p });
    const session = await c1.createSession({
      userId: 'u1',
      name: 'S1',
      config: { taskDistribution: 'manual' },
    });
    const agent = await c1.addAgent({ sessionId: session.id, type: 'coder', name: 'C1' });
    const task = await c1.createTask({
      sessionId: session.id,
      agentId: agent.id,
      title: 'T1',
      description: 'escribe código',
    });
    await c1.assignTask({ taskId: task.id, agentId: agent.id });
    await c1.completeTask({ taskId: task.id, result: 'RESULTADO_PERSISTIDO' });

    // "Reinicio": instancia nueva con el MISMO almacenamiento.
    const c2 = new MultiAgentController({ persistence: p });
    const recovered = await c2.getSession(session.id);

    expect(recovered).toBeTruthy();
    expect(recovered.agentCount).toBe(1);
    expect(recovered.taskCount).toBe(1);
    const tasks = await c2.getSessionTasks(session.id);
    expect(tasks[0].status).toBe('completed');
    expect(tasks[0].result).toBe('RESULTADO_PERSISTIDO');
    expect(tasks[0].completedAt).toBeTruthy();
    const agents = await c2.getSessionAgents(session.id);
    expect(agents[0].status).toBe(AgentStatus.IDLE);
    expect(agents[0].stats.tasksCompleted).toBe(1);
  });

  it('tareas en vuelo (assigned/in_progress) se rehidratan como pending y desasignadas', async () => {
    const p = createFakePersistence();
    const c1 = new MultiAgentController({ persistence: p });
    const session = await c1.createSession({
      userId: 'u1',
      name: 'S1',
      config: { taskDistribution: 'manual' },
    });
    const agent = await c1.addAgent({ sessionId: session.id, type: 'researcher', name: 'R1' });
    const task = await c1.createTask({
      sessionId: session.id,
      title: 'T en vuelo',
      description: 'd',
    });
    await c1.assignTask({ taskId: task.id, agentId: agent.id });
    // Simula el estado real de `executeTaskWithModel` a mitad de ejecución
    // (sin llamar a Ollama): tarea in_progress + agente thinking, y persiste.
    const sessionObj = c1.sessions.get(session.id);
    const taskObj = c1.tasks.get(task.id);
    const agentObj = c1.agents.get(agent.id);
    taskObj.status = 'in_progress';
    taskObj.startedAt = new Date();
    agentObj.status = AgentStatus.THINKING;
    await c1._persist(sessionObj);

    const c2 = new MultiAgentController({ persistence: p });
    const tasks = await c2.getSessionTasks(session.id);
    expect(tasks[0].status).toBe('pending');
    expect(tasks[0].agentId).toBeNull();
    const agents = await c2.getSessionAgents(session.id);
    expect(agents[0].status).toBe(AgentStatus.IDLE);
    expect(agents[0].currentTask).toBeNull();
  });

  it('destroySession elimina la sesión también de la persistencia', async () => {
    const p = createFakePersistence();
    const c = new MultiAgentController({ persistence: p });
    const session = await c.createSession({ userId: 'u1', name: 'S1' });
    expect(p.store.has(session.id)).toBe(true);
    await c.destroySession(session.id);
    expect(p.store.has(session.id)).toBe(false);
  });

  it('listSessions hidrata automáticamente una instancia recién creada', async () => {
    const p = createFakePersistence();
    const c1 = new MultiAgentController({ persistence: p });
    const session = await c1.createSession({ userId: 'u1', name: 'S1' });

    // Instancia nueva: NO se llama a initialize explícitamente; el read lo hace.
    const c2 = new MultiAgentController({ persistence: p });
    const sessions = await c2.listSessions('u1');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(session.id);
  });

  it('un fallo de persistencia NO rompe la operación (best-effort)', async () => {
    const p = createFakePersistence();
    p.upsert = async () => {
      throw new Error('mongodb down');
    };
    const c = new MultiAgentController({ persistence: p });
    const session = await c.createSession({ userId: 'u1', name: 'S1' });
    expect(session.id).toBeTruthy();
    expect(c.persistFailures).toBeGreaterThan(0);
    // La sesión sigue disponible en memoria.
    const got = await c.getSession(session.id);
    expect(got.id).toBe(session.id);
  });

  it('persiste sendMessage y pauseSession/resumeSession (estado completo)', async () => {
    const p = createFakePersistence();
    const c = new MultiAgentController({ persistence: p });
    const session = await c.createSession({ userId: 'u1', name: 'S1' });
    const a1 = await c.addAgent({ sessionId: session.id, type: 'coordinator', name: 'A1' });
    const a2 = await c.addAgent({ sessionId: session.id, type: 'coder', name: 'A2' });
    await c.sendMessage({ fromAgentId: a1.id, toAgentId: a2.id, content: 'hola' });

    let stored = p.store.get(session.id);
    expect(stored.stats.totalMessages).toBe(1);
    expect(stored.agents.find((a) => a.id === a1.id).stats.messagesSent).toBe(1);

    await c.pauseSession(session.id);
    stored = p.store.get(session.id);
    expect(stored.status).toBe(SessionStatus.PAUSED);

    await c.resumeSession(session.id);
    stored = p.store.get(session.id);
    expect(stored.status).toBe(SessionStatus.RUNNING);
  });
});
