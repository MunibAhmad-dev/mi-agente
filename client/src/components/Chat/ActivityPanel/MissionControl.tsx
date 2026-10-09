/**
 * MissionControl - Panel unificado para supervisión completa de agentes
 *
 * Unifica en UNA sola vista todos los componentes de supervisión.
 */

import React, { useState } from 'react';
import { Server, Users, Wrench, Cpu, Minimize2 } from 'lucide-react';
import { AgentTree } from './AgentTree';
import { OverviewPanel } from './OverviewPanel';
import { MetricsPanel } from './MetricsPanel';
import { TimelineViewer } from './TimelineViewer';
import { TaskMonitor, BrowserPanel, TerminalPanel, ProcessPanel, ToolsPanel } from './index';
import { ToolsCatalogPanel } from './ToolsCatalogPanel';
import { ActivityCostPanel } from './ActivityCostPanel';
import { SkillsCatalogPanel } from './SkillsCatalogPanel';
import { ArtifactsPanel } from './ArtifactsPanel';
import { AgentSettingsPanel } from './AgentSettingsPanel';
import { SubagentsPanel } from './SubagentsPanel';
import { ChangeInspector } from './ChangeInspector';
import { AgentStatusBar } from './AgentStatusBar';
import { useTaskMonitor } from '~/hooks/useTaskMonitor';
import { useAgentOrchestrator } from '~/hooks/useAgentOrchestrator';
import { useExecutiveLoop } from '~/hooks/useExecutiveLoop';
import { ExecutiveLoopPanel } from './ExecutiveLoopPanel';
import { MemoryViewerPanel } from './MemoryViewerPanel';
import { HealthDashboardPanel } from './HealthDashboardPanel';
import { HarnessStatusPanel } from './HarnessStatusPanel';
import { ObservabilityPanel } from './ObservabilityPanel';
import { LLMManagementPanel } from './LLMManagementPanel';
import { ResearchPanel } from './ResearchPanel';
import { LearningPanel } from './LearningPanel';
import { SecurityPanel } from './SecurityPanel';
import { SkillsDiscoveryPanel } from './SkillsDiscoveryPanel';
import { KnowledgeBasePanel } from './KnowledgeBasePanel';
import { OrchestratorPanel } from './OrchestratorPanel';
import { PerformancePanel } from './PerformancePanel';
import { CaseIntelligencePanel } from './CaseIntelligencePanel';
import { AgentAnalysisPanel } from './AgentAnalysisPanel';
import { ConstitutionPanel } from './ConstitutionPanel';
import { CognitivePanel } from './CognitivePanel';
import { CreativePanel } from './CreativePanel';
import { VisualIntelligencePanel } from './VisualIntelligencePanel';
import { ModelBrowserPanel } from './ModelBrowserPanel';
import {
  MISSION_CONTROL_TABS,
  ACTIVITY_SUB_TABS,
  type MissionControlPanel,
  type ActivitySubTab,
} from './missionControlConfig';
import { cn } from '~/utils';

interface MissionControlProps {
  className?: string;
  defaultPanel?: MissionControlPanel;
  showActivityBar?: boolean;
  expanded?: boolean;
  onPanelChange?: (panel: MissionControlPanel) => void;
}

/**
 * MissionControl - Componente principal
 */
