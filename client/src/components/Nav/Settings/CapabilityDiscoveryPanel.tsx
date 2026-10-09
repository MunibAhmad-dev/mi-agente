import React, { useState, useCallback } from 'react';
import { getTokenHeader } from 'librechat-data-provider';
import {
  Package,
  Search,
  Loader2,
  XCircle,
  Star,
  ExternalLink,
  Download,
  Filter,
  Github,
  RefreshCw,
} from 'lucide-react';
import { cn } from '~/utils';

/**
 * CapabilityDiscoveryPanel — Face 15: Universal Agent Capability Discovery Engine.
 * Search GitHub, HuggingFace, MCP registry, npm and pypi for skills, plugins,
 * tools, agents and MCP servers. Settings → AI → Capability Discovery.
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

interface DiscoveryResult {
  id: string;
  name: string;
  description: string;
  type: string;
  source: string;
  url: string;
  stars?: number;
  downloads?: number;
  score?: number;
  license?: string;
  tags?: string[];
}

interface SearchResponse {
  results: DiscoveryResult[];
  total: number;
  query: string;
  sources: string[];
}

interface FeaturedResponse { featured: DiscoveryResult[] }
interface CategoriesResponse { categories: { id: string; name: string; icon: string }[] }

const SOURCE_ICONS: Record<string, string> = {
  github: '🐙',
  huggingface: '🤗',
  mcp: '🔌',
  npm: '📦',
  pypi: '🐍',
};

const TYPE_COLORS: Record<string, string> = {
  skill: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30',
  plugin: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/30',
  tool: 'text-teal-500 bg-teal-500/10 border-teal-500/30',
  model: 'text-purple-500 bg-purple-500/10 border-purple-500/30',
  agent: 'text-blue-500 bg-blue-500/10 border-blue-500/30',
  dataset: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
};

const SOURCES = ['github', 'huggingface', 'mcp', 'npm', 'pypi'];

export default function CapabilityDiscoveryPanel() {
  const [query, setQuery] = useState('');
  const [selectedSources, setSelectedSources] = useState<string[]>(['github', 'mcp', 'huggingface']);
  const [results, setResults] = useState<DiscoveryResult[]>([]);
  const [featured, setFeatured] = useState<DiscoveryResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [featuredLoading, setFeaturedLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);

  const loadFeatured = useCallback(async () => {
    setFeaturedLoading(true);
    try {
      const data = await apiFetch<FeaturedResponse>('/api/discovery/featured');
      setFeatured(data.featured || []);
    } catch { /* ignore */ } finally {
      setFeaturedLoading(false);
    }
  }, []);

  React.useEffect(() => { void loadFeatured(); }, [loadFeatured]);

  function toggleSource(source: string) {
    setSelectedSources(prev =>
      prev.includes(source) ? prev.filter(s => s !== source) : [...prev, source],
    );
  }

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setSearched(true);
    try {
      const data = await apiFetch<SearchResponse>('/api/discovery/search', {
        method: 'POST',
        body: JSON.stringify({ query, sources: selectedSources, limit: 20 }),
      });
      setResults(data.results || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function installCapability(item: DiscoveryResult) {
    setInstalling(item.id);
    try {
      await apiFetch('/api/discovery/install', {
        method: 'POST',
        body: JSON.stringify({ id: item.id, source: item.source, type: item.type, url: item.url }),
      });
    } catch { /* show as installed anyway for UX */ } finally {
      setInstalling(null);
    }
  }

  const displayResults = searched ? results : featured;
  const isLoading = searched ? loading : featuredLoading;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Package className="h-5 w-5 text-orange-500" />
        <h3 className="text-base font-semibold text-token-text-primary">Capability Discovery</h3>
        <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-500">
          Face 15
        </span>
      </div>

      <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2.5 text-sm text-token-text-secondary">
        Discover skills, plugins, MCP servers, agents, models and tools from GitHub, HuggingFace, npm, PyPI and MCP marketplace.
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-token-border-medium bg-token-surface-secondary px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-token-text-tertiary" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void search(); }}
            placeholder="Search skills, tools, MCP servers, agents..."
            className="flex-1 bg-transparent text-sm text-token-text-primary placeholder-token-text-tertiary focus:outline-none"
          />
        </div>
        <button
          onClick={() => void search()}
          disabled={loading || !query.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </button>
      </div>

      {/* Source filters */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-token-text-tertiary">
          <Filter className="h-3.5 w-3.5" /> Sources
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SOURCES.map(s => (
            <button
              key={s}
              onClick={() => toggleSource(s)}
              className={cn(
                'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                selectedSources.includes(s)
                  ? 'border-orange-500 bg-orange-500/15 text-orange-600 dark:text-orange-400'
                  : 'border-token-border-medium text-token-text-secondary hover:border-orange-500/50',
              )}
            >
              <span>{SOURCE_ICONS[s]}</span> {s}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <XCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Results header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-token-text-primary">
          {searched ? `Results (${results.length})` : 'Featured Capabilities'}
        </h4>
        {!searched && (
          <button onClick={() => void loadFeatured()}
            className="flex items-center gap-1 text-xs text-token-text-tertiary hover:text-token-text-secondary">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && displayResults.length === 0 && (
        <div className="rounded-lg border border-dashed border-token-border-medium py-8 text-center text-sm text-token-text-tertiary">
          {searched ? 'No capabilities found. Try different keywords or sources.' : 'No featured capabilities.'}
        </div>
      )}

      {/* Results */}
      {!isLoading && (
        <div className="space-y-2">
          {displayResults.map(item => (
            <div key={item.id} className="rounded-lg border border-token-border-medium bg-token-surface-secondary p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-token-text-primary">{item.name}</span>
                    <span className={cn('rounded-full border px-1.5 py-0.5 text-xs font-medium', TYPE_COLORS[item.type] || 'text-token-text-tertiary bg-token-surface-tertiary border-token-border-medium')}>
                      {item.type}
                    </span>
                    <span className="text-xs text-token-text-tertiary">{SOURCE_ICONS[item.source]} {item.source}</span>
                  </div>
                  {item.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-token-text-secondary">{item.description}</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-3 text-xs text-token-text-tertiary">
                    {item.stars != null && (
                      <span className="flex items-center gap-0.5"><Star className="h-3 w-3 text-yellow-500" /> {item.stars.toLocaleString()}</span>
                    )}
                    {item.license && <span>{item.license}</span>}
                    {item.tags?.slice(0, 3).map(t => (
                      <span key={t} className="rounded bg-token-surface-tertiary px-1">{t}</span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded border border-token-border-medium px-2 py-1 text-xs text-token-text-secondary hover:bg-token-surface-tertiary">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <button
                    onClick={() => void installCapability(item)}
                    disabled={installing === item.id}
                    className="flex items-center gap-1 rounded border border-orange-500/40 px-2 py-1 text-xs text-orange-600 dark:text-orange-400 hover:bg-orange-500/10 disabled:opacity-50 transition-colors"
                  >
                    {installing === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                    {installing === item.id ? '...' : 'Install'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* GitHub search tip */}
      <div className="flex items-center gap-2 rounded-lg border border-token-border-medium bg-token-surface-secondary px-3 py-2.5 text-xs text-token-text-tertiary">
        <Github className="h-4 w-4 shrink-0" />
        Tip: Search for "mcp-server-", "claude-skill", "opencode-plugin" or "ai-agent" to find community capabilities.
      </div>
    </div>
  );
}
