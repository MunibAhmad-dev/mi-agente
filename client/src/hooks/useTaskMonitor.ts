/**
 * useTaskMonitor - Hook para gestionar monitor en tiempo real
 * 
 * Gestiona: navegador, terminal, herramientas, procesos
 */

import { useCallback, useEffect } from 'react';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import {
  taskMonitorAtom,
  activePanelSelector,
  browserStateSelector,
  terminalEntriesSelector,
  activeProcessesSelector,
  runningToolsSelector,
  toolHistorySelector,
  monitorStatsSelector,
  ActivePanel,
  BrowserState,
  TerminalEntry,
  ProcessInfo,
  ToolExecution,
} from '~/store/taskMonitorStore';
import { getEventBus } from '~/services/EventBus';

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useTaskMonitor() {
  const setState = useSetRecoilState(taskMonitorAtom);
  const activePanel = useRecoilValue(activePanelSelector);
  const browser = useRecoilValue(browserStateSelector);
  const terminalEntries = useRecoilValue(terminalEntriesSelector);
  const activeProcesses = useRecoilValue(activeProcessesSelector);
  const runningTools = useRecoilValue(runningToolsSelector);
  const toolHistory = useRecoilValue(toolHistorySelector);
  const stats = useRecoilValue(monitorStatsSelector);
  
  const eventBus = getEventBus();

  // =========================================================================
  // PANEL ACTIVO
  // =========================================================================

  const setActivePanel = useCallback((panel: ActivePanel) => {
    setState(prev => ({ ...prev, activePanel: panel }));
  }, [setState]);

  const toggleLive = useCallback(() => {
    setState(prev => ({ ...prev, isLive: !prev.isLive }));
  }, [setState]);

  // =========================================================================
  // NAVEGADOR
  // =========================================================================

  const browserNavigate = useCallback((url: string) => {
    setState(prev => ({
      ...prev,
      browser: {
        ...prev.browser,
        url,
        loading: true,
        history: [...prev.browser.history, url],
      },
    }));
    
    eventBus.emit('browser.navigated', '', { url });
  }, [setState, eventBus]);

  const browserLoaded = useCallback((title: string) => {
    setState(prev => ({
      ...prev,
      browser: {
        ...prev.browser,
        loading: false,
        title,
      },
    }));
  }, [setState]);

  const browserError = useCallback((error: string) => {
    setState(prev => ({
      ...prev,
      browser: {
        ...prev.browser,
        loading: false,
        errors: [...prev.browser.errors, error],
      },
    }));
  }, [setState]);

  const browserScreenshot = useCallback((screenshot: string) => {
    setState(prev => ({
      ...prev,
      browser: {
        ...prev.browser,
        screenshot,
      },
    }));
  }, [setState]);

  const browserClose = useCallback(() => {
    setState(prev => ({
      ...prev,
      browser: {
        ...prev.browser,
        isOpen: false,
        url: '',
        title: '',
      },
    }));
  }, [setState]);

  const browserOpen = useCallback(() => {
    setState(prev => ({
      ...prev,
      browser: {
        ...prev.browser,
        isOpen: true,
      },
    }));
  }, [setState]);

  // =========================================================================
  // TERMINAL
  // =========================================================================

  const terminalAddEntry = useCallback((
    type: TerminalEntry['type'],
    content: string,
    options?: { exitCode?: number }
  ) => {
    const entry: TerminalEntry = {
      id: generateId(),
      type,
      content,
      timestamp: new Date(),
      exitCode: options?.exitCode,
    };

    setState(prev => {
      const entries = [...prev.terminal.entries, entry];
      // Limitar cantidad de entradas
      const maxEntries = prev.terminal.maxEntries;
      const trimmedEntries = entries.length > maxEntries
        ? entries.slice(-maxEntries)
        : entries;

      return {
        ...prev,
        terminal: {
          ...prev.terminal,
          entries: trimmedEntries,
        },
      };
    });
  }, [setState]);

  const terminalInput = useCallback((command: string) => {
    terminalAddEntry('input', command);
    eventBus.emit('terminal.input', '', { command });
  }, [terminalAddEntry, eventBus]);

  const terminalOutput = useCallback((output: string) => {
    terminalAddEntry('output', output);
  }, [terminalAddEntry]);

  const terminalError = useCallback((error: string) => {
    terminalAddEntry('error', error);
  }, [terminalAddEntry]);

  const terminalSystem = useCallback((message: string) => {
    terminalAddEntry('system', message);
  }, [terminalAddEntry]);

  const terminalSetCwd = useCallback((cwd: string) => {
    setState(prev => ({
      ...prev,
      terminal: {
        ...prev.terminal,
        cwd,
      },
    }));
  }, [setState]);

  const terminalSetExecuting = useCallback((executing: boolean) => {
    setState(prev => ({
      ...prev,
      terminal: {
        ...prev.terminal,
        isExecuting: executing,
      },
    }));
  }, [setState]);

  const terminalClear = useCallback(() => {
    setState(prev => ({
      ...prev,
      terminal: {
        ...prev.terminal,
        entries: [],
      },
    }));
  }, [setState]);

  // =========================================================================
  // PROCESOS
  // =========================================================================

  const processStart = useCallback((
    name: string,
    command: string,
    options?: { pid?: number }
  ): string => {
    const id = generateId();
    
    const process: ProcessInfo = {
      id,
      name,
      command,
      pid: options?.pid,
      status: 'running',
      startTime: new Date(),
    };

    setState(prev => ({
      ...prev,
      processes: {
        ...prev.processes,
        processes: [...prev.processes.processes, process],
      },
    }));

    eventBus.emit('process.started', '', { id, name, command });
    return id;
  }, [setState, eventBus]);

  const processComplete = useCallback((
    id: string,
    options?: { exitCode?: number; status?: ProcessInfo['status'] }
  ) => {
    setState(prev => ({
      ...prev,
      processes: {
        ...prev.processes,
        processes: prev.processes.processes.map(p =>
          p.id === id
            ? {
                ...p,
                status: options?.status || (options?.exitCode === 0 ? 'completed' : 'failed'),
                endTime: new Date(),
                exitCode: options?.exitCode,
              }
            : p
        ),
      },
    }));

    eventBus.emit('process.completed', '', { id, exitCode: options?.exitCode });
  }, [setState, eventBus]);

  const processUpdate = useCallback((
    id: string,
    updates: Partial<ProcessInfo>
  ) => {
    setState(prev => ({
      ...prev,
      processes: {
        ...prev.processes,
        processes: prev.processes.processes.map(p =>
          p.id === id ? { ...p, ...updates } : p
        ),
      },
    }));
  }, [setState]);

  const processKill = useCallback((id: string) => {
    processComplete(id, { status: 'stopped' });
    eventBus.emit('process.killed', '', { id });
  }, [processComplete, eventBus]);

  const processClearCompleted = useCallback(() => {
    setState(prev => ({
      ...prev,
      processes: {
        ...prev.processes,
        processes: prev.processes.processes.filter(
          p => p.status === 'running' || p.status === 'pending'
        ),
      },
    }));
  }, [setState]);

  // =========================================================================
  // HERRAMIENTAS
  // =========================================================================

  const toolStart = useCallback((
    name: string,
    args: Record<string, unknown> = {}
  ): string => {
    const id = generateId();
    
    const tool: ToolExecution = {
      id,
      name,
      args,
      status: 'running',
      startTime: new Date(),
    };

    setState(prev => ({
      ...prev,
      tools: [...prev.tools, tool],
    }));

    eventBus.emit('tool.started', '', { id, name, args: args as Record<string, unknown> });
    return id;
  }, [setState, eventBus]);

  const toolComplete = useCallback((
    id: string,
    result?: unknown
  ) => {
    setState(prev => ({
      ...prev,
      tools: prev.tools.map(t =>
        t.id === id
          ? {
              ...t,
              status: 'completed' as const,
              endTime: new Date(),
              result,
              duration: Date.now() - new Date(t.startTime).getTime(),
            }
          : t
      ),
    }));

    eventBus.emit('tool.completed', '', { id, result: result as Record<string, unknown> });
  }, [setState, eventBus]);

  const toolFail = useCallback((
    id: string,
    error: string
  ) => {
    setState(prev => ({
      ...prev,
      tools: prev.tools.map(t =>
        t.id === id
          ? {
              ...t,
              status: 'failed' as const,
              endTime: new Date(),
              error,
              duration: Date.now() - new Date(t.startTime).getTime(),
            }
          : t
      ),
    }));

    eventBus.emit('tool.failed', '', { id, error });
  }, [setState, eventBus]);

  // =========================================================================
  // LIMPIEZA
  // =========================================================================

  const clearAll = useCallback(() => {
    setState(prev => ({
      ...prev,
      terminal: { ...prev.terminal, entries: [] },
      processes: { ...prev.processes, processes: [] },
      tools: [],
      browser: { ...prev.browser, errors: [] },
    }));
  }, [setState]);

  // =========================================================================
  // SERVER METRICS SYNC (m-3: update atom from API fetch results)
  // =========================================================================

  const serverStats = (useRecoilValue(taskMonitorAtom).serverStats ?? null) as Record<string, unknown> | null;
  const isLive = useRecoilValue(taskMonitorAtom).isLive ?? false;

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await window.fetch('/api/metrics/summary');
        if (!cancelled && res.ok) {
          const data = await res.json();
          setState((prev) => ({ ...prev, serverStats: data }));
        }
      } catch {
        // network error — keep previous value
      }
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [setState]);

  // =========================================================================
  // RETORNO
  // =========================================================================

  return {
    // Estado
    activePanel,
    browser,
    terminalEntries,
    activeProcesses,
    runningTools,
    toolHistory,
    stats,
    serverStats,

    // Panel
    setActivePanel,
    toggleLive,

    // Navegador
    browserNavigate,
    browserLoaded,
    browserError,
    browserScreenshot,
    browserClose,
    browserOpen,

    // Terminal
    terminalAddEntry,
    terminalInput,
    terminalOutput,
    terminalError,
    terminalSystem,
    terminalSetCwd,
    terminalSetExecuting,
    terminalClear,

    // Procesos
    processStart,
    processComplete,
    processUpdate,
    processKill,
    processClearCompleted,

    // Herramientas
    toolStart,
    toolComplete,
    toolFail,

    // Cleanup
    clearAll,
    isLive,
  };
}