export const MissionControl: React.FC<MissionControlProps> = ({
  className,
  defaultPanel = 'overview',
  showActivityBar = true,
  expanded = true,
  onPanelChange,
}) => {
  const [activePanel, setActivePanel] = useState<MissionControlPanel>(defaultPanel);
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [activeSubTab, setActiveSubTab] = useState<ActivitySubTab>('tools');

  const { stats: taskStats } = useTaskMonitor();
  const { stats: agentStats, isOrchestrating } = useAgentOrchestrator();
  // useExecutiveLoop is kept so the ExecutiveLoopPanel can still display history
  // and allow manual runs from the UI. The frontend no longer auto-triggers it on
  // every chat submit — the backend wireExecutiveLoop middleware owns that path.
  const { state: loopState } = useExecutiveLoop();

  const handlePanelChange = (panel: MissionControlPanel) => {
    setActivePanel(panel);
    onPanelChange?.(panel);
  };

  // Toggle expand/collapse
  const toggleExpand = () => setIsExpanded(!isExpanded);

  if (!isExpanded) {
    return (
      <div
        className={cn(
          'border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900',
          className,
        )}
      >
        {/* Collapsed header */}
        <div
          className="flex cursor-pointer items-center justify-between border-b border-gray-200 px-3 py-2 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          onClick={toggleExpand}
        >
          <div className="flex items-center gap-2">
            <Server size={16} className="text-indigo-500" />
            <span className="text-sm font-medium">MC</span>
          </div>

          {/* Mini stats */}
          <div className="flex items-center gap-2">
            {isOrchestrating && (
              <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            )}
            {agentStats.activeAgents > 0 && (
              <span className="flex items-center gap-1 text-xs text-green-500">
                <Users size={10} />
                {agentStats.activeAgents}
              </span>
            )}
            {taskStats.runningTools > 0 && (
              <span className="flex items-center gap-1 text-xs text-yellow-500">
                <Wrench size={10} />
                {taskStats.runningTools}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col bg-white dark:bg-gray-900', className)}>
      {/* Header */}
      <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-white">
        <div className="flex items-center gap-3">
          <Server size={20} />
          <span className="text-base font-bold">Mission Control</span>
          {isOrchestrating && (
            <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              LIVE
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Stats globales */}
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1" title="Agentes activos">
              <Users size={12} />
              {agentStats.activeAgents}/{agentStats.totalAgents}
            </span>
            <span className="flex items-center gap-1" title="Herramientas en ejecución">
              <Wrench size={12} />
              {taskStats.runningTools}
            </span>
            <span className="flex items-center gap-1" title="Procesos activos">
              <Cpu size={12} />
              {taskStats.activeProcesses}
            </span>
          </div>

          <button
            onClick={toggleExpand}
            className="rounded p-1 transition-colors hover:bg-white/20"
            title="Minimizar"
          >
            <Minimize2 size={14} />
          </button>
        </div>
      </div>

      {/* Tabs principales */}
      <div className="flex border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
        {MISSION_CONTROL_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activePanel === tab.id;

          // Badge para cada panel
          let badge = 0;
          if (tab.id === 'agents') badge = agentStats.activeAgents;
          if (tab.id === 'activity') badge = taskStats.runningTools;

          return (
            <button
              key={tab.id}
              onClick={() => handlePanelChange(tab.id)}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'border-t-2 border-indigo-500 bg-white text-indigo-600 dark:bg-gray-900 dark:text-indigo-400'
                  : 'border-t-2 border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-400',
              )}
              title={tab.description}
            >
              <Icon size={14} />
              {tab.label}
              {badge > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-xs',
                    isActive
                      ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400'
                      : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
                  )}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Sub-tabs para Activity */}
      {activePanel === 'activity' && (
        <div className="flex border-b border-gray-200 bg-gray-50/50 px-2 dark:border-gray-700 dark:bg-gray-800/50">
          {ACTIVITY_SUB_TABS.map((subTab) => {
            const Icon = subTab.icon;
            const isActive = activeSubTab === subTab.id;

            return (
              <button
                key={subTab.id}
                onClick={() => setActiveSubTab(subTab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                  isActive
                    ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-400',
                )}
              >
                <Icon size={12} />
                {subTab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Contenido del panel activo */}
      <div className="flex-1 overflow-hidden">
        {activePanel === 'loop' && (
          <ExecutiveLoopPanel state={loopState} className="h-full overflow-y-auto" />
        )}
        {activePanel === 'memory' && <MemoryViewerPanel className="h-full" />}
        {activePanel === 'health' && <HealthDashboardPanel className="h-full" />}
        {activePanel === 'harness' && <HarnessStatusPanel className="h-full overflow-y-auto" />}
        {activePanel === 'observability' && <ObservabilityPanel className="h-full" />}
        {activePanel === 'llm' && <LLMManagementPanel className="h-full overflow-y-auto" />}
        {activePanel === 'research' && <ResearchPanel className="h-full" />}
        {activePanel === 'training' && <LearningPanel className="h-full" />}
        {activePanel === 'security' && <SecurityPanel className="h-full" />}
        {activePanel === 'skills-discovery' && <SkillsDiscoveryPanel className="h-full" />}
        {activePanel === 'knowledge' && <KnowledgeBasePanel className="h-full" />}
        {activePanel === 'orchestrator' && <OrchestratorPanel className="h-full" />}
        {activePanel === 'performance' && <PerformancePanel className="h-full" />}
        {activePanel === 'case-intelligence' && <CaseIntelligencePanel className="h-full" />}
        {activePanel === 'agent-analysis' && <AgentAnalysisPanel className="h-full" />}
        {activePanel === 'constitution' && <ConstitutionPanel className="h-full" />}
        {activePanel === 'cognitive' && <CognitivePanel className="h-full" />}
        {activePanel === 'creative' && <CreativePanel className="h-full" />}
        {activePanel === 'visual' && <VisualIntelligencePanel className="h-full" />}
        {activePanel === 'model-browser' && <ModelBrowserPanel className="h-full" />}
        {activePanel === 'overview' && <OverviewPanel />}
        {activePanel === 'agents' && <AgentTree />}
        {activePanel === 'activity' && activeSubTab === 'tools' && <ToolsPanel />}
        {activePanel === 'activity' && activeSubTab === 'catalog' && <ToolsCatalogPanel />}
        {activePanel === 'activity' && activeSubTab === 'cost' && <ActivityCostPanel />}
        {activePanel === 'activity' && activeSubTab === 'skills' && <SkillsCatalogPanel />}
        {activePanel === 'activity' && activeSubTab === 'artifacts' && <ArtifactsPanel />}
        {activePanel === 'activity' && activeSubTab === 'terminal' && <TerminalPanel />}
        {activePanel === 'activity' && activeSubTab === 'browser' && <BrowserPanel />}
        {activePanel === 'activity' && activeSubTab === 'processes' && <ProcessPanel />}
        {activePanel === 'timeline' && <TimelineViewer showStats={true} />}
        {activePanel === 'changes' && <ChangeInspector />}
        {activePanel === 'metrics' && <MetricsPanel />}
        {activePanel === 'settings' && <AgentSettingsPanel />}
        {activePanel === 'subagents' && <SubagentsPanel />}
      </div>

      {/* Activity Status Bar */}
      {showActivityBar && (
        <AgentStatusBar
          activity={{
            status: isOrchestrating
              ? 'executing'
              : agentStats.activeAgents > 0
                ? 'thinking'
                : 'idle',
            action: isOrchestrating
              ? 'Orquestación activa'
              : agentStats.activeAgents > 0
                ? `${agentStats.activeAgents} agente(s) activo(s)`
                : 'Sistema en espera',
            timestamp: new Date(),
          }}
          compact={true}
        />
      )}
    </div>
  );
};

export default MissionControl;
