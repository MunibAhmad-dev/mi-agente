import React, { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@librechat/client';
import { getTokenHeader } from 'librechat-data-provider';
import {
  BookOpenCheck,
  CircleAlert,
  ExternalLink,
  Globe,
  Library,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * KnowledgeEnginePanel — Motor de búsqueda universal + verificación factual
 * (FASE 34). Expone en Configuración → IA la capa de conocimiento que ya vive
 * en el backend (`/api/universal-search`): búsqueda multi-fuente con perfil de
 * confiabilidad, verificación de afirmaciones por corroboración entre dominios
 * independientes, y el catálogo de fuentes (Source Catalog).
 */

function getToken(): string | null {
  try {
    const auth = getTokenHeader() || '';
    if (auth.startsWith('Bearer ')) {
      return auth.slice('Bearer '.length);
    }
  } catch { /* ignore */ }
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

type TabId = 'search' | 'verify' | 'sources';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  domain: string;
  type: string;
  authority: number;
  reliability: number;
}

interface SourceEntry {
  domain: string;
  name: string;
  type: string;
  authority: number;
  reliability: number;
}

const VERDICT_META: Record<
  string,
  { label: string; cls: string; dot: string; hint: string }
> = {
  CORROBORATED: {
    label: 'Corroborado',
    cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    hint: 'Múltiples dominios independientes apoyan la afirmación.',
  },
  SINGLE_SOURCE: {
    label: 'Fuente única',
    cls: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
    hint: 'Solo un dominio apoya la afirmación: conviene más evidencia.',
  },
  CONTRADICTED: {
    label: 'Contradicho',
    cls: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
    dot: 'bg-red-500',
    hint: 'Hay fuentes que apoyan y fuentes que contradicen la afirmación.',
  },
  NO_EVIDENCE: {
    label: 'Sin evidencia',
    cls: 'border-border-light bg-surface-tertiary/60 text-text-secondary',
    dot: 'bg-text-secondary',
    hint: 'No se encontró evidencia relevante. No significa falso.',
  },
  INCONCLUSIVE: {
    label: 'No concluyente',
    cls: 'border-border-light bg-surface-tertiary/60 text-text-secondary',
    dot: 'bg-text-secondary',
    hint: 'La evidencia encontrada no permite un veredicto claro.',
  },
};

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    wiki: 'Wiki',
    database: 'Base de datos',
    repository: 'Repositorio',
    academic: 'Académica',
    community: 'Comunidad',
    fanwiki: 'Fan wiki',
    docs: 'Documentación',
    news: 'Noticias',
    government: 'Gobierno',
    organization: 'Organización',
    reference: 'Referencia',
    unknown: 'Web',
  };
  return map[type] ?? type;
}

