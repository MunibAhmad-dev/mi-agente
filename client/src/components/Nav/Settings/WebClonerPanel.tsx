import React, { useState, useEffect } from 'react';
import { getTokenHeader } from 'librechat-data-provider';
import {
  Globe,
  Loader2,
  CheckCircle,
  XCircle,
  Download,
  Code2,
  Palette,
  LayoutDashboard,
  Link2,
  Image,
  FileText,
  ChevronDown,
  ChevronRight,
  Zap,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '~/utils';

/**
 * WebClonerPanel — Face 18: Website Cloning & Reverse Engineering Engine.
 * Analyze or fully clone any URL — extracts structure, colors, fonts,
 * assets, and generates an editable scaffold.
 * Settings → AI → Website Cloner.
 */

function getToken(): string | null {
  try {
    const auth = getTokenHeader() || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7);
  } catch { /* ignore */ }
  try { return localStorage.getItem('token'); } catch { return null; }
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function downloadFile(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Structure {
  headings: { level: number; text: string }[];
  navLinks: { href: string; text: string }[];
  colors: string[];
  fonts: string[];
  imageCount: number;
  formCount: number;
  hasHeader: boolean;
  hasFooter: boolean;
  hasNav: boolean;
  sections: number;
}

interface AnalyzeResult {
  url: string;
  structure: Structure;
  htmlLength: number;
}

interface CloneResult {
  url: string;
  title: string;
  structure: Structure;
  assetCount: number;
  scaffold: {
    indexHtml: string;
    stylesCss: string;
    readmeMd: string;
    assetUrls: string[];
  };
}

type Result = AnalyzeResult | CloneResult;

function isCloneResult(r: Result): r is CloneResult {
  return 'scaffold' in r;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ColorSwatch({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-5 w-5 rounded border border-white/20 shadow-sm flex-shrink-0"
        style={{ background: color }}
      />
      <span className="font-mono text-xs text-token-text-secondary">{color}</span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        });
      }}
      className="rounded p-1 hover:bg-token-surface-tertiary transition-colors"
      title="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-token-text-secondary" />}
    </button>
  );
}

function Collapsible({ label, count, children }: { label: string; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border border-token-border-light overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-token-surface-secondary transition-colors"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {label}
          {count !== undefined && (
            <span className="rounded-full bg-token-surface-tertiary px-1.5 py-0.5 text-xs text-token-text-secondary">{count}</span>
          )}
        </span>
      </button>
      {open && <div className="border-t border-token-border-light p-3">{children}</div>}
    </div>
  );
}

function StructureTab({ structure }: { structure: Structure }) {
  return (
    <div className="flex flex-col gap-3">
      {/* Page metrics */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Images', value: structure.imageCount, icon: <Image className="h-4 w-4" /> },
          { label: 'Forms', value: structure.formCount, icon: <FileText className="h-4 w-4" /> },
          { label: 'Sections', value: structure.sections, icon: <LayoutDashboard className="h-4 w-4" /> },
        ].map(m => (
          <div key={m.label} className="flex flex-col items-center gap-1 rounded-lg bg-token-surface-secondary p-2 text-center">
            <span className="text-token-text-secondary">{m.icon}</span>
            <span className="text-lg font-bold">{m.value}</span>
            <span className="text-xs text-token-text-secondary">{m.label}</span>
          </div>
        ))}
      </div>

      {/* Semantic landmarks */}
      <div className="flex flex-wrap gap-1.5">
        {[
          { label: 'header', active: structure.hasHeader },
          { label: 'nav', active: structure.hasNav },
          { label: 'footer', active: structure.hasFooter },
        ].map(l => (
          <span
            key={l.label}
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-medium',
              l.active
                ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                : 'bg-token-surface-tertiary text-token-text-tertiary line-through',
            )}
          >
            {'<'}{l.label}{'/>'}
          </span>
        ))}
      </div>

      {/* Headings */}
      {structure.headings.length > 0 && (
        <Collapsible label="Headings" count={structure.headings.length}>
          <ul className="flex flex-col gap-1">
            {structure.headings.slice(0, 20).map((h, i) => (
              <li key={i} className="flex items-baseline gap-2 text-sm">
                <span className="w-5 shrink-0 text-right text-xs text-token-text-tertiary font-mono">H{h.level}</span>
                <span className="truncate text-token-text-primary">{h.text || '(empty)'}</span>
              </li>
            ))}
          </ul>
        </Collapsible>
      )}

      {/* Nav links */}
      {structure.navLinks.length > 0 && (
        <Collapsible label="Links" count={structure.navLinks.length}>
          <ul className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {structure.navLinks.slice(0, 30).map((l, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <Link2 className="h-3 w-3 shrink-0 text-token-text-tertiary" />
                <span className="min-w-0 truncate text-token-text-secondary" title={l.href}>{l.text || l.href}</span>
              </li>
            ))}
          </ul>
        </Collapsible>
      )}
    </div>
  );
}

