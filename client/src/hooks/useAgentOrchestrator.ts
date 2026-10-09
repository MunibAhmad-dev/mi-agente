/**
 * useAgentOrchestrator - Hook para gestionar orquestador de agentes
 * 
 * Provee métodos para crear, controlar y monitorear agentes en jerarquía
 */

import { useCallback, useEffect, useRef } from 'react';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import {
  agentOrchestratorAtom,
  agentsArraySelector,
  activeAgentsSelector,
  agentTreeSelector,
  orchestratorStatsSelector,
  agentMessagesSelector,
  AgentOrchestratorState,
  AgentInfo,
  AgentState,
  AgentRole,
  AgentMessage,
  AgentTask,
  AgentTreeNode,
} from '~/store/agentOrchestratorStore';
import { getEventBus } from '~/services/EventBus';

function generateId(): string {
  return `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useAgentOrchestrator() {
  const setState = useSetRecoilState(agentOrchestratorAtom);
  const orchestratorState = useRecoilValue(agentOrchestratorAtom);
  const agents = useRecoilValue(agentsArraySelector);
  const activeAgents = useRecoilValue(activeAgentsSelector);
  const agentTree = useRecoilValue(agentTreeSelector);
  const stats = useRecoilValue(orchestratorStatsSelector);
  const messages = useRecoilValue(agentMessagesSelector);
  const isOrchestrating = orchestratorState.isOrchestrating;
  
  const eventBus = getEventBus();
  const mountedRef = useRef(true);

  // =========================================================================
  // ESCUCHAR EVENTOS DEL EVENTBUS
  // =========================================================================

  useEffect(() => {
    mountedRef.current = true;
    
    // Suscribirse a eventos del EventBus
    const unsubscribe = eventBus.subscribe('agent:created', (event) => {
      if (!mountedRef.current) return;
      // El agente ya fue agregado localmente, solo registrar
      console.log('[useAgentOrchestrator] Agent created:', event.data);
    });

    const unsubscribeStarted = eventBus.subscribe('agent:started', (event) => {
      if (!mountedRef.current) return;
      const data = (event.data || {}) as Record<string, unknown>;
      const agentId = data['agentId'] as string | undefined;
      if (agentId) {
        _updateAgentStateInternal(agentId, 'executing');
      }
    });

    const unsubscribeCompleted = eventBus.subscribe('agent:completed', (event) => {
      if (!mountedRef.current) return;
      const data = (event.data || {}) as Record<string, unknown>;
      const agentId = data['agentId'] as string | undefined;
      if (agentId) {
        _updateAgentStateInternal(agentId, 'completed');
      }
    });

    const unsubscribeFailed = eventBus.subscribe('agent:failed', (event) => {
      if (!mountedRef.current) return;
      const data = (event.data || {}) as Record<string, unknown>;
      const agentId = data['agentId'] as string | undefined;
      if (agentId) {
        _updateAgentStateInternal(agentId, 'failed', data['error'] as string);
      }
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
      unsubscribeStarted();
      unsubscribeCompleted();
      unsubscribeFailed();
    };
  }, [setState]);

  // =========================================================================
  // FUNCIÓN INTERNA: Actualizar estado
  // =========================================================================
  
  const _updateAgentStateInternal = useCallback((agentId: string, state: AgentState, message?: string) => {
    setState(prev => {
      const newAgents = new Map(prev.agents);
      const agent = newAgents.get(agentId);
      if (!agent) return prev;
      const updates: Partial<AgentInfo> = { state, stateMessage: message };
      if (state === 'executing' && !agent.startedAt) updates.startedAt = new Date();
      if (state === 'completed' || state === 'failed') {
        updates.completedAt = new Date();
        if (agent.startedAt) updates.totalDuration = Date.now() - new Date(agent.startedAt).getTime();
      }
      newAgents.set(agentId, { ...agent, ...updates });
      const allAgents = Array.from(newAgents.values());
      const completedCount = allAgents.filter(a => a.state === 'completed' || a.state === 'failed').length;
      const globalProgress = allAgents.length > 0 ? completedCount / allAgents.length : 0;
      return { ...prev, agents: newAgents, globalProgress };
    });
  }, [setState]);

  /**
   * Actualizar estado de un agente
   */
  const updateAgentState = useCallback((agentId: string, state: AgentState, message?: string) => {
    setState(prev => {
      const newAgents = new Map(prev.agents);
      const agent = newAgents.get(agentId);
      
      if (!agent) return prev;

      const updates: Partial<AgentInfo> = {
        state,
        stateMessage: message,
      };

      if (state === 'executing' && !agent.startedAt) {
        updates.startedAt = new Date();
      }

      if (state === 'completed' || state === 'failed') {
        updates.completedAt = new Date();
        if (agent.startedAt) {
          updates.totalDuration = Date.now() - new Date(agent.startedAt).getTime();
        }
      }

      newAgents.set(agentId, { ...agent, ...updates });

      const allAgents = Array.from(newAgents.values());
      const completedCount = allAgents.filter(a => 
        a.state === 'completed' || a.state === 'failed'
      ).length;
      const globalProgress = allAgents.length > 0 
        ? completedCount / allAgents.length 
        : 0;
  
      return {
        ...prev,
        agents: newAgents,
        globalProgress,
      };
    });
  }, [setState]);

  // =========================================================================
  // GESTIÓN DE AGENTES
  // =========================================================================

  /**
   * Agregar un agente
   */
  const addAgent = useCallback((agent: Omit<AgentInfo, 'id' | 'createdAt' | 'tasks' | 'messages' | 'tasksCompleted' | 'tasksFailed' | 'totalDuration' | 'childIds'>): string => {
    const id = generateId();
    
    const newAgent: AgentInfo = {
      ...agent,
      id,
      createdAt: new Date(),
      tasks: [],
      messages: [],
      tasksCompleted: 0,
      tasksFailed: 0,
      totalDuration: 0,
      childIds: [],
    };

    setState(prev => {
      const newAgents = new Map(prev.agents);
      newAgents.set(id, newAgent);

      // Si tiene padre, agregarlo como hijo
      if (agent.parentId) {
        const parent = newAgents.get(agent.parentId);
        if (parent) {
          newAgents.set(agent.parentId, {
            ...parent,
            childIds: [...parent.childIds, id],
          });
        }
      }

      // Si es orquestador, establecer como raíz
      const rootAgentId = agent.role === 'orchestrator' && !prev.rootAgentId
        ? id
        : prev.rootAgentId;

      return {
        ...prev,
        agents: newAgents,
        rootAgentId,
      };
    });

    eventBus.emit('agent:created', `Agent ${agent.name} created`, { agentId: id, name: agent.name, role: agent.role });
    return id;
  }, [setState, eventBus]);

  /**
   * Agregar agente predefinido por rol
   */
  const addAgentByRole = useCallback((role: AgentRole, name?: string): string => {
    const roleConfig = getRoleConfig(role);
    return addAgent({
      name: name || roleConfig.defaultName,
      role,
      description: roleConfig.description,
      color: roleConfig.color,
      icon: roleConfig.icon,
      state: 'idle',
      capabilities: roleConfig.capabilities,
      dependsOn: roleConfig.dependsOn,
    });
  }, [addAgent]);

  /**
   * Eliminar un agente
   */
  const removeAgent = useCallback((agentId: string) => {
    setState(prev => {
      const newAgents = new Map(prev.agents);
      const agent = newAgents.get(agentId);
      
      if (!agent) return prev;

      // Eliminar de la lista de hijos del padre
      if (agent.parentId) {
        const parent = newAgents.get(agent.parentId);
        if (parent) {
          newAgents.set(agent.parentId, {
            ...parent,
            childIds: parent.childIds.filter(id => id !== agentId),
          });
        }
      }

      // Eliminar hijos recursivamente
      const deleteChildren = (id: string) => {
        const childAgent = newAgents.get(id);
        if (childAgent) {
          for (const childId of childAgent.childIds) {
            deleteChildren(childId);
          }
          newAgents.delete(id);
        }
      };

      for (const childId of agent.childIds) {
        deleteChildren(childId);
      }

      newAgents.delete(agentId);

      return {
        ...prev,
        agents: newAgents,
        rootAgentId: prev.rootAgentId === agentId ? undefined : prev.rootAgentId,
      };
    });

    eventBus.emit('agent:removed', `Agent ${agentId} removed`, { agentId });
  }, [setState, eventBus]);

  /**
   * Actualizar estado de un agente
   * Nota: La implementación real está al inicio del hook para uso en callbacks
   */

  /**
   * Asignar tarea a un agente
   */
  const assignTask = useCallback((agentId: string, task: Omit<AgentTask, 'id' | 'createdAt' | 'status' | 'progress'>): string => {
    const taskId = `task_${Date.now()}`;
    
    const newTask: AgentTask = {
      ...task,
      id: taskId,
      createdAt: new Date(),
      status: 'pending',
      progress: 0,
    };

    setState(prev => {
      const newAgents = new Map(prev.agents);
      const agent = newAgents.get(agentId);
      
      if (!agent) return prev;

      newAgents.set(agentId, {
        ...agent,
        tasks: [...agent.tasks, newTask],
        currentTask: newTask,
        state: 'waiting',
      });

      return {
        ...prev,
        agents: newAgents,
      };
    });

    eventBus.emit('agent:task_assigned', `Task assigned to agent`, { agentId, taskId, title: task.title });
    return taskId;
  }, [setState, eventBus]);

  /**
   * Actualizar progreso de tarea
   */
  const updateTaskProgress = useCallback((agentId: string, taskId: string, progress: number) => {
    setState(prev => {
      const newAgents = new Map(prev.agents);
      const agent = newAgents.get(agentId);
      
      if (!agent) return prev;

      const updatedTasks = agent.tasks.map(t => 
        t.id === taskId ? { ...t, progress } : t
      );

      const updatedCurrentTask = agent.currentTask?.id === taskId
        ? { ...agent.currentTask, progress }
        : agent.currentTask;

      newAgents.set(agentId, {
        ...agent,
        tasks: updatedTasks,
        currentTask: updatedCurrentTask,
      });

      return {
        ...prev,
        agents: newAgents,
      };
    });
  }, [setState]);

  /**
   * Completar tarea
   */
  const completeTask = useCallback((agentId: string, taskId: string, result?: unknown) => {
    setState(prev => {
      const newAgents = new Map(prev.agents);
      const agent = newAgents.get(agentId);
      
      if (!agent) return prev;

      const task = agent.tasks.find(t => t.id === taskId);
      const isSuccess = task?.status !== 'failed';

      const updatedTasks = agent.tasks.map(t => 
        t.id === taskId 
          ? { ...t, status: isSuccess ? 'completed' as const : 'failed' as const, progress: 1, completedAt: new Date(), result }
          : t
      );

      const completedTasks = isSuccess 
        ? agent.tasksCompleted + 1 
        : agent.tasksCompleted;
      const failedTasks = !isSuccess 
        ? agent.tasksFailed + 1 
        : agent.tasksFailed;

      newAgents.set(agentId, {
        ...agent,
        tasks: updatedTasks,
        currentTask: undefined,
        tasksCompleted: completedTasks,
        tasksFailed: failedTasks,
        state: 'idle',
      });

      eventBus.emit('agent:task_completed', `Task completed`, { agentId, taskId, success: isSuccess });

      return {
        ...prev,
        agents: newAgents,
      };
    });
  }, [setState, eventBus]);

  // =========================================================================
  // MENSAJES ENTRE AGENTES
  // =========================================================================

  /**
   * Enviar mensaje a otro agente
   */
  const sendMessage = useCallback((fromId: string, toId: string, content: string, type: AgentMessage['type'] = 'report') => {
    const message: AgentMessage = {
      id: `msg_${Date.now()}`,
      from: fromId,
      to: toId,
      content,
      timestamp: new Date(),
      type,
    };

    setState(prev => {
      const newAgents = new Map(prev.agents);
      
      // Agregar mensaje al remitente
      const fromAgent = newAgents.get(fromId);
      if (fromAgent) {
        newAgents.set(fromId, {
          ...fromAgent,
          messages: [...fromAgent.messages, message],
        });
      }

      // Agregar mensaje al destinatario
      const toAgent = newAgents.get(toId);
      if (toAgent) {
        newAgents.set(toId, {
          ...toAgent,
          messages: [...toAgent.messages, message],
          state: 'waiting',
          stateMessage: `Mensaje de ${fromAgent?.name}`,
        });
      }

      return {
        ...prev,
        agents: newAgents,
      };
    });

    eventBus.emit('agent:message_sent', `Message sent between agents`, { fromId, toId, type });
    return message.id;
  }, [setState, eventBus]);

  // =========================================================================
  // CONTROL GLOBAL
  // =========================================================================

  /**
   * Pausar un agente
   */
  const pauseAgent = useCallback((agentId: string) => {
    _updateAgentStateInternal(agentId, 'paused', 'Pausado por usuario');
  }, [updateAgentState]);

  /**
   * Reanudar un agente
   */
  const resumeAgent = useCallback((agentId: string) => {
    _updateAgentStateInternal(agentId, 'idle', 'Reanudado');
  }, [updateAgentState]);

  /**
   * Cancelar un agente
   */
  const cancelAgent = useCallback((agentId: string) => {
    _updateAgentStateInternal(agentId, 'cancelled', 'Cancelado por usuario');
  }, [updateAgentState]);

  /**
   * Iniciar orquestación
   */
  const startOrchestration = useCallback(() => {
    setState(prev => ({
      ...prev,
      isOrchestrating: true,
    }));

    eventBus.emit('orchestration:started', 'Orchestration started', {});
  }, [setState, eventBus]);

  /**
   * Detener orquestación
   */
  const stopOrchestration = useCallback(() => {
    const currentAgents = orchestratorState.agents;
    setState(prev => ({
      ...prev,
      isOrchestrating: false,
    }));

    // Pausar todos los agentes activos
    for (const agent of currentAgents.values()) {
      if (agent.state === 'executing' || agent.state === 'thinking') {
        updateAgentState(agent.id, 'paused', 'Orquestación detenida');
      }
    }

    eventBus.emit('orchestration:stopped', 'Orchestration stopped', {});
  }, [setState, updateAgentState, eventBus]);

  /**
   * Limpiar todos los agentes
   */
  const clearAll = useCallback(() => {
    setState({
      agents: new Map(),
      isOrchestrating: false,
      globalProgress: 0,
    });
  }, [setState]);

  /**
   * Seleccionar agente activo
   */
  const selectAgent = useCallback((agentId: string | null) => {
    setState(prev => ({
      ...prev,
      activeAgentId: agentId || undefined,
    }));
  }, [setState]);

  // =========================================================================
  // HELPERS
  // =========================================================================

  /**
   * Obtener configuración de rol
   */
  function getRoleConfig(role: AgentRole) {
    const configs: Record<AgentRole, {
      defaultName: string;
      description: string;
      color: string;
      icon: string;
      capabilities: string[];
      dependsOn: AgentRole[];
    }> = {
      orchestrator: {
        defaultName: 'Orquestador',
        description: 'Coordina y supervisa a todos los agentes',
        color: '#6366f1',
        icon: 'Crown',
        capabilities: ['planificacion', 'coordinacion', 'supervision'],
        dependsOn: [],
      },
      specialist: {
        defaultName: 'Especialista',
        description: 'Agente con conocimientos específicos',
        color: '#3b82f6',
        icon: 'User',
        capabilities: [],
        dependsOn: ['orchestrator'],
      },
      worker: {
        defaultName: 'Trabajador',
        description: 'Ejecuta tareas asignadas',
        color: '#22c55e',
        icon: 'Hammer',
        capabilities: ['ejecucion_tareas'],
        dependsOn: ['specialist'],
      },
      supervisor: {
        defaultName: 'Supervisor',
        description: 'Supervisa el trabajo de otros agentes',
        color: '#f59e0b',
        icon: 'Eye',
        capabilities: ['supervision', 'reportes'],
        dependsOn: ['orchestrator'],
      },
      qa: {
        defaultName: 'QA',
        description: 'Control de calidad',
        color: '#8b5cf6',
        icon: 'CheckCircle',
        capabilities: ['pruebas', 'validacion', 'calidad'],
        dependsOn: ['worker', 'specialist'],
      },
      security: {
        defaultName: 'Seguridad',
        description: 'Análisis de seguridad',
        color: '#ef4444',
        icon: 'Shield',
        capabilities: ['analisis_seguridad', 'validacion'],
        dependsOn: ['worker'],
      },
      researcher: {
        defaultName: 'Investigador',
        description: 'Investiga y busca información',
        color: '#06b6d4',
        icon: 'Search',
        capabilities: ['busqueda', 'analisis', 'investigacion'],
        dependsOn: ['orchestrator'],
      },
    };

    return configs[role];
  }

  // =========================================================================
  // RETORNO
  // =========================================================================

  return {
    // Estado
    agents,
    activeAgents,
    agentTree,
    stats,
    messages,

    // Gestión de agentes
    addAgent,
    addAgentByRole,
    removeAgent,
    updateAgentState,
    selectAgent,

    // Tareas
    assignTask,
    updateTaskProgress,
    completeTask,

    // Mensajes
    sendMessage,

    // Control
    pauseAgent,
    resumeAgent,
    cancelAgent,
    startOrchestration,
    stopOrchestration,
    clearAll,
    isOrchestrating,
  };
}