function scoreColor(v: number): string {
  if (v >= 0.75) return 'text-emerald-600 dark:text-emerald-400';
  if (v >= 0.55) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function ScoreBar({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${Math.round(value * 100)}%`}>
      <span className="h-1 w-10 overflow-hidden rounded-full bg-surface-tertiary">
        <span
          className={cn('block h-full rounded-full', value >= 0.75 ? 'bg-emerald-500' : value >= 0.55 ? 'bg-amber-500' : 'bg-red-500')}
          style={{ width: `${Math.max(6, Math.min(100, value * 100))}%` }}
        />
      </span>
      <span className={cn('font-mono text-[10px]', scoreColor(value))}>
        {Math.round(value * 100)}
      </span>
    </span>
  );
}

export default function KnowledgeEnginePanel() {
  const localize = useLocalize();
  const [tab, setTab] = useState<TabId>('search');

  // Búsqueda
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchQueries, setSearchQueries] = useState<string[]>([]);
  const [searchProvider, setSearchProvider] = useState('');

  // Verificación
  const [claim, setClaim] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verdict, setVerdict] = useState<any | null>(null);

  // Catálogo de fuentes
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/universal-search?q=${encodeURIComponent(q.trim())}`, {
        headers: { Authorization: `Bearer ${getToken() ?? ''}` },
      });
      const json = await res.json();
      if (!json?.success) {
        setError(json?.error || `HTTP ${res.status}`);
        setSearchResults([]);
        return;
      }
      setSearchResults(json.results ?? []);
      setSearchTotal(json.total ?? 0);
      setSearchQueries(json.queries ?? []);
      setSearchProvider(json.provider ?? '');
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setSearching(false);
    }
  }, []);

  const runVerify = useCallback(async (c: string) => {
    if (!c.trim()) {
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/universal-search/verify?claim=${encodeURIComponent(c.trim())}&synthesize=1`,
        { headers: { Authorization: `Bearer ${getToken() ?? ''}` } },
      );
      const json = await res.json();
      if (!json?.success) {
        setError(json?.error || `HTTP ${res.status}`);
        setVerdict(null);
        return;
      }
      setVerdict(json);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setVerifying(false);
    }
  }, []);

  const loadSources = useCallback(async () => {
    setLoadingSources(true);
    setError(null);
    try {
      const res = await fetch('/api/universal-search/sources', {
        headers: { Authorization: `Bearer ${getToken() ?? ''}` },
      });
      const json = await res.json();
      if (!json?.success) {
        setError(json?.error || `HTTP ${res.status}`);
        return;
      }
      setSources(json.sources ?? []);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setLoadingSources(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'sources' && sources.length === 0) {
      void loadSources();
    }
  }, [tab, sources.length, loadSources]);

  const tabs: { id: TabId; label: string; icon: typeof Search }[] = [
    { id: 'search', label: 'Buscar', icon: Search },
    { id: 'verify', label: 'Verificar afirmación', icon: ShieldCheck },
    { id: 'sources', label: 'Fuentes', icon: Library },
  ];

  const verdictMeta = verdict ? VERDICT_META[verdict.verdict] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-tertiary/60 p-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
          <BookOpenCheck className="size-3.5" aria-hidden="true" />
          Knowledge Engine
        </p>
        <span className="text-[10px] text-text-secondary">
          Búsqueda multi-fuente · verificación por corroboración
        </span>
      </div>

      {/* Pestañas */}
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Knowledge Engine">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTab(t.id);
                setError(null);
              }}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border-light bg-surface-tertiary text-text-secondary hover:text-text-primary',
              )}
            >
              <Icon className="size-3" aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="flex items-start gap-1.5 rounded-md border border-border-light bg-surface-tertiary/60 p-2 text-xs text-red-600 dark:text-red-400">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {tab === 'search' && (
        <div className="flex flex-col gap-2">
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(query);
            }}
          >
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en la web (multi-fuente)…"
              aria-label="Consulta de búsqueda universal"
              className="h-9 w-full rounded-md border border-border-light bg-surface-secondary px-2 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                searching || !query.trim()
                  ? 'cursor-not-allowed bg-surface-tertiary text-text-secondary'
                  : 'bg-primary text-primary-foreground hover:opacity-90',
              )}
            >
              {searching ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Search className="size-3.5" aria-hidden="true" />}
              Buscar
            </button>
          </form>

          {searchProvider && (
            <p className="text-[10px] text-text-secondary">
              Proveedor: {searchProvider} · {searchTotal} resultados{' '}
              {searchQueries.length > 1 && `(${searchQueries.length} consultas combinadas)`}
            </p>
          )}

          {searchResults.length === 0 && !searching ? (
            <p className="rounded-lg border border-dashed border-border-light p-3 text-xs text-text-secondary">
              Escribe una consulta para descubrir fuentes en la web. Los resultados incluyen un
              perfil de confiabilidad y autoridad por dominio — sin depender de una sola fuente.
            </p>
          ) : (
            <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
              {searchResults.map((r, i) => (
                <li
                  key={`${r.url}-${i}`}
                  className="flex flex-col gap-1 rounded-lg border border-border-light bg-surface-secondary p-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-text-primary hover:underline"
                    >
                      {r.title || r.url}
                    </a>
                    <ExternalLink className="mt-0.5 size-3 shrink-0 text-text-secondary" aria-hidden="true" />
                  </div>
                  {r.snippet && (
                    <p className="line-clamp-2 text-[11px] text-text-secondary">{r.snippet}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-text-secondary">
                      <Globe className="size-2.5" aria-hidden="true" />
                      {r.domain}
                    </span>
                    <span className="rounded-full bg-surface-tertiary px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-text-secondary">
                      {typeLabel(r.type)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-text-secondary">
                      Confiabilidad <ScoreBar value={r.reliability} />
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-text-secondary">
                      Autoridad <ScoreBar value={r.authority} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'verify' && (
        <div className="flex flex-col gap-2">
          <form
            className="flex flex-col gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void runVerify(claim);
            }}
          >
            <textarea
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              placeholder="Ej.: Ollama es un runtime local para ejecutar LLMs en tu equipo…"
              aria-label="Afirmación a verificar"
              rows={2}
              className="w-full resize-none rounded-lg border border-border-light bg-surface-secondary p-2 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <button
              type="submit"
              disabled={verifying || !claim.trim()}
              className={cn(
                'inline-flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                verifying || !claim.trim()
                  ? 'cursor-not-allowed bg-surface-tertiary text-text-secondary'
                  : 'bg-primary text-primary-foreground hover:opacity-90',
              )}
            >
              {verifying ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  Verificando…
                </>
              ) : (
                <>
                  <ShieldCheck className="size-3.5" aria-hidden="true" />
                  Verificar
                </>
              )}
            </button>
          </form>

          {verdict && verdictMeta && (
            <div className="flex flex-col gap-2">
              <div
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-2.5 py-2',
                  verdictMeta.cls,
                )}
              >
                <span className={cn('size-2 shrink-0 rounded-full', verdictMeta.dot)} aria-hidden="true" />
                <span className="text-xs font-semibold">{verdictMeta.label}</span>
                {typeof verdict.confidence === 'number' && (
                  <span className="font-mono text-[10px] opacity-80">
                    confianza {Math.round(verdict.confidence * 100)}%
                  </span>
                )}
              </div>
              <p className="text-[11px] text-text-secondary">{verdictMeta.hint}</p>

              {/* FASE 38 — síntesis del LLM local con fuentes citadas */}
              {typeof verdict.answer === 'string' && verdict.answer.length > 0 && (
                <div className="rounded-lg border border-border-light bg-surface-secondary p-2.5">
                  <p className="mb-1 flex items-center justify-between gap-2 text-xs text-text-secondary">
                    <span className="font-medium text-text-primary">Síntesis con fuentes</span>
                    <span className="font-mono text-[10px]">LLM local</span>
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-text-primary">{verdict.answer}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-text-secondary">
                <span>
                  Dominios que apoyan:{' '}
                  <strong className="text-text-primary">{verdict.independentSupportingSources}</strong>
                </span>
                <span>
                  Dominios que contradicen:{' '}
                  <strong className="text-text-primary">{verdict.independentContradictingSources}</strong>
                </span>
              </div>

              {verdict.domainBreakdown?.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                    Por dominio
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {verdict.domainBreakdown.map((d: any) => (
                      <span
                        key={d.domain}
                        className="rounded-full bg-surface-tertiary px-2 py-0.5 font-mono text-[10px] text-text-secondary"
                        title={`apoya ${d.supporting} · contradice ${d.contradicting} · neutral ${d.neutral}`}
                      >
                        {d.domain} · +{d.supporting}/−{d.contradicting}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {verdict.evidence?.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                    Evidencia ({verdict.evidence.length})
                  </p>
                  <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto pr-1">
                    {verdict.evidence.map((ev: any, i: number) => (
                      <li
                        key={`${ev.url}-${i}`}
                        className="flex items-start justify-between gap-2 rounded-md border border-border-light bg-surface-secondary p-1.5"
                      >
                        <a
                          href={ev.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="line-clamp-2 text-[11px] text-text-primary hover:underline"
                        >
                          {ev.title || ev.url}
                        </a>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] uppercase',
                            ev.stance === 'supporting'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : ev.stance === 'contradicting'
                                ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                                : 'bg-surface-tertiary text-text-secondary',
                          )}
                        >
                          {ev.stance === 'supporting' ? 'apoya' : ev.stance === 'contradicting' ? 'contradice' : 'neutral'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-[10px] text-text-secondary">{verdict.note}</p>
            </div>
          )}

          {!verdict && !verifying && (
            <p className="rounded-lg border border-dashed border-border-light p-3 text-xs text-text-secondary">
              Verifica una afirmación buscando evidencia en múltiples dominios independientes.
              Distingue <strong className="text-text-primary">relevancia</strong> de{' '}
              <strong className="text-text-primary">confiabilidad</strong>: un veredicto
              «Corroborado» requiere al menos dos dominios distintos apoyando la afirmación.
            </p>
          )}
        </div>
      )}

      {tab === 'sources' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-text-primary">
              Source Catalog
              {sources.length > 0 && (
                <span className="ml-1 font-normal text-text-secondary">({sources.length} perfiles)</span>
              )}
            </p>
            <button
              type="button"
              onClick={() => void loadSources()}
              disabled={loadingSources}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <RefreshCw className={cn('size-3', loadingSources && 'animate-spin')} aria-hidden="true" />
              Actualizar
            </button>
          </div>
          {loadingSources ? (
            <div className="flex items-center gap-2 p-3 text-sm text-text-secondary" role="status">
              <Spinner className="size-4" aria-hidden="true" />
              {localize('com_ui_loading')}
            </div>
          ) : sources.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border-light p-3 text-xs text-text-secondary">
              El catálogo de fuentes se genera con perfiles curados + derivación automática por
              dominio (.gov, .edu, .org…). Los dominios fuera del catálogo reciben un perfil
              neutral, nunca un veredicto automático.
            </p>
          ) : (
            <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
              {sources.map((s) => (
                <li
                  key={s.domain}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border-light bg-surface-secondary px-2 py-1.5"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-mono text-[11px] text-text-primary">{s.domain}</span>
                    <span className="shrink-0 rounded-full bg-surface-tertiary px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-text-secondary">
                      {typeLabel(s.type)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] text-text-secondary">
                      Conf <ScoreBar value={s.reliability} />
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-text-secondary">
                      Aut <ScoreBar value={s.authority} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-text-secondary">
            La confiabilidad alimenta la corroboración pero no la sustituye: una fuente puede ser
            oficial y estar incompleta, o ser una fan wiki y contener un dato bien documentado.
          </p>
        </div>
      )}
    </div>
  );
}