function DesignTab({ structure }: { structure: Structure }) {
  return (
    <div className="flex flex-col gap-3">
      <Collapsible label="Colors detected" count={structure.colors.length}>
        {structure.colors.length === 0 ? (
          <p className="text-sm text-token-text-secondary">No inline colors detected.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {structure.colors.map((c, i) => <ColorSwatch key={i} color={c} />)}
          </div>
        )}
      </Collapsible>

      <Collapsible label="Fonts detected" count={structure.fonts.length}>
        {structure.fonts.length === 0 ? (
          <p className="text-sm text-token-text-secondary">No font families detected.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {structure.fonts.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="text-sm" style={{ fontFamily: f }}>{f}</span>
                <span className="font-mono text-xs text-token-text-tertiary">{f}</span>
              </li>
            ))}
          </ul>
        )}
      </Collapsible>
    </div>
  );
}

function ScaffoldTab({ scaffold, title }: { scaffold: CloneResult['scaffold']; title: string }) {
  const [activeFile, setActiveFile] = useState<'html' | 'css' | 'readme' | 'assets'>('readme');
  const hostname = (() => { try { return new URL(title || '').hostname; } catch { return 'site'; } })();

  const files = {
    readme: { label: 'README.md', content: scaffold.readmeMd, mime: 'text/markdown', filename: 'README.md' },
    html: { label: 'index.html', content: scaffold.indexHtml, mime: 'text/html', filename: 'index.html' },
    css: { label: 'styles.css', content: scaffold.stylesCss, mime: 'text/css', filename: 'styles.css' },
  } as const;

  const current = activeFile !== 'assets' ? files[activeFile as keyof typeof files] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {(Object.keys(files) as (keyof typeof files)[]).map(k => (
          <button
            key={k}
            onClick={() => setActiveFile(k)}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-medium transition-colors',
              activeFile === k
                ? 'bg-blue-600 text-white'
                : 'bg-token-surface-secondary text-token-text-secondary hover:bg-token-surface-tertiary',
            )}
          >
            {files[k].label}
          </button>
        ))}
        <button
          onClick={() => setActiveFile('assets')}
          className={cn(
            'rounded px-2.5 py-1 text-xs font-medium transition-colors',
            activeFile === 'assets'
              ? 'bg-blue-600 text-white'
              : 'bg-token-surface-secondary text-token-text-secondary hover:bg-token-surface-tertiary',
          )}
        >
          Assets ({scaffold.assetUrls.length})
        </button>
      </div>

      {current && (
        <div className="relative">
          <div className="absolute right-2 top-2 flex gap-1 z-10">
            <CopyButton text={current.content} />
            <button
              onClick={() => downloadFile(current.filename, current.content, current.mime)}
              className="rounded p-1 hover:bg-token-surface-tertiary transition-colors"
              title={`Download ${current.filename}`}
            >
              <Download className="h-3.5 w-3.5 text-token-text-secondary" />
            </button>
          </div>
          <pre className="max-h-72 overflow-auto rounded-lg bg-token-surface-secondary p-3 pr-16 text-xs text-token-text-primary font-mono whitespace-pre-wrap break-all">
            {current.content.slice(0, 8000)}{current.content.length > 8000 ? '\n\n... (truncated for display)' : ''}
          </pre>
        </div>
      )}

      {activeFile === 'assets' && (
        <div className="max-h-64 overflow-y-auto rounded-lg bg-token-surface-secondary p-3">
          {scaffold.assetUrls.length === 0 ? (
            <p className="text-sm text-token-text-secondary">No external assets detected.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {scaffold.assetUrls.map((u, i) => (
                <li key={i} className="flex items-center gap-2 text-xs font-mono text-token-text-secondary break-all">
                  <span className="shrink-0 text-token-text-tertiary">{String(i + 1).padStart(2, '0')}</span>
                  <span className="truncate" title={u}>{u}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Download all */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(files) as (keyof typeof files)[]).map(k => (
          <button
            key={k}
            onClick={() => downloadFile(files[k].filename, files[k].content, files[k].mime)}
            className="flex items-center gap-1.5 rounded bg-token-surface-secondary px-2.5 py-1.5 text-xs text-token-text-secondary hover:bg-token-surface-tertiary transition-colors"
          >
            <Download className="h-3 w-3" />
            {files[k].label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── History types ────────────────────────────────────────────────────────────

interface HistoryEntry {
  url: string;
  title?: string;
  type: 'analyze' | 'clone';
  cloned_at: string;
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function WebClonerPanel() {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'analyze' | 'clone'>('analyze');
  const [waitIdle, setWaitIdle] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [activeTab, setActiveTab] = useState<'structure' | 'design' | 'scaffold'>('structure');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load history from server on mount
  useEffect(() => {
    apiFetch('/api/cloner/history', {}).then((d) => setHistory(d.items || [])).catch(() => {});
  }, []);

  const handleRun = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    const safe = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let data: Result;
      if (mode === 'analyze') {
        data = await apiFetch('/api/cloner/analyze', {
          method: 'POST',
          body: JSON.stringify({ url: safe }),
        });
      } else {
        data = await apiFetch('/api/cloner/clone', {
          method: 'POST',
          body: JSON.stringify({ url: safe, waitForNetworkIdle: waitIdle, timeoutMs: 45000 }),
        });
      }
      setResult(data);
      setActiveTab(mode === 'clone' && isCloneResult(data) ? 'scaffold' : 'structure');
      // Refresh history after each operation
      apiFetch('/api/cloner/history', {}).then((d) => setHistory(d.items || [])).catch(() => {});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { key: 'structure' as const, label: 'Structure', icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
    { key: 'design' as const, label: 'Design', icon: <Palette className="h-3.5 w-3.5" /> },
    ...(result && isCloneResult(result) ? [{ key: 'scaffold' as const, label: 'Scaffold', icon: <Code2 className="h-3.5 w-3.5" /> }] : []),
  ];

  return (
    <div className="flex flex-col gap-5 py-2">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <Globe className="h-5 w-5 text-indigo-500" />
        <div>
          <p className="text-sm font-semibold">Website Cloner</p>
          <p className="text-xs text-token-text-secondary">Reverse-engineer any site — extract structure, colors, fonts, and generate an editable scaffold.</p>
        </div>
      </div>

      {/* Mode selector */}
      <div className="flex rounded-lg overflow-hidden border border-token-border-light">
        {[
          { key: 'analyze' as const, label: 'Analyze', desc: 'Lightweight — fetches HTML, no JS rendering', icon: <Zap className="h-3.5 w-3.5" /> },
          { key: 'clone' as const, label: 'Full Clone', desc: 'Playwright — renders JS, captures full page', icon: <Globe className="h-3.5 w-3.5" /> },
        ].map((m, i) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={cn(
              'flex-1 px-3 py-2.5 text-left transition-colors',
              i === 0 ? '' : 'border-l border-token-border-light',
              mode === m.key ? 'bg-indigo-600/10 text-indigo-600 dark:text-indigo-400' : 'hover:bg-token-surface-secondary text-token-text-secondary',
            )}
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              {m.icon} {m.label}
            </div>
            <p className="mt-0.5 text-xs text-token-text-tertiary">{m.desc}</p>
          </button>
        ))}
      </div>

      {/* URL input */}
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && handleRun()}
          placeholder="https://example.com"
          className="flex-1 rounded-lg border border-token-border-light bg-token-surface-secondary px-3 py-2 text-sm placeholder-token-text-tertiary focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        />
        <button
          onClick={handleRun}
          disabled={loading || !url.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
          {loading ? 'Running…' : 'Run'}
        </button>
      </div>

      {/* Clone options */}
      {mode === 'clone' && (
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-token-text-secondary">
          <div
            onClick={() => setWaitIdle(w => !w)}
            className={cn(
              'relative h-5 w-9 rounded-full transition-colors',
              waitIdle ? 'bg-indigo-600' : 'bg-token-surface-tertiary',
            )}
          >
            <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', waitIdle ? 'translate-x-4' : 'translate-x-0.5')} />
          </div>
          Wait for network idle (slower, more complete)
        </label>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2.5 text-sm text-red-600 dark:text-red-400">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="flex flex-col gap-3">
          {/* Summary bar */}
          <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
            <CheckCircle className="h-4 w-4 shrink-0" />
            <span className="font-medium truncate">{result.url}</span>
            {isCloneResult(result) && result.title && (
              <span className="ml-auto shrink-0 text-xs text-token-text-tertiary truncate max-w-[160px]">{result.title}</span>
            )}
            {'htmlLength' in result && (
              <span className="ml-auto shrink-0 text-xs text-token-text-tertiary">{Math.round((result as AnalyzeResult).htmlLength / 1024)}KB HTML</span>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1.5 border-b border-token-border-light pb-px">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-t px-3 py-1.5 text-xs font-medium transition-colors',
                  activeTab === t.key
                    ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'text-token-text-secondary hover:text-token-text-primary',
                )}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {activeTab === 'structure' && <StructureTab structure={result.structure} />}
          {activeTab === 'design' && <DesignTab structure={result.structure} />}
          {activeTab === 'scaffold' && isCloneResult(result) && (
            <ScaffoldTab scaffold={result.scaffold} title={result.url} />
          )}
        </div>
      )}

      {/* ── Clone History (Face 18 memory) ── */}
      {history.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', showHistory && 'rotate-90')} />
            Recent clones ({history.length})
          </button>
          {showHistory && (
            <div className="mt-2 flex flex-col gap-1 rounded-lg border border-black/10 p-2 dark:border-white/10">
              {history.map((h, i) => (
                <button
                  key={i}
                  onClick={() => setUrl(h.url)}
                  className="flex items-center gap-2 rounded px-2 py-1 text-left hover:bg-gray-100 dark:hover:bg-white/5"
                >
                  <Globe className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{h.title || h.url}</p>
                    <p className="truncate text-xs text-gray-500">{h.url}</p>
                  </div>
                  <span className="ml-auto shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-white/10">
                    {h.type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
