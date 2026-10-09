import React, { useState } from 'react';
import { getTokenHeader } from 'librechat-data-provider';
import {
  Microscope,
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  BookMarked,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Search,
  Shield,
} from 'lucide-react';
import { cn } from '~/utils';

/**
 * AutonomousResearchPanel — Face 10: Autonomous Research, Learning & Capability Growth.
 * Full loop: confidence check → research plan → search → verify → hypothesis → skill.
 * Settings → AI → Autonomous Research.
 */

function getToken(): string | null {
  try {
    const auth = getTokenHeader() || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7);
  } catch { /* ignore */ }
  try { return localStorage.getItem('token'); } catch { return null; }
}

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || res.statusText);
  }
  return res.json() as Promise<T>;
}

interface Evidence {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  authority?: number;
}

interface Hypothesis {
  hypothesis: string;
  confidence: number;
  evidenceCount: number;
  domains?: string[];
}

interface ResearchStep { step: string; ts: number; [k: string]: unknown }

interface ResearchResult {
  question: string;
  skipped?: boolean;
  reason?: string;
  subQuestions?: string[];
  evidence: Evidence[];
  verdict: 'CORROBORATED' | 'SINGLE_SOURCE' | 'NO_EVIDENCE' | 'CONTRADICTED' | string;
  hypothesis: Hypothesis;
  answer: string | null;
  skill: { id: string; question: string; confidence: number } | null;
  confidence: number;
  steps: ResearchStep[];
}

