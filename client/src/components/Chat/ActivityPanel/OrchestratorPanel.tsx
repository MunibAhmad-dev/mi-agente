import React, { useState, useCallback, useEffect } from 'react';
import {
  Network,
  Plus,
  Pause,
  Play,
  StopCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Send,
  Loader2,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';
import { cn } from '~/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Agent {
  agentId: string;
  role?: string;
  status?: string;
  [key: string]: unknown;
}

interface Task {
  taskId: string;
  description?: string;
  status?: string;
  [key: string]: unknown;
}

interface Session {
  sessionId: string;
  status?: string;
  agents?: Agent[];
  tasks?: Task[];
  createdAt?: string;
  [key: string]: unknown;
}

type Tab = 'sessions' | 'new' | 'message';

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusIcon(s: string | undefined) {
  if (s === 'running' || s === 'active') return <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse inline-block" />;
  if (s === 'paused') return <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />;
  if (s === 'failed' || s === 'error') return <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />;
  if (s === 'completed') return <CheckCircle2 size={12} className="text-emerald-500" />;
  return <Clock size={12} className="text-gray-400" />;
}

// ── Sessions Tab ──────────────────────────────────────────────────────────────

function SessionsTab() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [agentsMap, setAgentsMap] = useState<Record<string, Agent[]>>({});
  const [tasksMap, setTasksMap] = useState<Record<string, Task[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.fetch('/api/multiagent/sessions', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSessions(Array.isArray(data) ? data : data.sessions ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const expand = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    // Fetch agents + tasks for this session
    try {
      const [aRes, tRes] = await Promise.all([
        window.fetch(`/api/multiagent/sessions/${id}/agents`, { credentials: 'include' }),
        window.fetch(`/api/multiagent/sessions/${id}/tasks`, { credentials: 'include' }),
      ]);
      if (aRes.ok) {
        const d = await aRes.json();
        setAgentsMap((m) => ({ ...m, [id]: Array.isArray(d) ? d : d.agents ?? [] }));
      }
      if (tRes.ok) {
        const d = await tRes.json();
        setTasksMap((m) => ({ ...m, [id]: Array.isArray(d) ? d : d.tasks ?? [] }));
      }
    } catch {
      // ignore
    }
  };

  const doAction = async (id: string, action: 'pause' | 'resume') => {
    setBusy(id + action);
    try {
      await window.fetch(`/api/multiagent/sessions/${id}/${action}`, {
        method: 'POST', credentials: 'include',
      });
      load();
    } catch {
      // ignore
    } finally {
      setBusy(null);
    }
  };

  const deleteSession = async (id: string) => {
    setBusy(id + 'del');
    try {
      await window.fetch(`/api/multiagent/sessions/${id}`, {
        method: 'DELETE', credentials: 'include',
      });
      load();
    } catch {
      // ignore
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      {loading && <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-gray-400" /></div>}
      {!loading && sessions.length === 0 && (
        <p className="text-center text-xs text-gray-400">No sessions — create one below</p>
      )}
      {sessions.map((s) => {
        const id = s.sessionId;
        const isOpen = expanded === id;
        return (
          <div key={id} className="rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
            <button
              onClick={() => expand(id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
            >
              {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {statusIcon(s.status)}
              <span className="flex-1 font-mono truncate">{id.slice(0, 24)}</span>
              <span className="capitalize text-gray-400">{s.status ?? 'unknown'}</span>
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 p-3 dark:border-gray-800">
                {/* Agents */}
                {(agentsMap[id] ?? []).length > 0 && (
                  <div className="mb-2">
                    <p className="mb-1 text-[10px] font-semibold text-indigo-500 uppercase tracking-wider">
                      Agents ({agentsMap[id].length})
                    </p>
                    {agentsMap[id].map((a) => (
                      <div key={a.agentId} className="flex items-center gap-2 py-0.5 text-xs">
                        <Users size={10} className="text-gray-400" />
                        <span className="font-mono">{a.agentId.slice(0, 16)}</span>
                        <span className="text-gray-400">{a.role}</span>
                        {statusIcon(a.status)}
                      </div>
                    ))}
                  </div>
                )}
                {/* Tasks */}
                {(tasksMap[id] ?? []).length > 0 && (
                  <div className="mb-2">
                    <p className="mb-1 text-[10px] font-semibold text-amber-500 uppercase tracking-wider">
                      Tasks ({tasksMap[id].length})
                    </p>
                    {tasksMap[id].map((t) => (
                      <div key={t.taskId} className="flex items-center gap-2 py-0.5 text-xs">
                        {statusIcon(t.status)}
                        <span className="flex-1 truncate text-gray-700 dark:text-gray-300">
                          {t.description ?? t.taskId.slice(0, 24)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Actions */}
                <div className="flex gap-1.5 mt-2">
                  {s.status === 'running' ? (
                    <button
                      onClick={() => doAction(id, 'pause')}
                      disabled={busy !== null}
                      className="flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-600 hover:bg-amber-100 disabled:opacity-50"
                    >
                      <Pause size={9} /> Pause
                    </button>
                  ) : (
                    <button
                      onClick={() => doAction(id, 'resume')}
                      disabled={busy !== null}
                      className="flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-[10px] text-emerald-600 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      <Play size={9} /> Resume
                    </button>
                  )}
                  <button
                    onClick={() => deleteSession(id)}
                    disabled={busy !== null}
                    className="flex items-center gap-1 rounded bg-red-50 px-2 py-1 text-[10px] text-red-500 hover:bg-red-100 disabled:opacity-50"
                  >
                    <StopCircle size={9} /> Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <button onClick={load} disabled={loading} className="mt-1 flex items-center gap-1 self-end text-[10px] text-gray-400 hover:text-gray-600">
        <RefreshCw size={10} className={cn(loading && 'animate-spin')} /> Refresh
      </button>
    </div>
  );
}

// ── New Session Tab ───────────────────────────────────────────────────────────

function NewSessionTab() {
  const [objective, setObjective] = useState('');
  const [agentCount, setAgentCount] = useState(2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ sessionId?: string; error?: string } | null>(null);

  const create = async () => {
    if (!objective.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await window.fetch('/api/multiagent/sessions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective: objective.trim(), agentCount }),
      });
      const data = await res.json();
      if (!res.ok) setResult({ error: data.error ?? 'Failed' });
      else setResult({ sessionId: data.sessionId ?? data.id });
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'Failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <label className="mb-1 block text-[10px] text-gray-500">Objective / Goal</label>
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          rows={3}
          placeholder="Describe what the multi-agent session should accomplish…"
          className="w-full resize-none rounded border border-gray-200 bg-white p-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-900"
        />
      </div>
      <div className="flex items-center gap-3">
        <label className="text-[10px] text-gray-500">Agents</label>
        <input
          type="number"
          min={1}
          max={10}
          value={agentCount}
          onChange={(e) => setAgentCount(Number(e.target.value))}
          className="w-16 rounded border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
        />
      </div>
      {result && (
        <div className={cn('rounded p-2 text-xs', result.error ? 'bg-red-50 text-red-600 dark:bg-red-900/20' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20')}>
          {result.error ?? `Session created: ${result.sessionId}`}
        </div>
      )}
      <button
        onClick={create}
        disabled={loading || !objective.trim()}
        className="flex items-center justify-center gap-1.5 rounded bg-indigo-500 py-2 text-xs text-white hover:bg-indigo-600 disabled:opacity-50"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
        {loading ? 'Creating…' : 'Create Session'}
      </button>
    </div>
  );
}

// ── Message Tab ───────────────────────────────────────────────────────────────

interface AgentType { type?: string; description?: string; role?: string; [k: string]: unknown }

function MessageTab() {
  const [types, setTypes] = useState<AgentType[]>([]);
  const [message, setMessage] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');

  useEffect(() => {
    window.fetch('/api/multiagent/types', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setTypes(Array.isArray(d) ? d : d.types ?? []); })
      .catch(() => null);
  }, []);

  const send = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setResult('');
    try {
      const body: Record<string, unknown> = { message: message.trim() };
      if (sessionId.trim()) body.sessionId = sessionId.trim();
      const res = await window.fetch('/api/multiagent/messages', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2).slice(0, 500));
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      {types.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Agent types</p>
          <div className="flex flex-wrap gap-1.5">
            {types.map((t) => (
              <span key={String(t.type ?? t.role)} className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
                {String(t.type ?? t.role)}
              </span>
            ))}
          </div>
        </div>
      )}
      <input
        value={sessionId}
        onChange={(e) => setSessionId(e.target.value)}
        placeholder="Session ID (optional — broadcasts otherwise)"
        className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-900"
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        placeholder="Message to send to the orchestrator…"
        className="w-full resize-none rounded border border-gray-200 bg-white p-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-900"
      />
      <button
        onClick={send}
        disabled={loading || !message.trim()}
        className="flex items-center justify-center gap-1.5 rounded bg-indigo-500 py-2 text-xs text-white hover:bg-indigo-600 disabled:opacity-50"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        {loading ? 'Sending…' : 'Send Message'}
      </button>
      {result && (
        <pre className="overflow-x-auto rounded bg-gray-50 p-2 text-[10px] text-gray-700 dark:bg-gray-800 dark:text-gray-300">
          {result}
        </pre>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props { className?: string }

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'sessions', label: 'Sessions', icon: <Network size={12} /> },
  { id: 'new', label: 'New Session', icon: <Plus size={12} /> },
  { id: 'message', label: 'Messages', icon: <Send size={12} /> },
];

export function OrchestratorPanel({ className }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('sessions');

  return (
    <div className={cn('flex flex-col bg-white dark:bg-gray-900', className)}>
      <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">AI Orchestrator</span>
      </div>
      <div className="flex border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={cn('flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
              activeTab === t.id ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-400')}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'sessions' && <SessionsTab />}
        {activeTab === 'new' && <NewSessionTab />}
        {activeTab === 'message' && <MessageTab />}
      </div>
    </div>
  );
}
