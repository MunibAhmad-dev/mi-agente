/**
 * MultiAgentPanel Component
 *
 * Panel para control multi-agente
 */

import React, { useState, useCallback } from 'react';
import {
  useListSessions,
  useGetSession,
  useCreateSession,
  usePauseSession,
  useResumeSession,
  useDestroySession,
  useGetSessionAgents,
  useAddAgent,
  useStartAgent,
  usePauseAgent,
  useResumeAgent,
  useStopAgent,
  useGetSessionTasks,
  useCreateTask,
} from '~/hooks/supervisor/useMultiAgent';
import './MultiAgentPanel.css';

type ViewMode = 'sessions' | 'agents' | 'tasks';

/** Reporte de contexto ensamblado por tarea (FASE 5 → UI). */
type ContextBlock = {
  source: string;
  content?: string;
  relevance?: number;
  tokens?: number;
  key?: string;
};

type ContextReport = {
  sourcesConsidered?: { memory?: number; rag?: number; execution?: number };
  dedupRemoved?: number;
  dropped?: number;
  included?: number;
  totalTokens?: number;
  budgetTokens?: number;
  bySource?: { memory?: number; rag?: number; execution?: number };
  blocks?: ContextBlock[];
  sourceErrors?: { source?: string; error?: string }[];
  error?: string;
};

type MultiTask = {
  id: string;
  title: string;
  status: string;
  priority: number;
  agentId: string | null;
  description?: string;
  result?: unknown;
  error?: string | null;
  contextReport?: ContextReport | null;
};

const AGENT_TYPES = [
  { value: 'coordinator', label: 'Coordinator', icon: '🎯', description: 'Coordina y distribuye tareas' },
  { value: 'researcher', label: 'Researcher', icon: '🔍', description: 'Investiga y analiza información' },
  { value: 'coder', label: 'Coder', icon: '💻', description: 'Escribe y modifica código' },
  { value: 'reviewer', label: 'Reviewer', icon: '👀', description: 'Revisa y valida cambios' },
  { value: 'tester', label: 'Tester', icon: '🧪', description: 'Ejecuta pruebas' },
];

