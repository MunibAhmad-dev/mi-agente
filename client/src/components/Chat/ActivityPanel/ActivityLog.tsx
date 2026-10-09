import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Clock,
  Info,
  AlertTriangle,
  XCircle,
  CheckCircle,
  Download,
  Copy,
  Trash2,
} from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import type { Activity, ActivityStatus } from './ActivityPanel';

interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  activityId?: string;
}

interface ActivityLogProps {
  activities: Activity[];
  maxEntries?: number;
}

export const ActivityLog: React.FC<ActivityLogProps> = ({
  activities,
  maxEntries = 500,
}) => {
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const logContainerRef = useRef<HTMLDivElement>(null);
  const localize = useLocalize();

  // Convert activities to log entries
  const logEntries: LogEntry[] = activities.flatMap(activity => {
    const entries: LogEntry[] = [];
    
    // Start entry
    entries.push({
      timestamp: new Date(activity.startTime),
      level: 'info',
      message: `[${activity.type.toUpperCase()}] Started: ${activity.title}`,
      activityId: activity.id,
    });

    // Progress entries
    if (activity.progress !== undefined) {
      entries.push({
        timestamp: new Date(activity.startTime),
        level: 'info',
        message: `[${activity.type.toUpperCase()}] Progress: ${Math.round(activity.progress * 100)}%`,
        activityId: activity.id,
      });
    }

    // Error entry
    if (activity.error) {
      entries.push({
        timestamp: new Date(activity.endTime || Date.now()),
        level: 'error',
        message: `[${activity.type.toUpperCase()}] Error: ${activity.error}`,
        activityId: activity.id,
      });
    }

    // Completion entry
    if (activity.status === 'completed') {
      const duration = activity.endTime
        ? new Date(activity.endTime).getTime() - new Date(activity.startTime).getTime()
        : 0;
      entries.push({
        timestamp: new Date(activity.endTime || Date.now()),
        level: 'success',
        message: `[${activity.type.toUpperCase()}] Completed in ${duration}ms`,
        activityId: activity.id,
      });
    }

    // Children entries
    if (activity.children) {
      activity.children.forEach(child => {
        entries.push({
          timestamp: new Date(child.startTime),
          level: 'info',
          message: `[${child.type.toUpperCase()}] ${child.title}`,
          activityId: child.id,
        });
      });
    }

    return entries;
  }).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()).slice(-maxEntries);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logEntries, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!logContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  }, []);

  const copyLog = useCallback(() => {
    const text = logEntries
      .map(entry => `[${formatTimestamp(entry.timestamp)}] ${entry.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
  }, [logEntries]);

  const clearLog = useCallback(() => {
    // This would typically clear the parent state
    console.log('Clear log');
  }, []);

  const filteredEntries = filter === 'all' 
    ? logEntries 
    : logEntries.filter(e => e.level === filter);

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  };

  const getLevelIcon = (level: LogEntry['level']) => {
    switch (level) {
      case 'warn': return AlertTriangle;
      case 'error': return XCircle;
      case 'success': return CheckCircle;
      default: return Info;
    }
  };

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'warn': return 'var(--warning-color, #f59e0b)';
      case 'error': return 'var(--error-color, #ef4444)';
      case 'success': return 'var(--success-color, #22c55e)';
      default: return 'var(--text-secondary)';
    }
  };

  return (
    <div className="activity-log">
      {/* Header */}
      <div className="log-header">
        <div className="log-filters">
          {(['all', 'info', 'warn', 'error'] as const).map(level => (
            <button
              key={level}
              className={cn('filter-btn', filter === level && 'active')}
              onClick={() => setFilter(level)}
            >
              {level === 'all' ? 'All' : level === 'warn' ? 'Warn' : level}
            </button>
          ))}
        </div>
        <div className="log-actions">
          <button
            className={cn('action-btn', autoScroll && 'active')}
            onClick={() => setAutoScroll(!autoScroll)}
            title={localize('com_ui_auto_scroll') || 'Auto-scroll'}
          >
            <Download size={14} className={autoScroll ? 'flipped' : ''} />
          </button>
          <button
            className="action-btn"
            onClick={copyLog}
            title={localize('com_ui_copy') || 'Copy'}
          >
            <Copy size={14} />
          </button>
          <button
            className="action-btn"
            onClick={clearLog}
            title={localize('com_ui_clear') || 'Clear'}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Log Entries */}
      <div 
        className="log-container"
        ref={logContainerRef}
        onScroll={handleScroll}
      >
        {filteredEntries.length === 0 ? (
          <div className="log-empty">
            <Clock size={24} />
            <span>{localize('com_ui_no_logs') || 'No log entries yet'}</span>
          </div>
        ) : (
          filteredEntries.map((entry, idx) => {
            const LevelIcon = getLevelIcon(entry.level);
            return (
              <div 
                key={idx} 
                className={cn('log-entry', entry.level)}
                style={{ '--level-color': getLevelColor(entry.level) } as React.CSSProperties}
              >
                <span className="log-timestamp">{formatTimestamp(entry.timestamp)}</span>
                <LevelIcon size={12} className="log-level-icon" />
                <span className="log-message">{entry.message}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="log-footer">
        <span className="log-count">
          {filteredEntries.length} / {logEntries.length} {localize('com_ui_entries') || 'entries'}
        </span>
      </div>
    </div>
  );
};

export default ActivityLog;
