import React, { useEffect, useRef, useState, useCallback } from 'react';

/**
 * HarnessEventFeed — Face 14.
 * Real-time SSE consumer for Harness engine events in the React chat UI.
 * Connects to /api/harness/events and renders live agent activity.
 */

interface HarnessEvent {
  id: string;
  type: string;
  phase?: string;
  message?: string;
  data?: Record<string, unknown>;
  timestamp: string;
  level?: 'info' | 'warning' | 'error' | 'success';
}

interface HarnessEventFeedProps {
  sessionId?: string;
  maxEvents?: number;
  autoScroll?: boolean;
  collapsed?: boolean;
  onEvent?: (event: HarnessEvent) => void;
}

const PHASE_COLORS: Record<string, string> = {
  classify: '#6366f1',
  decompose: '#8b5cf6',
  plan: '#3b82f6',
  execute: '#10b981',
  verify: '#f59e0b',
  complete: '#22c55e',
  error: '#ef4444',
  default: '#64748b',
};

const LEVEL_BADGES: Record<string, string> = {
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

export function HarnessEventFeed({
  sessionId,
  maxEvents = 100,
  autoScroll = true,
  collapsed: initialCollapsed = false,
  onEvent,
}: HarnessEventFeedProps) {
  const [events, setEvents] = useState<HarnessEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
    }

    const url = sessionId ? `/api/harness/events?sessionId=${sessionId}` : '/api/harness/events';
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
      setError(null);
    };

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as HarnessEvent;
        const event: HarnessEvent = {
          ...data,
          id: data.id || `ev_${Date.now()}`,
          timestamp: data.timestamp || new Date().toISOString(),
        };
        setEvents((prev) => {
          const updated = [...prev, event];
          return updated.length > maxEvents ? updated.slice(-maxEvents) : updated;
        });
        onEvent?.(event);
      } catch {}
    };

    es.onerror = () => {
      setConnected(false);
      setError('Connection lost. Retrying…');
      es.close();
      setTimeout(connect, 3000);
    };
  }, [sessionId, maxEvents, onEvent]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
    };
  }, [connect]);

  useEffect(() => {
    if (autoScroll && !collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, autoScroll, collapsed]);

  const clearEvents = () => setEvents([]);

  const phaseColor = (phase?: string) => PHASE_COLORS[phase?.toLowerCase() || 'default'] || PHASE_COLORS.default;

  return (
    <div className="harness-event-feed rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm text-sm font-mono">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700 cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
        role="button"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}
            title={connected ? 'Connected' : 'Disconnected'}
          />
          <span className="font-semibold text-gray-700 dark:text-gray-300">Harness Events</span>
          {events.length > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">({events.length})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {events.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); clearEvents(); }}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              title="Clear events"
            >
              clear
            </button>
          )}
          <span className="text-gray-400">{collapsed ? '▼' : '▲'}</span>
        </div>
      </div>

      {/* Event list */}
      {!collapsed && (
        <div
          ref={scrollRef}
          className="overflow-y-auto max-h-64 p-2 space-y-1"
          style={{ scrollBehavior: 'smooth' }}
        >
          {error && (
            <div className="text-xs text-red-500 px-1 py-0.5">{error}</div>
          )}
          {events.length === 0 && (
            <div className="text-xs text-gray-400 italic px-1 py-1">Waiting for agent activity…</div>
          )}
          {events.map((ev) => (
            <div key={ev.id} className="flex items-start gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-1 py-0.5">
              {/* Phase indicator */}
              <span
                className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: phaseColor(ev.phase) }}
                title={ev.phase || ev.type}
              />
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  {ev.phase && (
                    <span className="text-xs font-medium uppercase tracking-wide" style={{ color: phaseColor(ev.phase) }}>
                      {ev.phase}
                    </span>
                  )}
                  {ev.level && (
                    <span className={`text-xs px-1 rounded ${LEVEL_BADGES[ev.level] || ''}`}>
                      {ev.level}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                {ev.message && (
                  <p className="text-xs text-gray-700 dark:text-gray-300 break-words">{ev.message}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default HarnessEventFeed;
