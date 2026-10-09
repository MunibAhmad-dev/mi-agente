/**
 * TaskMonitor - Panel principal para navegador, terminal, herramientas y procesos
 * 
 * Muestra en tiempo real:
 * - Navegador
 * - Terminal
 * - Herramientas
 * - Procesos
 */

import React from 'react';
import {
  Globe,
  Terminal,
  Wrench,
  Activity,
  Radio,
  Pause,
  RefreshCw,
  Maximize2,
  X,
} from 'lucide-react';
import { useTaskMonitor } from '~/hooks/useTaskMonitor';
import { BrowserPanel } from './BrowserPanel';
import { TerminalPanel } from './TerminalPanel';
import { ToolsPanel } from './ToolsPanel';
import { ProcessPanel } from './ProcessPanel';
import { cn } from '~/utils';
import type { ActivePanel } from '~/store/taskMonitorStore';

interface TaskMonitorProps {
  className?: string;
  defaultPanel?: ActivePanel;
  showTabs?: boolean;
  showHeader?: boolean;
}

/**
 * Configuración de tabs
 */
const TABS: { id: ActivePanel; label: string; icon: React.ElementType }[] = [
  { id: 'tools', label: 'Herramientas', icon: Wrench },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'browser', label: 'Navegador', icon: Globe },
  { id: 'processes', label: 'Procesos', icon: Activity },
];

/**
 * TaskMonitor - Componente principal
 */
export const TaskMonitor: React.FC<TaskMonitorProps> = ({
  className,
  defaultPanel = 'tools',
  showTabs = true,
  showHeader = true,
}) => {
  const {
    activePanel,
    setActivePanel,
    isLive,
    toggleLive,
    stats,
    clearAll,
  } = useTaskMonitor();

  const activeTab = TABS.find(t => t.id === activePanel) || TABS[0];

  return (
    <div className={cn('flex flex-col bg-white dark:bg-gray-900', className)}>
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-gray-500" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Monitor
            </span>
            
            {/* Indicador live */}
            <button
              onClick={toggleLive}
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
                isLive
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
              )}
            >
              {isLive ? (
                <>
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  Live
                </>
              ) : (
                <>
                  <Pause size={10} />
                  Pausado
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Stats rápidos */}
            <div className="flex items-center gap-3 text-xs text-gray-400">
              {stats.runningTools > 0 && (
                <span className="flex items-center gap-1">
                  <Wrench size={12} className="text-yellow-500" />
                  {stats.runningTools}
                </span>
              )}
              {stats.activeProcesses > 0 && (
                <span className="flex items-center gap-1">
                  <Activity size={12} className="text-green-500" />
                  {stats.activeProcesses}
                </span>
              )}
            </div>

            {/* Acciones */}
            <button
              onClick={clearAll}
              className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              title="Limpiar todo"
            >
              <RefreshCw size={14} className="text-gray-500" />
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      {showTabs && (
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activePanel === tab.id;
            const count = tab.id === 'tools' 
              ? stats.runningTools 
              : tab.id === 'processes' 
                ? stats.activeProcesses 
                : 0;

            return (
              <button
                key={tab.id}
                onClick={() => setActivePanel(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors relative',
                  isActive
                    ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-400'
                )}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
                
                {/* Badge */}
                {count > 0 && (
                  <span className={cn(
                    'absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-xs font-medium rounded-full',
                    tab.id === 'tools'
                      ? 'bg-yellow-500 text-white'
                      : 'bg-green-500 text-white'
                  )}>
                    {count > 9 ? '9+' : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Contenido del panel activo */}
      <div className="flex-1 overflow-hidden">
        {activePanel === 'browser' && <BrowserPanel />}
        {activePanel === 'terminal' && <TerminalPanel />}
        {activePanel === 'tools' && <ToolsPanel />}
        {activePanel === 'processes' && <ProcessPanel />}
      </div>
    </div>
  );
};

export default TaskMonitor;
