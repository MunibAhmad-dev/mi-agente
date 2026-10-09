import React, { useState, useCallback, useEffect } from 'react';
import {
  BrainCircuit,
  Search,
  Lightbulb,
  Loader2,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Zap,
  Shield,
  BookOpen,
  Cpu,
} from 'lucide-react';
import { cn } from '~/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalysisResult {
  capabilities?: string[];
  strengths?: string[];
  weaknesses?: string[];
  recommendations?: string[];
  summary?: string;
  raw?: string;
  [key: string]: unknown;
}

interface AgentProfile {
  id?: string;
  name?: string;
  role?: string;
  capabilities?: string[];
  status?: string;
  [key: string]: unknown;
}

type Tab = 'analyze' | 'profiles' | 'insights';

// ── Analyze Tab ───────────────────────────────────────────────────────────────

function AnalyzeTab() {
  const [agentDesc, setAgentDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const analyze = async () => {
    if (!agentDesc.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const prompt = `Perform a comprehensive capability analysis of this AI agent or system: "${agentDesc.trim()}".
Identify: 1) Core capabilities 2) Strengths 3) Weaknesses/gaps 4) Recommended improvements 5) Architecture insights.
Return structured JSON with keys: capabilities (array), strengths (array), weaknesses (array), recommendations (array), summary (string).`;

      const res = await window.fetch('/api/research/deep', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: prompt, type: 'agent-analysis' }),
      });
      if (!res.ok) { setError(`Analysis failed (${res.status})`); return; }
      const d = await res.json();

      // Try to parse structured result from the response
      let parsed: AnalysisResult = {};
      const content = d.result ?? d.content ?? d.answer ?? JSON.stringify(d);
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        else parsed = { summary: content };
      } catch {
        parsed = { summary: content.slice(0, 1000) };
      }
      parsed.raw = content;
      setResult(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const sections: { key: keyof AnalysisResult; label: string; icon: React.ReactNode; color: string }[] = [
    { key: 'capabilities', label: 'Capabilities', icon: <Cpu size={12} />, color: 'indigo' },
    { key: 'strengths', label: 'Strengths', icon: <Zap size={12} />, color: 'emerald' },
    { key: 'weaknesses', label: 'Weaknesses', icon: <Shield size={12} />, color: 'amber' },
    { key: 'recommendations', label: 'Recommendations', icon: <Lightbulb size={12} />, color: 'purple' },
  ];

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs text-gray-500">Describe an agent, system, or paste its configuration to run capability reverse-engineering.</p>
      <textarea
        value={agentDesc}
        onChange={(e) => setAgentDesc(e.target.value)}
        rows={4}
        placeholder="e.g. 'Research agent with web access and memory — orchestrates 3 subagents (summarizer, validator, citer)'"
        className="w-full resize-none rounded border border-gray-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-700 dark:bg-gray-900"
      />
      {error && <p className="rounded bg-red-50 p-2 text-xs text-red-600 dark:bg-red-900/20">{error}</p>}
      <button onClick={analyze} disabled={loading || !agentDesc.trim()}
        className="flex items-center justify-center gap-1.5 rounded bg-indigo-500 py-2 text-xs text-white hover:bg-indigo-600 disabled:opacity-50">
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
        {loading ? 'Analyzing…' : 'Analyze Agent'}
      </button>

      {result && (
        <div className="flex flex-col gap-2">
          {result.summary && (
            <div className="rounded border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Summary</p>
              <p className="text-xs text-gray-700 dark:text-gray-300">{String(result.summary).slice(0, 400)}</p>
            </div>
          )}
          {sections.map(({ key, label, icon, color }) => {
            const items = result[key];
            if (!Array.isArray(items) || items.length === 0) return null;
            const isOpen = expanded === key;
            return (
              <div key={String(key)} className="rounded border border-gray-100 dark:border-gray-800">
                <button onClick={() => setExpanded(isOpen ? null : String(key))}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium">
                  {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  <span className={cn(`text-${color}-500`)}>{icon}</span>
                  {label}
                  <span className="ml-auto text-gray-400">({items.length})</span>
                </button>
                {isOpen && (
                  <ul className="border-t border-gray-50 px-3 pb-2 pt-1 dark:border-gray-800">
                    {items.map((item, i) => (
                      <li key={i} className="flex items-start gap-1.5 py-0.5 text-xs text-gray-600 dark:text-gray-400">
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-gray-300" />
                        {String(item)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Profiles Tab ──────────────────────────────────────────────────────────────

function ProfilesTab() {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Try multiagent endpoint first, fallback to agent hierarchy
      const res = await window.fetch('/api/multiagent/types', { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        const list: AgentProfile[] = Array.isArray(d) ? d : d.types ?? d.agents ?? [];
        setAgents(list);
      } else {
        // Fallback: list any known agent profiles
        const res2 = await window.fetch('/api/agents', { credentials: 'include' });
        if (res2.ok) {
          const d2 = await res2.json();
          setAgents(Array.isArray(d2) ? d2 : d2.agents ?? []);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="text-xs text-gray-500">Known agent types and profiles registered in the system.</p>
      {loading && <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-gray-400" /></div>}
      {!loading && agents.length === 0 && (
        <p className="text-center text-xs text-gray-400 py-4">No agent profiles found</p>
      )}
      {agents.map((a, i) => {
        const id = a.id ?? String(i);
        const isOpen = selected === id;
        return (
          <div key={id} className="rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
            <button onClick={() => setSelected(isOpen ? null : id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs">
              {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <BrainCircuit size={12} className="text-indigo-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 dark:text-gray-200 truncate">{a.name ?? a.role ?? id}</p>
                {a.role && a.name && <p className="text-[10px] text-gray-400 capitalize">{a.role}</p>}
              </div>
              {a.status && (
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded', a.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500')}>
                  {a.status}
                </span>
              )}
            </button>
            {isOpen && (
              <div className="border-t border-gray-100 px-3 py-2 dark:border-gray-800">
                {Array.isArray(a.capabilities) && a.capabilities.length > 0 && (
                  <>
                    <p className="mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Capabilities</p>
                    <div className="flex flex-wrap gap-1">
                      {a.capabilities.map((c, j) => (
                        <span key={j} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">{c}</span>
                      ))}
                    </div>
                  </>
                )}
                {Object.entries(a).filter(([k]) => !['id', '_id', 'name', 'role', 'capabilities', 'status'].includes(k)).slice(0, 5).map(([k, v]) => (
                  <div key={k} className="flex justify-between py-0.5 text-xs mt-1">
                    <span className="text-gray-500">{k}</span>
                    <span className="font-mono text-gray-700 dark:text-gray-300">{String(v).slice(0, 40)}</span>
                  </div>
                ))}
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

// ── Insights Tab ──────────────────────────────────────────────────────────────

function InsightsTab() {
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.fetch('/api/research/deep', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'Analyze the current multi-agent system architecture and identify: top 5 architectural improvements, capability gaps, and coordination inefficiencies. Return as JSON array of insight strings.',
          type: 'system-insights',
        }),
      });
      if (res.ok) {
        const d = await res.json();
        const content = d.result ?? d.content ?? d.answer ?? '';
        try {
          const match = content.match(/\[[\s\S]*\]/);
          if (match) setInsights(JSON.parse(match[0]).map(String));
          else setInsights(content.split('\n').filter(Boolean).slice(0, 10));
        } catch {
          setInsights(content.split('\n').filter(Boolean).slice(0, 10));
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="text-xs text-gray-500">AI-generated architecture insights and improvement suggestions for the agent system.</p>
      {loading && (
        <div className="flex flex-col items-center gap-2 py-8">
          <Loader2 size={20} className="animate-spin text-indigo-400" />
          <p className="text-xs text-gray-400">Analyzing system architecture…</p>
        </div>
      )}
      {!loading && insights.length === 0 && (
        <div className="text-center py-4">
          <p className="text-xs text-gray-400 mb-2">No insights yet</p>
          <button onClick={load} className="rounded bg-indigo-50 px-3 py-1.5 text-xs text-indigo-500 hover:bg-indigo-100">
            Generate Insights
          </button>
        </div>
      )}
      {insights.map((insight, i) => (
        <div key={i} className="flex items-start gap-2 rounded border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <BookOpen size={11} className="mt-0.5 shrink-0 text-indigo-400" />
          <p className="text-xs text-gray-700 dark:text-gray-300">{insight}</p>
        </div>
      ))}
      {insights.length > 0 && (
        <button onClick={load} disabled={loading} className="mt-1 flex items-center gap-1 self-end text-[10px] text-gray-400 hover:text-gray-600">
          <RefreshCw size={10} className={cn(loading && 'animate-spin')} /> Refresh
        </button>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props { className?: string }

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'analyze', label: 'Analyze', icon: <Search size={12} /> },
  { id: 'profiles', label: 'Profiles', icon: <BrainCircuit size={12} /> },
  { id: 'insights', label: 'Insights', icon: <Lightbulb size={12} /> },
];

export function AgentAnalysisPanel({ className }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('analyze');

  return (
    <div className={cn('flex flex-col bg-white dark:bg-gray-900', className)}>
      <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Agent Analysis</span>
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
        {activeTab === 'analyze' && <AnalyzeTab />}
        {activeTab === 'profiles' && <ProfilesTab />}
        {activeTab === 'insights' && <InsightsTab />}
      </div>
    </div>
  );
}
