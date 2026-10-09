/**
 * AgentOrchestratorStore - Estado para control de agentes en jerarquía
 * 
 * Gestiona: todos los agentes con estados y relaciones
 */

import { atom, selector } from 'recoil';

/**
 * Estado de un agente
 */
export type AgentState = 
  | 'idle'           // Esperando
  | 'thinking'       // Pensando/procesando
  | 'executing'      // Ejecutando tarea
  | 'waiting'        // Esperando respuesta de otro agente
  | 'completed'      // Tarea completada
  | 'failed'         // Falló
  | 'paused'         // Pausado
  | 'cancelled';     // Cancelado

/**
 * Tipo de agente en la jerarquía
 */
export type AgentRole = 
  | 'orchestrator'   // Orquestador principal
  | 'specialist'     // Agente especialista
  | 'worker'         // Agente trabajador
  | 'supervisor'     // Supervisor de otros agentes
  | 'qa'            // Control de calidad
  | 'security'       // Seguridad
  | 'researcher';    // Investigador

/**
 * Mensaje entre agentes
 */
export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: Date;
  type: 'instruction' | 'report' | 'result' | 'error' | 'approval';
}

/**
 * Tarea asignada a un agente
 */
export interface AgentTask {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  createdAt: Date;
  completedAt?: Date;
  result?: unknown;
}

/**
 * Información de un agente
 */
export interface AgentInfo {
  id: string;
  name: string;
  role: AgentRole;
  description?: string;
  icon?: string;
  color?: string;
  
  // Estado actual
  state: AgentState;
  stateMessage?: string;
  
  // Metadatos
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  
  // Relaciones
  parentId?: string;
  childIds: string[];
  dependsOn: string[];
  
  // Tareas
  tasks: AgentTask[];
  currentTask?: AgentTask;
  
  // Mensajes
  messages: AgentMessage[];
  
  // Métricas
  tasksCompleted: number;
  tasksFailed: number;
  totalDuration: number;
  
  // Configuración
  capabilities: string[];
  maxConcurrentTasks?: number;
}

/**
 * Estado del orquestador
 */
export interface AgentOrchestratorState {
  agents: Map<string, AgentInfo>;
  rootAgentId?: string;
  activeAgentId?: string;
  isOrchestrating: boolean;
  globalProgress: number;
}

/**
 * Átomo principal
 */
export const agentOrchestratorAtom = atom<AgentOrchestratorState>({
  key: 'agentOrchestrator/state',
  default: {
    agents: new Map(),
    isOrchestrating: false,
    globalProgress: 0,
  },
});

/**
 * Selector: obtener todos los agentes como array
 */
export const agentsArraySelector = selector({
  key: 'agentOrchestrator/agentsArray',
  get: ({ get }) => {
    const state = get(agentOrchestratorAtom);
    return Array.from(state.agents.values());
  },
});

/**
 * Selector: obtener agente por ID
 */
export const agentByIdSelector = selector({
  key: 'agentOrchestrator/agentById',
  get: ({ get }) => (id: string) => {
    const state = get(agentOrchestratorAtom);
    return state.agents.get(id);
  },
});

/**
 * Selector: agentes por estado
 */
export const agentsByStateSelector = selector({
  key: 'agentOrchestrator/agentsByState',
  get: ({ get }) => {
    const state = get(agentOrchestratorAtom);
    const byState = new Map<AgentState, AgentInfo[]>();
    
    for (const agent of state.agents.values()) {
      const list = byState.get(agent.state) || [];
      list.push(agent);
      byState.set(agent.state, list);
    }
    
    return byState;
  },
});

/**
 * Selector: agentes activos (no idle, no completed, no failed)
 */
export const activeAgentsSelector = selector({
  key: 'agentOrchestrator/activeAgents',
  get: ({ get }) => {
    const state = get(agentOrchestratorAtom);
    return Array.from(state.agents.values()).filter(
      a => !['idle', 'completed', 'failed', 'cancelled'].includes(a.state)
    );
  },
});

/**
 * Selector: árbol de agentes (jerarquía)
 */
export const agentTreeSelector = selector({
  key: 'agentOrchestrator/agentTree',
  get: ({ get }) => {
    const state = get(agentOrchestratorAtom);
    const agents = state.agents;
    
    // Encontrar raíz (orquestador)
    const root = state.rootAgentId 
      ? agents.get(state.rootAgentId) 
      : Array.from(agents.values()).find(a => a.role === 'orchestrator');
    
    if (!root) return null;
    
    // Construir árbol
    const buildTree = (agentId: string): AgentTreeNode | null => {
      const agent = agents.get(agentId);
      if (!agent) return null;
      
      return {
        agent,
        children: agent.childIds.map(buildTree).filter(Boolean) as AgentTreeNode[],
      };
    };
    
    return buildTree(root.id);
  },
});

/**
 * Nodo del árbol de agentes
 */
export interface AgentTreeNode {
  agent: AgentInfo;
  children: AgentTreeNode[];
}

/**
 * Selector: estadísticas globales
 */
export const orchestratorStatsSelector = selector({
  key: 'agentOrchestrator/stats',
  get: ({ get }) => {
    const state = get(agentOrchestratorAtom);
    const agents = Array.from(state.agents.values());
    
    return {
      totalAgents: agents.length,
      activeAgents: agents.filter(a => !['idle', 'completed', 'failed', 'cancelled'].includes(a.state)).length,
      completedAgents: agents.filter(a => a.state === 'completed').length,
      failedAgents: agents.filter(a => a.state === 'failed').length,
      totalTasks: agents.reduce((sum, a) => sum + a.tasks.length, 0),
      completedTasks: agents.reduce((sum, a) => sum + a.tasksCompleted, 0),
      failedTasks: agents.reduce((sum, a) => sum + a.tasksFailed, 0),
      globalProgress: state.globalProgress,
    };
  },
});

/**
 * Selector: historial de mensajes
 */
export const agentMessagesSelector = selector({
  key: 'agentOrchestrator/messages',
  get: ({ get }) => {
    const state = get(agentOrchestratorAtom);
    const allMessages: AgentMessage[] = [];
    
    for (const agent of state.agents.values()) {
      allMessages.push(...agent.messages);
    }
    
    // Ordenar por timestamp
    return allMessages.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  },
});
