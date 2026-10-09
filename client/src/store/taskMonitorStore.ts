/**
 * TaskMonitorStore - Estado para monitor en tiempo real
 * 
 * Gestiona: navegador, terminal, herramientas, procesos
 */

import { atom, selector } from 'recoil';

/**
 * Tipo de panel activo
 */
export type ActivePanel = 'browser' | 'terminal' | 'tools' | 'processes';

/**
 * Estado del navegador
 */
export interface BrowserState {
  isOpen: boolean;
  url: string;
  title: string;
  loading: boolean;
  screenshot?: string;
  history: string[];
  errors: string[];
}

/**
 * Entrada de terminal
 */
export interface TerminalEntry {
  id: string;
  type: 'input' | 'output' | 'error' | 'system';
  content: string;
  timestamp: Date;
  exitCode?: number;
}

/**
 * Estado de la terminal
 */
export interface TerminalState {
  entries: TerminalEntry[];
  cwd: string;
  isExecuting: boolean;
  maxEntries: number;
}

/**
 * Proceso en ejecución
 */
export interface ProcessInfo {
  id: string;
  name: string;
  command: string;
  pid?: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stopped';
  startTime: Date;
  endTime?: Date;
  exitCode?: number;
  cpu?: number;
  memory?: number;
}

/**
 * Estado de procesos
 */
export interface ProcessState {
  processes: ProcessInfo[];
  maxProcesses: number;
}

/**
 * Herramienta en ejecución
 */
export interface ToolExecution {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  result?: unknown;
  error?: string;
  duration?: number;
}

/**
 * Estado del monitor
 */
export interface TaskMonitorState {
  activePanel: ActivePanel;
  browser: BrowserState;
  terminal: TerminalState;
  processes: ProcessState;
  tools: ToolExecution[];
  isLive: boolean;
  serverStats?: Record<string, unknown>;
}

/**
 * Estado inicial del navegador
 */
const initialBrowserState: BrowserState = {
  isOpen: false,
  url: '',
  title: '',
  loading: false,
  history: [],
  errors: [],
};

/**
 * Estado inicial de terminal
 */
const initialTerminalState: TerminalState = {
  entries: [],
  cwd: '/workspace',
  isExecuting: false,
  maxEntries: 1000,
};

/**
 * Estado inicial de procesos
 */
const initialProcessState: ProcessState = {
  processes: [],
  maxProcesses: 50,
};

/**
 * Átomo principal
 */
export const taskMonitorAtom = atom<TaskMonitorState>({
  key: 'taskMonitor/state',
  default: {
    activePanel: 'tools',
    browser: initialBrowserState,
    terminal: initialTerminalState,
    processes: initialProcessState,
    tools: [],
    isLive: true,
  },
});

/**
 * Selector: panel activo
 */
export const activePanelSelector = selector({
  key: 'taskMonitor/activePanel',
  get: ({ get }) => get(taskMonitorAtom).activePanel,
});

/**
 * Selector: estado del navegador
 */
export const browserStateSelector = selector({
  key: 'taskMonitor/browser',
  get: ({ get }) => get(taskMonitorAtom).browser,
});

/**
 * Selector: entradas de terminal
 */
export const terminalEntriesSelector = selector({
  key: 'taskMonitor/terminalEntries',
  get: ({ get }) => get(taskMonitorAtom).terminal.entries,
});

/**
 * Selector: procesos activos
 */
export const activeProcessesSelector = selector({
  key: 'taskMonitor/activeProcesses',
  get: ({ get }) => {
    return get(taskMonitorAtom).processes.processes.filter(
      p => p.status === 'running' || p.status === 'pending'
    );
  },
});

/**
 * Selector: herramientas en ejecución
 */
export const runningToolsSelector = selector({
  key: 'taskMonitor/runningTools',
  get: ({ get }) => {
    return get(taskMonitorAtom).tools.filter(
      t => t.status === 'running' || t.status === 'pending'
    );
  },
});

/**
 * Selector: historial de herramientas
 */
export const toolHistorySelector = selector({
  key: 'taskMonitor/toolHistory',
  get: ({ get }) => {
    return get(taskMonitorAtom).tools.slice(-50);
  },
});

/**
 * Selector: estadísticas
 */
export const monitorStatsSelector = selector({
  key: 'taskMonitor/stats',
  get: ({ get }) => {
    const state = get(taskMonitorAtom);
    return {
      terminalEntries: state.terminal.entries.length,
      activeProcesses: state.processes.processes.filter(p => p.status === 'running').length,
      completedProcesses: state.processes.processes.filter(p => p.status !== 'running').length,
      runningTools: state.tools.filter(t => t.status === 'running').length,
      totalTools: state.tools.length,
      failedTools: state.tools.filter(t => t.status === 'failed').length,
    };
  },
});
