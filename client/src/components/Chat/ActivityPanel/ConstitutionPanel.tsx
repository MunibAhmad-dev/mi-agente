/**
 * ConstitutionPanel — Face 7: Agent Constitution (Master System Prompt).
 *
 * Admins can view, create, and activate Agent Constitution versions.
 * The active constitution's persona is injected into every ExecutiveLoop step.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { BookOpen, CheckCircle2, Plus, Loader2, RefreshCw, ChevronDown, ChevronRight, Shield } from 'lucide-react';
import { cn } from '~/utils';

interface Constitution {
  _id: string;
  name: string;
  version: number;
  isActive: boolean;
  persona: string;
  values: string[];
  operatingPrinciples: string[];
  constraints: string[];
  fullText: string;
  notes: string;
  activatedAt?: string;
  activatedBy?: string;
}

interface Props { className?: string }

// ── Sub-components ─────────────────────────────────────────────────────────────

function ConstitutionCard({
  doc,
  onActivate,
  activating,
}: {
  doc: Constitution;
  onActivate: (id: string) => void;
  activating: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(
      'rounded-lg border text-xs transition-colors',
      doc.isActive
        ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/30'
        : 'border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900',
    )}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={() => setExpanded(v => !v)} className="text-gray-400 hover:text-gray-600">
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>

        <span className="font-semibold text-gray-700 dark:text-gray-200">
          {doc.name} <span className="font-mono font-normal text-gray-400">v{doc.version}</span>
        </span>

        {doc.isActive && (
          <span className="flex items-center gap-0.5 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
            <CheckCircle2 size={9} /> Active
          </span>
        )}

        {!doc.isActive && (
          <button
            disabled={activating === doc._id}
            onClick={() => onActivate(doc._id)}
            className="ml-auto flex items-center gap-1 rounded bg-indigo-500 px-2 py-1 text-[10px] text-white hover:bg-indigo-600 disabled:opacity-50"
          >
            {activating === doc._id ? <Loader2 size={9} className="animate-spin" /> : null}
            Activate
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-3 pb-3 pt-2 dark:border-gray-800">
          {doc.persona && (
            <div className="mb-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Persona</p>
              <p className="whitespace-pre-wrap text-[10px] text-gray-600 dark:text-gray-400">{doc.persona.slice(0, 400)}{doc.persona.length > 400 ? '…' : ''}</p>
            </div>
          )}
          {doc.values.length > 0 && (
            <div className="mb-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-500">Values</p>
              {doc.values.map((v, i) => <p key={i} className="text-[10px] text-gray-600 dark:text-gray-400">· {v}</p>)}
            </div>
          )}
          {doc.operatingPrinciples.length > 0 && (
            <div className="mb-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-blue-500">Principles</p>
              {doc.operatingPrinciples.map((p, i) => <p key={i} className="text-[10px] text-gray-600 dark:text-gray-400">· {p}</p>)}
            </div>
          )}
          {doc.constraints.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-500">Constraints</p>
              {doc.constraints.map((c, i) => <p key={i} className="text-[10px] text-amber-600 dark:text-amber-400">⚡ {c}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Draft form ─────────────────────────────────────────────────────────────────

function DraftForm({ onSaved }: { onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: 'default',
    persona: '',
    values: '',
    operatingPrinciples: '',
    constraints: '',
    notes: '',
  });

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const save = async () => {
    if (!form.persona.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: form.name || 'default',
        persona: form.persona,
        values: form.values.split('\n').map(s => s.trim()).filter(Boolean),
        operatingPrinciples: form.operatingPrinciples.split('\n').map(s => s.trim()).filter(Boolean),
        constraints: form.constraints.split('\n').map(s => s.trim()).filter(Boolean),
        notes: form.notes,
      };
      const res = await window.fetch('/api/admin/constitution', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) onSaved();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400';
  const labelCls = 'mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-gray-400';

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 dark:border-indigo-900/40 dark:bg-indigo-950/20">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">New Version</p>

      <div>
        <label className={labelCls}>Name</label>
        <input className={inputCls} value={form.name} onChange={set('name')} placeholder="default" />
      </div>
      <div>
        <label className={labelCls}>Persona <span className="text-red-400">*</span></label>
        <textarea className={inputCls} rows={4} value={form.persona} onChange={set('persona')}
          placeholder="You are a senior autonomous AI agent…" />
      </div>
      <div>
        <label className={labelCls}>Values (one per line)</label>
        <textarea className={inputCls} rows={3} value={form.values} onChange={set('values')}
          placeholder="Precision&#10;Safety&#10;Transparency" />
      </div>
      <div>
        <label className={labelCls}>Operating Principles (one per line)</label>
        <textarea className={inputCls} rows={3} value={form.operatingPrinciples} onChange={set('operatingPrinciples')}
          placeholder="Explore before acting&#10;Verify before declaring done" />
      </div>
      <div>
        <label className={labelCls}>Constraints (one per line)</label>
        <textarea className={inputCls} rows={2} value={form.constraints} onChange={set('constraints')}
          placeholder="Never commit to main&#10;Never delete files without ask" />
      </div>
      <div>
        <label className={labelCls}>Notes</label>
        <input className={inputCls} value={form.notes} onChange={set('notes')} placeholder="Optional notes…" />
      </div>
      <button
        onClick={save}
        disabled={saving || !form.persona.trim()}
        className="flex items-center justify-center gap-1.5 rounded bg-indigo-500 py-2 text-xs text-white hover:bg-indigo-600 disabled:opacity-50"
      >
        {saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
        Save version
      </button>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export function ConstitutionPanel({ className }: Props) {
  const [constitutions, setConstitutions] = useState<Constitution[]>([]);
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.fetch('/api/admin/constitution', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setConstitutions(data.constitutions ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activate = async (id: string) => {
    setActivating(id);
    try {
      const res = await window.fetch(`/api/admin/constitution/${id}/activate`, {
        method: 'PUT',
        credentials: 'include',
      });
      if (res.ok) await load();
    } catch {
      // ignore
    } finally {
      setActivating(null);
    }
  };

  const active = constitutions.find(c => c.isActive);

  return (
    <div className={cn('flex flex-col bg-white dark:bg-gray-900', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <Shield size={13} className="text-indigo-500" />
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Agent Constitution</span>
        <span className="ml-1 text-[10px] text-gray-400">Face 7</span>
        <button onClick={load} disabled={loading} className="ml-auto text-gray-400 hover:text-gray-600">
          <RefreshCw size={11} className={cn(loading && 'animate-spin')} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">

        {/* Active banner */}
        {active ? (
          <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-xs dark:bg-green-950/30">
            <CheckCircle2 size={12} className="text-green-500 shrink-0" />
            <span className="text-green-700 dark:text-green-300">
              <span className="font-medium">{active.name} v{active.version}</span> is active — injected into every executive step
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs dark:bg-amber-950/30">
            <BookOpen size={12} className="text-amber-500 shrink-0" />
            <span className="text-amber-700 dark:text-amber-300">
              No constitution active. Steps use built-in defaults. Create one below.
            </span>
          </div>
        )}

        {/* Version list */}
        {loading && <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-gray-400" /></div>}

        {!loading && constitutions.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Versions ({constitutions.length})</p>
            {constitutions.map(doc => (
              <ConstitutionCard key={doc._id} doc={doc} onActivate={activate} activating={activating} />
            ))}
          </div>
        )}

        {!loading && constitutions.length === 0 && (
          <p className="text-center text-xs text-gray-400 py-4">No constitution versions yet.</p>
        )}

        {/* New version button */}
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 self-start rounded border border-dashed border-indigo-300 px-3 py-1.5 text-xs text-indigo-500 hover:border-indigo-400 hover:bg-indigo-50 dark:border-indigo-700 dark:hover:bg-indigo-950/20"
        >
          <Plus size={11} /> {showForm ? 'Cancel' : 'New version'}
        </button>

        {showForm && (
          <DraftForm onSaved={() => { setShowForm(false); load(); }} />
        )}
      </div>
    </div>
  );
}

export default ConstitutionPanel;