const VERDICT_META: Record<string, { label: string; cls: string; dot: string }> = {
  CORROBORATED: { label: 'Corroborated', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  SINGLE_SOURCE: { label: 'Single Source', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  NO_EVIDENCE: { label: 'No Evidence', cls: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400', dot: 'bg-red-500' },
  CONTRADICTED: { label: 'Contradicted', cls: 'border-purple-500/40 bg-purple-500/10 text-purple-600 dark:text-purple-400', dot: 'bg-purple-500' },
};

export default function AutonomousResearchPanel() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [createSkill, setCreateSkill] = useState(true);
  const [maxSubQuestions, setMaxSubQuestions] = useState(4);

  async function runResearch() {
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await apiFetch<ResearchResult>('/api/agents/architect/autonomous', {
        method: 'POST',
        body: JSON.stringify({ question, createSkill, maxSubQuestions }),
      });
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const confidencePct = result ? Math.round(result.confidence * 100) : 0;
  const verdictMeta = result ? (VERDICT_META[result.verdict] || VERDICT_META.NO_EVIDENCE) : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Microscope className="h-5 w-5 text-teal-500" />
        <h3 className="text-base font-semibold text-token-text-primary">Autonomous Research</h3>
        <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-xs font-medium text-teal-500">
          Face 10
        </span>
      </div>

      <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 px-3 py-2.5 text-sm text-token-text-secondary">
        Give the agent something it doesn't know. It will plan research, search multiple sources, form a hypothesis, and optionally create a reusable skill.
      </div>

      {/* Question input */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-token-text-primary">Research Question</label>
        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="What are the most effective techniques for training small language models on domain-specific data?"
          rows={3}
          className="w-full rounded-lg border border-token-border-medium bg-token-surface-primary px-3 py-2 text-sm text-token-text-primary placeholder-token-text-tertiary focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      </div>

      {/* Options */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={createSkill} onChange={e => setCreateSkill(e.target.checked)}
            className="rounded border-token-border-medium text-teal-500 focus:ring-teal-500" />
          <span className="text-sm text-token-text-secondary">Create skill from findings</span>
        </label>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-token-text-tertiary">Max sub-questions:</label>
          <select value={maxSubQuestions} onChange={e => setMaxSubQuestions(Number(e.target.value))}
            className="rounded border border-token-border-medium bg-token-surface-secondary px-2 py-1 text-sm">
            {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {/* Run button */}
      <button
        onClick={() => void runResearch()}
        disabled={loading || !question.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {loading ? 'Researching...' : 'Run Autonomous Research'}
      </button>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <XCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="space-y-2">
          {['Assessing knowledge confidence...', 'Planning research sub-questions...', 'Searching sources...', 'Forming hypothesis...'].map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-token-text-secondary animate-pulse" style={{ animationDelay: `${i * 0.4}s` }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-500" /> {s}
            </div>
          ))}
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <div className="space-y-4">
          {/* Skipped early */}
          {result.skipped && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {result.reason}
            </div>
          )}

          {/* Confidence + verdict */}
          {!result.skipped && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-token-border-medium bg-token-surface-secondary p-3">
                <div className="text-xs text-token-text-tertiary mb-1">Confidence</div>
                <div className="flex items-end gap-1">
                  <span className={cn('text-2xl font-bold', confidencePct >= 70 ? 'text-emerald-500' : confidencePct >= 40 ? 'text-amber-500' : 'text-red-500')}>
                    {confidencePct}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-token-surface-tertiary overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', confidencePct >= 70 ? 'bg-emerald-500' : confidencePct >= 40 ? 'bg-amber-500' : 'bg-red-500')}
                    style={{ width: `${confidencePct}%` }} />
                </div>
              </div>

              {verdictMeta && (
                <div className={cn('rounded-lg border px-3 py-3 text-sm', verdictMeta.cls)}>
                  <div className="text-xs opacity-70 mb-1">Evidence Verdict</div>
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className={cn('h-2 w-2 rounded-full', verdictMeta.dot)} />
                    {verdictMeta.label}
                  </div>
                  <div className="text-xs mt-1 opacity-70">{result.evidence.length} sources</div>
                </div>
              )}
            </div>
          )}

          {/* Hypothesis */}
          {result.hypothesis?.hypothesis && (
            <div className="rounded-lg border border-teal-500/30 bg-teal-500/5 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-sm font-medium text-teal-600 dark:text-teal-400">
                <Lightbulb className="h-4 w-4" /> Hypothesis
              </div>
              <p className="text-sm text-token-text-secondary">{result.hypothesis.hypothesis}</p>
              {(result.hypothesis.domains?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {result.hypothesis.domains?.map(d => (
                    <span key={d} className="rounded-full bg-teal-500/15 px-2 py-0.5 text-xs text-teal-600 dark:text-teal-400">{d}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Answer */}
          {result.answer && (
            <div className="rounded-lg border border-token-border-medium bg-token-surface-secondary p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-sm font-medium text-token-text-primary">
                <Search className="h-4 w-4" /> Research Answer
              </div>
              <p className="text-sm text-token-text-secondary leading-relaxed">{result.answer}</p>
            </div>
          )}

          {/* Evidence list */}
          {result.evidence.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-sm font-medium text-token-text-primary">Evidence ({result.evidence.length} sources)</h4>
              {result.evidence.slice(0, 5).map((e, i) => (
                <a key={i} href={e.url} target="_blank" rel="noopener noreferrer"
                  className="block rounded-lg border border-token-border-medium bg-token-surface-secondary p-2.5 hover:border-teal-500/40 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-teal-600 dark:text-teal-400">{e.title || e.domain}</span>
                    <span className="shrink-0 rounded-full bg-token-surface-tertiary px-1.5 py-0.5 text-xs text-token-text-tertiary">{e.domain}</span>
                  </div>
                  {e.snippet && <p className="mt-1 line-clamp-2 text-xs text-token-text-secondary">{e.snippet}</p>}
                </a>
              ))}
            </div>
          )}

          {/* Skill created */}
          {result.skill && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-600 dark:text-emerald-400">
              <BookMarked className="h-4 w-4 shrink-0" />
              <span>Skill created: <code className="font-mono text-xs">{result.skill.id}</code></span>
              <Shield className="ml-auto h-3.5 w-3.5 shrink-0" />
            </div>
          )}

          {/* Steps (collapsible) */}
          {result.steps.length > 0 && (
            <div>
              <button onClick={() => setShowSteps(v => !v)}
                className="flex items-center gap-1.5 text-xs text-token-text-tertiary hover:text-token-text-secondary">
                {showSteps ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {result.steps.length} execution steps
              </button>
              {showSteps && (
                <div className="mt-2 space-y-1 border-l-2 border-token-border-medium pl-3">
                  {result.steps.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-token-text-tertiary">
                      <CheckCircle className="h-3 w-3 text-teal-500" />
                      <span className="font-mono text-teal-600 dark:text-teal-400">{s.step}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