const MultiAgentPanel: React.FC = () => {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('sessions');
  const [showNewSession, setShowNewSession] = useState(false);
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const { data: sessionsData, isLoading: loadingSessions } = useListSessions();
  const { data: sessionData } = useGetSession(selectedSessionId || '');
  const { data: agentsData } = useGetSessionAgents(selectedSessionId || '');
  const { data: tasksData } = useGetSessionTasks(selectedSessionId || '');

  const createSession = useCreateSession();
  const pauseSession = usePauseSession();
  const resumeSession = useResumeSession();
  const destroySession = useDestroySession();
  const addAgent = useAddAgent();
  const startAgent = useStartAgent();
  const pauseAgent = usePauseAgent();
  const resumeAgent = useResumeAgent();
  const stopAgent = useStopAgent();
  const createTask = useCreateTask();

  const sessions = sessionsData?.sessions || [];
  const session = sessionData?.session;
  const agents = agentsData?.agents || [];
  const tasks = tasksData?.tasks || [];

  const handleCreateSession = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const result = await createSession.mutateAsync({
        name: formData.get('name') as string,
        description: formData.get('description') as string,
      });

      if (result.success) {
        setSelectedSessionId(result.session.id);
        setShowNewSession(false);
      }
    } catch (error) {
      console.error('Error creating session:', error);
    }
  }, [createSession]);

  const handleAddAgent = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedSessionId) return;

    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      await addAgent.mutateAsync({
        sessionId: selectedSessionId,
        type: formData.get('type') as string,
        name: formData.get('name') as string,
      });
      setShowNewAgent(false);
    } catch (error) {
      console.error('Error adding agent:', error);
    }
  }, [selectedSessionId, addAgent]);

  const handleCreateTask = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedSessionId) return;

    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      await createTask.mutateAsync({
        sessionId: selectedSessionId,
        title: formData.get('title') as string,
        description: formData.get('description') as string,
        priority: parseInt(formData.get('priority') as string) || 2,
      });
      setShowNewTask(false);
    } catch (error) {
      console.error('Error creating task:', error);
    }
  }, [selectedSessionId, createTask]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
      case 'running':
        return 'status-active';
      case 'paused':
        return 'status-paused';
      case 'stopped':
        return 'status-stopped';
      case 'idle':
        return 'status-idle';
      case 'thinking':
      case 'acting':
        return 'status-working';
      case 'error':
        return 'status-error';
      default:
        return 'status-default';
    }
  };

  const getAgentIcon = (type: string) => {
    return AGENT_TYPES.find(t => t.value === type)?.icon || '🤖';
  };

  const sourceLabel = (source: string) =>
    source === 'memory'
      ? '🧠 Memoria'
      : source === 'rag'
        ? '📚 RAG'
        : source === 'execution'
          ? '🔁 Ejecución'
          : source;

  /** FASE 5 → UI: qué memorias/RAG se usaron, tokens y descartes por tarea. */
  const ContextReportView = ({ report }: { report: ContextReport }) => {
    const used = report.bySource || {};
    const pct = report.budgetTokens
      ? Math.min(100, Math.round(((report.totalTokens ?? 0) / report.budgetTokens) * 100))
      : 0;
    const blocks = report.blocks || [];
    const errors = report.sourceErrors || [];

    return (
      <div className="task-context">
        <div className="task-context-header">🧩 Contexto ensamblado</div>
        {report.error ? (
          <div className="task-context-error">No se pudo ensamblar el contexto: {report.error}</div>
        ) : (
          <>
            <div className="context-stats">
              <div className="context-stat">
                <span className="context-stat-value">{used.memory ?? 0}</span>
                <span className="context-stat-label">Memorias usadas</span>
              </div>
              <div className="context-stat">
                <span className="context-stat-value">{used.rag ?? 0}</span>
                <span className="context-stat-label">Chunks RAG usados</span>
              </div>
              <div className="context-stat">
                <span className="context-stat-value">{used.execution ?? 0}</span>
                <span className="context-stat-label">Ejecuciones previas</span>
              </div>
              <div className="context-stat">
                <span className="context-stat-value">{report.dedupRemoved ?? 0}</span>
                <span className="context-stat-label">Duplicados eliminados</span>
              </div>
              <div className="context-stat">
                <span className="context-stat-value">{report.dropped ?? 0}</span>
                <span className="context-stat-label">Descartados (presupuesto)</span>
              </div>
            </div>

            <div className="context-tokens">
              <div className="context-tokens-row">
                <span>Tokens usados</span>
                <span>
                  {report.totalTokens ?? 0} / {report.budgetTokens ?? 0}
                </span>
              </div>
              <div className="context-tokens-bar">
                <div className="context-tokens-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>

            {errors.length > 0 && (
              <div className="task-context-warning">
                ⚠️ {errors.length} fuente(s) no disponible(s):{' '}
                {errors.map((e) => e.source || e.error).join(', ')}
              </div>
            )}

            {blocks.length > 0 && (
              <div className="context-blocks">
                <div className="context-blocks-title">Fragmentos usados ({blocks.length})</div>
                {blocks.map((block, i) => (
                  <div key={i} className="context-block">
                    <div className="context-block-meta">
                      <span className="context-block-source">{sourceLabel(block.source)}</span>
                      {block.key && <span className="context-block-key">{block.key}</span>}
                      <span className="context-block-score">
                        relevancia {Math.round((block.relevance ?? 0) * 100)}%
                      </span>
                      <span className="context-block-tokens">{block.tokens ?? 0} tok</span>
                    </div>
                    <div className="context-block-content">{block.content}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="multiagent-panel">
      {/* Header */}
      <div className="panel-header">
        <h3>Multi-Agent Control</h3>
        <button
          className="btn-new"
          onClick={() => setShowNewSession(true)}
        >
          + New Session
        </button>
      </div>

      {/* Sessions List */}
      <div className="sessions-list">
        <h4>Sessions</h4>
        {loadingSessions ? (
          <div className="loading">Loading...</div>
        ) : sessions.length === 0 ? (
          <div className="empty">No sessions yet</div>
        ) : (
          sessions.map((s: { id: string; name: string; status: string; agentCount: number }) => (
            <div
              key={s.id}
              className={`session-item ${selectedSessionId === s.id ? 'active' : ''}`}
              onClick={() => setSelectedSessionId(s.id)}
            >
              <span className={`status-dot ${getStatusColor(s.status)}`} />
              <span className="session-name">{s.name}</span>
              <span className="session-agents">{s.agentCount} agents</span>
            </div>
          ))
        )}
      </div>

      {/* Session Details */}
      {session && (
        <>
          {/* Session Header */}
          <div className="session-header">
            <div className="session-info">
              <h3>{session.name}</h3>
              <span className={`status-badge ${getStatusColor(session.status)}`}>
                {session.status}
              </span>
            </div>
            <div className="session-actions">
              {session.status === 'running' ? (
                <button onClick={() => pauseSession.mutate(session.id)}>
                  Pause All
                </button>
              ) : (
                <button onClick={() => resumeSession.mutate(session.id)}>
                  Resume
                </button>
              )}
              <button
                className="btn-danger"
                onClick={() => {
                  if (confirm('Destroy this session?')) {
                    destroySession.mutate(session.id);
                    setSelectedSessionId(null);
                  }
                }}
              >
                Destroy
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="panel-tabs">
            <button
              className={viewMode === 'agents' ? 'active' : ''}
              onClick={() => setViewMode('agents')}
            >
              Agents ({agents.length})
            </button>
            <button
              className={viewMode === 'tasks' ? 'active' : ''}
              onClick={() => setViewMode('tasks')}
            >
              Tasks ({tasks.length})
            </button>
          </div>

          {/* Content */}
          <div className="panel-content">
            {viewMode === 'agents' && (
              <div className="agents-view">
                <div className="view-header">
                  <h4>Agents</h4>
                  <button
                    className="btn-small"
                    onClick={() => setShowNewAgent(true)}
                  >
                    + Add Agent
                  </button>
                </div>

                {agents.length === 0 ? (
                  <div className="empty">No agents yet</div>
                ) : (
                  <div className="agents-grid">
                    {agents.map((agent: { id: string; name: string; type: string; status: string; stats: { tasksCompleted: number } }) => (
                      <div key={agent.id} className="agent-card">
                        <div className="agent-header">
                          <span className="agent-icon">{getAgentIcon(agent.type)}</span>
                          <div className="agent-info">
                            <span className="agent-name">{agent.name}</span>
                            <span className={`agent-status ${getStatusColor(agent.status)}`}>
                              {agent.status}
                            </span>
                          </div>
                        </div>
                        <div className="agent-stats">
                          <span>Tasks: {agent.stats.tasksCompleted}</span>
                        </div>
                        <div className="agent-actions">
                          {agent.status === 'idle' && (
                            <button onClick={() => startAgent.mutate(agent.id)}>
                              Start
                            </button>
                          )}
                          {agent.status === 'thinking' && (
                            <button onClick={() => pauseAgent.mutate(agent.id)}>
                              Pause
                            </button>
                          )}
                          {agent.status === 'paused' && (
                            <button onClick={() => resumeAgent.mutate(agent.id)}>
                              Resume
                            </button>
                          )}
                          {agent.status !== 'stopped' && (
                            <button
                              className="btn-danger-small"
                              onClick={() => stopAgent.mutate(agent.id)}
                            >
                              Stop
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {viewMode === 'tasks' && (
              <div className="tasks-view">
                <div className="view-header">
                  <h4>Tasks</h4>
                  <button
                    className="btn-small"
                    onClick={() => setShowNewTask(true)}
                  >
                    + New Task
                  </button>
                </div>

                {tasks.length === 0 ? (
                  <div className="empty">No tasks yet</div>
                ) : (
                  <div className="tasks-list">
                    {tasks.map((task: MultiTask) => {
                      const isOpen = expandedTaskId === task.id;
                      const agentName = task.agentId
                        ? agents.find((a: { id: string }) => a.id === task.agentId)?.name
                        : null;
                      return (
                        <div key={task.id} className={`task-item ${isOpen ? 'expanded' : ''}`}>
                          <button
                            type="button"
                            className="task-row"
                            aria-expanded={isOpen}
                            onClick={() => setExpandedTaskId(isOpen ? null : task.id)}
                          >
                            <span className={`task-priority priority-${task.priority}`}>
                              P{task.priority}
                            </span>
                            <span className="task-title">{task.title}</span>
                            <span className={`task-status ${task.status}`}>{task.status}</span>
                            {agentName && <span className="task-agent">Agent: {agentName}</span>}
                            {task.contextReport?.included ? (
                              <span className="task-context-badge" title="Contexto ensamblado disponible">
                                🧩
                              </span>
                            ) : null}
                            <span className="task-chevron">{isOpen ? '▲' : '▼'}</span>
                          </button>
                          {isOpen && (
                            <div className="task-details">
                              {task.description && (
                                <p className="task-description">{task.description}</p>
                              )}
                              {task.result ? (
                                <div className="task-result">
                                  <span className="task-detail-label">Resultado</span>
                                  <pre className="task-result-pre">{String(task.result)}</pre>
                                </div>
                              ) : null}
                              {task.error ? (
                                <div className="task-error">Error: {task.error}</div>
                              ) : null}
                              {task.contextReport ? (
                                <ContextReportView report={task.contextReport} />
                              ) : (
                                <div className="task-context-empty">
                                  Sin reporte de contexto (la tarea aún no se ejecutó o no lo generó).
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* New Session Modal */}
      {showNewSession && (
        <div className="modal-overlay" onClick={() => setShowNewSession(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>New Session</h3>
            <form onSubmit={handleCreateSession}>
              <div className="form-group">
                <label>Name</label>
                <input type="text" name="name" placeholder="Session name" required />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea name="description" placeholder="Description" />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowNewSession(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={createSession.isLoading}>
                  {createSession.isLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Agent Modal */}
      {showNewAgent && (
        <div className="modal-overlay" onClick={() => setShowNewAgent(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add Agent</h3>
            <form onSubmit={handleAddAgent}>
              <div className="form-group">
                <label>Type</label>
                <select name="type" required>
                  {AGENT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.icon} {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Name (optional)</label>
                <input type="text" name="name" placeholder="Agent name" />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowNewAgent(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={addAgent.isLoading}>
                  {addAgent.isLoading ? 'Adding...' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Task Modal */}
      {showNewTask && (
        <div className="modal-overlay" onClick={() => setShowNewTask(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>New Task</h3>
            <form onSubmit={handleCreateTask}>
              <div className="form-group">
                <label>Title</label>
                <input type="text" name="title" placeholder="Task title" required />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea name="description" placeholder="Task description" />
              </div>
              <div className="form-group">
                <label>Priority</label>
                <select name="priority">
                  <option value="1">Low</option>
                  <option value="2">Normal</option>
                  <option value="3">High</option>
                  <option value="4">Critical</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowNewTask(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={createTask.isLoading}>
                  {createTask.isLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiAgentPanel;
