import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Code,
  FolderOpen,
  FileText,
  Terminal,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Minimize2,
  Maximize2,
  X,
  RefreshCw,
  Play,
  Pause,
  Square,
} from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { ActivityItem } from './ActivityItem';
import { ActivityLog } from './ActivityLog';
import './ActivityPanel.css';

export type ActivityType = 
  | 'search'
  | 'coding'
  | 'file'
  | 'command'
  | 'api'
  | 'rag'
  | 'download'
  | 'compile'
  | 'test'
  | 'deploy'
  | 'reasoning'
  | 'idle';

export type ActivityStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Activity {
  id: string;
  type: ActivityType;
  status: ActivityStatus;
  title: string;
  description?: string;
  progress?: number;
  startTime: Date;
  endTime?: Date;
  data?: Record<string, unknown>;
  children?: Activity[];
  error?: string;
  duration?: number;
}

export interface ActivityPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  activities: Activity[];
  currentActivity?: Activity;
  isGenerating?: boolean;
  onStop?: () => void;
  className?: string;
}

type TabType = 'current' | 'search' | 'coding' | 'files' | 'log';

const tabIcons: Record<TabType, React.ElementType> = {
  current: Activity,
  search: Search,
  coding: Code,
  files: FolderOpen,
  log: FileText,
};

export const ActivityPanel: React.FC<ActivityPanelProps> = ({
  isOpen,
  onClose,
  onMinimize,
  activities,
  currentActivity,
  isGenerating = false,
  onStop,
  className,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('current');
  const [isMinimized, setIsMinimized] = useState(false);
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());
  const localize = useLocalize();

  const toggleActivity = useCallback((id: string) => {
    setExpandedActivities(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: 'current', label: localize('com_ui_current') || 'Current', icon: Activity },
    { id: 'search', label: localize('com_ui_search') || 'Search', icon: Search },
    { id: 'coding', label: localize('com_ui_coding') || 'Code', icon: Code },
    { id: 'files', label: localize('com_ui_files') || 'Files', icon: FolderOpen },
    { id: 'log', label: localize('com_ui_log') || 'Log', icon: FileText },
  ];

  const filteredActivities = activities.filter(a => {
    if (activeTab === 'current') return true;
    if (activeTab === 'search') return a.type === 'search' || a.type === 'rag';
    if (activeTab === 'coding') return a.type === 'coding' || a.type === 'compile' || a.type === 'test';
    if (activeTab === 'files') return a.type === 'file' || a.type === 'download' || a.type === 'deploy';
    return true;
  });

  const getStatusColor = (status: ActivityStatus) => {
    switch (status) {
      case 'running': return 'var(--accent-color)';
      case 'completed': return 'var(--success-color, #22c55e)';
      case 'failed': return 'var(--error-color, #ef4444)';
      default: return 'var(--text-secondary)';
    }
  };

  if (!isOpen) return null;

  return (
    <div className={cn('activity-panel', isMinimized && 'minimized', className)}>
      {/* Header */}
      <div className="panel-header">
        <div className="header-title">
          {isGenerating && <span className="pulse-indicator" />}
          <Activity size={16} />
          <span>{localize('com_ui_activity_panel') || 'AI Activity'}</span>
        </div>

        {/* Tabs */}
        <div className="header-tabs">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const count = tab.id === 'current' 
              ? (isGenerating ? 1 : 0)
              : filteredActivities.filter(a => {
                  if (tab.id === 'search') return a.type === 'search' || a.type === 'rag';
                  if (tab.id === 'coding') return a.type === 'coding';
                  if (tab.id === 'files') return a.type === 'file';
                  return false;
                }).length;

            return (
              <button
                key={tab.id}
                className={cn('tab-btn', isActive && 'active')}
                onClick={() => setActiveTab(tab.id)}
                title={tab.label}
              >
                <Icon size={14} />
                {count > 0 && <span className="tab-count">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Controls */}
        <div className="header-controls">
          {onStop && isGenerating && (
            <button
              className="control-btn stop"
              onClick={onStop}
              title={localize('com_ui_stop') || 'Stop'}
            >
              <Square size={14} />
            </button>
          )}
          <button
            className="control-btn"
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? localize('com_ui_maximize') : localize('com_ui_minimize')}
          >
            {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
          <button
            className="control-btn close"
            onClick={onClose}
            title={localize('com_ui_close') || 'Close'}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      {!isMinimized && (
        <div className="panel-content">
          {/* Current Activity Section */}
          {activeTab === 'current' && (
            <div className="current-section">
              {currentActivity ? (
                <ActivityItem
                  activity={currentActivity}
                  expanded={true}
                  onToggle={() => {}}
                  showDetails={true}
                />
              ) : isGenerating ? (
                <div className="idle-state">
                  <Loader2 size={20} className="animate-spin" />
                  <span>{localize('com_ui_thinking') || 'Thinking...'}</span>
                </div>
              ) : (
                <div className="idle-state">
                  <Activity size={20} />
                  <span>{localize('com_ui_idle') || 'Waiting for task...'}</span>
                </div>
              )}
            </div>
          )}

          {/* Activity List */}
          {activeTab !== 'current' && (
            <div className="activities-list">
              {filteredActivities.length === 0 ? (
                <div className="empty-state">
                  <Activity size={24} />
                  <span>{localize('com_ui_no_activities') || 'No activities yet'}</span>
                </div>
              ) : (
                filteredActivities.map(activity => (
                  <ActivityItem
                    key={activity.id}
                    activity={activity}
                    expanded={expandedActivities.has(activity.id)}
                    onToggle={() => toggleActivity(activity.id)}
                    showDetails={true}
                  />
                ))
              )}
            </div>
          )}

          {/* Log View */}
          {activeTab === 'log' && (
            <ActivityLog activities={activities} />
          )}
        </div>
      )}

      {/* Footer */}
      {!isMinimized && (
        <div className="panel-footer">
          <span className="activity-count">
            {activities.length} {localize('com_ui_activities') || 'activities'}
          </span>
          <div className="footer-actions">
            <button
              className="footer-btn"
              onClick={() => setExpandedActivities(new Set(activities.map(a => a.id)))}
              title={localize('com_ui_expand_all') || 'Expand all'}
            >
              <ChevronDown size={14} />
            </button>
            <button
              className="footer-btn"
              onClick={() => setExpandedActivities(new Set())}
              title={localize('com_ui_collapse_all') || 'Collapse all'}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityPanel;
