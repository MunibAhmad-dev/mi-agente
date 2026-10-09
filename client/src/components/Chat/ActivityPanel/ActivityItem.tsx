import React from 'react';
import {
  Search,
  Code,
  FolderOpen,
  Terminal,
  Globe,
  Database,
  Download,
  Cpu,
  Play,
  Rocket,
  Brain,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  ExternalLink,
  Copy,
} from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import type { Activity, ActivityType, ActivityStatus } from './ActivityPanel';

const activityIcons: Record<ActivityType, React.ElementType> = {
  search: Search,
  coding: Code,
  file: FolderOpen,
  command: Terminal,
  api: Globe,
  rag: Database,
  download: Download,
  compile: Cpu,
  test: Play,
  deploy: Rocket,
  reasoning: Brain,
  idle: Clock,
};

const statusIcons: Record<ActivityStatus, React.ElementType> = {
  pending: Loader2,
  running: Loader2,
  completed: CheckCircle,
  failed: XCircle,
};

interface ActivityItemProps {
  activity: Activity;
  expanded?: boolean;
  onToggle?: () => void;
  showDetails?: boolean;
  depth?: number;
}

export const ActivityItem: React.FC<ActivityItemProps> = ({
  activity,
  expanded = false,
  onToggle,
  showDetails = false,
  depth = 0,
}) => {
  const localize = useLocalize();
  const Icon = activityIcons[activity.type] || Clock;
  const StatusIcon = statusIcons[activity.status];

  const getStatusColor = (status: ActivityStatus) => {
    switch (status) {
      case 'running': return 'var(--accent-color, #6366f1)';
      case 'completed': return 'var(--success-color, #22c55e)';
      case 'failed': return 'var(--error-color, #ef4444)';
      default: return 'var(--text-secondary)';
    }
  };

  const formatDuration = (start: Date, end?: Date) => {
    const duration = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
    if (duration < 1000) return `${duration}ms`;
    if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
    return `${Math.floor(duration / 60000)}m ${Math.floor((duration % 60000) / 1000)}s`;
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  const hasChildren = activity.children && activity.children.length > 0;
  const canExpand = hasChildren || showDetails;

  const renderProgressBar = () => {
    if (activity.progress === undefined) return null;
    const progress = Math.min(100, Math.max(0, activity.progress * 100));
    return (
      <div className="progress-bar-container">
        <div 
          className={cn('progress-bar', activity.status)}
          style={{ width: `${progress}%` }}
        />
        <span className="progress-text">{Math.round(progress)}%</span>
      </div>
    );
  };

  const renderSearchData = () => {
    if (activity.type !== 'search' && activity.type !== 'rag') return null;
    const data = activity.data as { query?: string; results?: Array<{ title: string; url: string; score?: number }> } | undefined;
    if (!data) return null;

    return (
      <div className="activity-details search-details">
        {data.query && (
          <div className="detail-row">
            <Search size={12} />
            <span className="query">{data.query}</span>
          </div>
        )}
        {data.results && data.results.length > 0 && (
          <div className="results-list">
            {data.results.slice(0, 5).map((result, idx) => (
              <div key={idx} className="result-item">
                <Globe size={12} />
                <span className="result-title">{result.title}</span>
                {result.score !== undefined && (
                  <span className="result-score">{(result.score * 100).toFixed(0)}%</span>
                )}
              </div>
            ))}
            {data.results.length > 5 && (
              <div className="more-results">
                +{data.results.length - 5} more results
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderCodeData = () => {
    if (activity.type !== 'coding') return null;
    const data = activity.data as { language?: string; file?: string; code?: string } | undefined;
    if (!data) return null;

    return (
      <div className="activity-details code-details">
        {data.file && (
          <div className="detail-row">
            <FolderOpen size={12} />
            <span className="file-path">{data.file}</span>
          </div>
        )}
        {data.language && (
          <span className="language-badge">{data.language}</span>
        )}
        {data.code && (
          <div className="code-preview">
            <pre>{data.code.slice(0, 200)}{data.code.length > 200 ? '...' : ''}</pre>
            <div className="code-actions">
              <button title={localize('com_ui_copy') || 'Copy'}>
                <Copy size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderFileData = () => {
    if (activity.type !== 'file') return null;
    const data = activity.data as { action?: string; path?: string; content?: string } | undefined;
    if (!data) return null;

    return (
      <div className="activity-details file-details">
        {data.path && (
          <div className="detail-row">
            <FolderOpen size={12} />
            <span className="file-path">{data.path}</span>
          </div>
        )}
        {data.action && (
          <span className="action-badge">{data.action}</span>
        )}
      </div>
    );
  };

  return (
    <div 
      className={cn('activity-item', activity.status, `depth-${depth}`)}
      style={{ '--depth': depth } as React.CSSProperties}
    >
      <div className="activity-header" onClick={canExpand ? onToggle : undefined}>
        {/* Expand/Collapse */}
        {canExpand && (
          <button className="expand-btn">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}

        {/* Status Icon */}
        <div 
          className="status-icon"
          style={{ color: getStatusColor(activity.status) }}
        >
          <StatusIcon 
            size={14} 
            className={activity.status === 'running' ? 'animate-spin' : ''} 
          />
        </div>

        {/* Type Icon */}
        <div className="type-icon">
          <Icon size={14} />
        </div>

        {/* Title */}
        <div className="activity-content">
          <span className="activity-title">{activity.title}</span>
          {activity.description && (
            <span className="activity-description">{activity.description}</span>
          )}
        </div>

        {/* Progress */}
        {renderProgressBar()}

        {/* Duration */}
        <div className="activity-duration">
          <Clock size={12} />
          <span>{formatDuration(activity.startTime, activity.endTime)}</span>
        </div>

        {/* Time */}
        <div className="activity-time">
          {formatTime(activity.startTime)}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="activity-expanded">
          {renderSearchData()}
          {renderCodeData()}
          {renderFileData()}

          {/* Error */}
          {activity.error && (
            <div className="activity-error">
              <XCircle size={14} />
              <span>{activity.error}</span>
            </div>
          )}

          {/* Children */}
          {activity.children && activity.children.length > 0 && (
            <div className="activity-children">
              {activity.children.map(child => (
                <ActivityItem
                  key={child.id}
                  activity={child}
                  depth={depth + 1}
                  showDetails={true}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ActivityItem;
