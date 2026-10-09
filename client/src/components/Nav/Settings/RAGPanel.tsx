import React, { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@librechat/client';
import { getTokenHeader } from 'librechat-data-provider';
import {
  BookMarked,
  CircleAlert,
  Database,
  FilePlus2,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * RAGPanel — Base de conocimiento (RAG) (FASE 37).
 *
 * Expone en Configuración → IA el servicio RAG del backend (/api/rag):
 * colecciones, indexado de documentos, búsqueda semántica y enriquecimiento
 * de contexto. El backend usa embeddings locales (TF-IDF, sin claves) y un
 * vector store en memoria/Redis — cero dependencias externas.
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

type TabId = 'collections' | 'add' | 'search';

interface CollectionInfo {
  name: string;
  documentCount: number;
}

interface SearchHit {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  score: number;
}

const authHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${getToken() ?? ''}`,
});

export default function RAGPanel() {
  const localize = useLocalize();
  const [tab, setTab] = useState<TabId>('collections');

  // Estado del servicio
  const [stats, setStats] = useState<{
    totalDocuments?: number;
    collections?: number;
    vectorStore?: string;
    embeddingProvider?: string;
  } | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [serviceError, setServiceError] = useState<string | null>(null);

  // Colecciones
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [collectionStats, setCollectionStats] = useState<{
    collection: string;
    documentCount: number;
    totalTokens: number;
  } | null>(null);

  // Formulario de indexado
  const [docCollection, setDocCollection] = useState('');
  const [docId, setDocId] = useState('');
  const [docContent, setDocContent] = useState('');
  const [indexing, setIndexing] = useState(false);
  const [indexResult, setIndexResult] = useState<string | null>(null);

  // Búsqueda
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCollection, setSearchCollection] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);

  const [error, setError] = useState<string | null>(null);

  const loadCollections = useCallback(async () => {
    setLoadingCollections(true);
    setError(null);
    try {
      const res = await fetch('/api/rag/collections', { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || `HTTP ${res.status}`);
        return;
      }
      setCollections(Array.isArray(json.collections) ? json.collections : []);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setLoadingCollections(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    setServiceError(null);
    try {
      const res = await fetch('/api/rag/health', { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok) {
        setServiceError(json?.error || `HTTP ${res.status}`);
        setStats(null);
        return;
      }
      setStats({
        totalDocuments: json.totalDocuments,
        collections: json.collections,
        vectorStore: json.vectorStore,
        embeddingProvider: json.embeddingProvider,
      });
    } catch (e) {
      setServiceError(String((e as Error)?.message || e));
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
    void loadCollections();
  }, [loadStats, loadCollections]);

  const handleIndex = async () => {
    if (!docCollection.trim() || !docId.trim() || !docContent.trim()) {
      setError('Colección, ID y contenido son obligatorios.');
      return;
    }
    setIndexing(true);
    setError(null);
    setIndexResult(null);
    try {
      const res = await fetch('/api/rag/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          collection: docCollection.trim(),
          id: docId.trim(),
          content: docContent,
          metadata: { source: 'dashboard' },
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.success === false) {
        setError(json?.error || `HTTP ${res.status}`);
        return;
      }
      setIndexResult(
        `Documento indexado en «${docCollection.trim()}»${json.indexed ? '' : ' (duplicado omitido)'}.`,
      );
      setDocContent('');
      setDocId('');
      await loadCollections();
      await loadStats();
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setIndexing(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: searchQuery.trim(), topK: '5' });
      if (searchCollection.trim()) {
        params.set('collection', searchCollection.trim());
      }
      const res = await fetch(`/api/rag/search?${params.toString()}`, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || `HTTP ${res.status}`);
        setSearchResults([]);
        return;
      }
      setSearchResults(Array.isArray(json.results) ? json.results : []);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setSearching(false);
    }
  };

  const handleDeleteCollection = async (name: string) => {
    if (!window.confirm(`¿Eliminar la colección «${name}» y todos sus documentos?`)) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/rag/collections/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!res.ok || json?.success === false) {
        setError(json?.error || `HTTP ${res.status}`);
        return;
      }
      setCollectionStats(null);
      await loadCollections();
      await loadStats();
    } catch (e) {
      setError(String((e as Error)?.message || e));
    }
  };

  const handleCollectionClick = async (name: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/rag/collections/${encodeURIComponent(name)}`, {
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || `HTTP ${res.status}`);
        return;
      }
      setCollectionStats({
        collection: json.collection,
        documentCount: json.documentCount,
        totalTokens: json.totalTokens,
      });
    } catch (e) {
      setError(String((e as Error)?.message || e));
    }
  };

  const tabs: { id: TabId; label: string; icon: typeof Database }[] = [
    { id: 'collections', label: 'Colecciones', icon: FolderOpen },
    { id: 'add', label: 'Indexar documento', icon: FilePlus2 },
    { id: 'search', label: 'Buscar', icon: Search },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Estado del servicio */}
      <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-tertiary/60 p-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
          <BookMarked className="size-3.5" aria-hidden="true" />
          Base de conocimiento (RAG)
        </p>
        <button
          type="button"
          onClick={() => {
            void loadStats();
            void loadCollections();
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <RefreshCw className="size-3" aria-hidden="true" />
          Actualizar
        </button>
      </div>

      {loadingStats ? (
        <div className="flex items-center gap-2 p-2 text-sm text-text-secondary" role="status">
          <Spinner className="size-4" aria-hidden="true" />
          {localize('com_ui_loading')}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-surface-tertiary px-2.5 py-1 text-[11px] text-text-primary">
            📄 {stats?.totalDocuments ?? 0} documentos
          </span>
          <span className="rounded-full bg-surface-tertiary px-2.5 py-1 text-[11px] text-text-primary">
            🗂 {stats?.collections ?? 0} colecciones
          </span>
          <span className="rounded-full bg-surface-tertiary px-2.5 py-1 text-[11px] text-text-secondary">
            vectores: {stats?.vectorStore ?? 'memory'}
          </span>
          <span className="rounded-full bg-surface-tertiary px-2.5 py-1 text-[11px] text-text-secondary">
            embeddings: {stats?.embeddingProvider ?? 'local'} (sin claves)
          </span>
        </div>
      )}

      {serviceError && (
        <p className="flex items-start gap-1.5 rounded-md border border-border-light bg-surface-tertiary/60 p-2 text-xs text-red-600 dark:text-red-400">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {serviceError}
        </p>
      )}

      {/* Pestañas */}
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Base de conocimiento">
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

      {tab === 'collections' && (
        <div className="flex flex-col gap-2">
          {collectionStats && (
            <div className="rounded-lg border border-border-light bg-surface-secondary p-2.5">
              <p className="text-xs font-medium text-text-primary">
                📊 Estadísticas · {collectionStats.collection}
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-[10px] text-text-secondary">
                  {collectionStats.documentCount} documentos
                </span>
                <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-[10px] text-text-secondary">
                  ~{collectionStats.totalTokens} tokens estimados
                </span>
              </div>
            </div>
          )}
          {loadingCollections ? (
            <div className="flex items-center gap-2 p-2 text-sm text-text-secondary" role="status">
              <Spinner className="size-4" aria-hidden="true" />
              {localize('com_ui_loading')}
            </div>
          ) : collections.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border-light p-3 text-xs text-text-secondary">
              No hay colecciones todavía. Ve a «Indexar documento» para crear la primera base de
              conocimiento.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {collections.map((c) => (
                <li
                  key={c.name}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border-light bg-surface-secondary px-2 py-1.5"
                >
                  <button
                    type="button"
                    onClick={() => void handleCollectionClick(c.name)}
                    className="flex min-w-0 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    title="Ver estadísticas"
                  >
                    <Database className="size-3.5 shrink-0 text-text-secondary" aria-hidden="true" />
                    <span className="truncate font-mono text-[11px] text-text-primary">
                      {c.name}
                    </span>
                    <span className="shrink-0 rounded-full bg-surface-tertiary px-1.5 py-0.5 text-[9px] text-text-secondary">
                      {c.documentCount} docs
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteCollection(c.name)}
                    aria-label={`Eliminar colección ${c.name}`}
                    title="Eliminar colección"
                    className="rounded-md p-1 text-text-tertiary transition-colors hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-text-secondary">
            La búsqueda semántica usa embeddings reales locales (nomic-embed-text vía Ollama) sin
            enviar datos a ningún servidor externo.
          </p>
        </div>
      )}

      {tab === 'add' && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-primary" htmlFor="rag-collection">
              Colección
            </label>
            <input
              id="rag-collection"
              value={docCollection}
              onChange={(e) => setDocCollection(e.target.value)}
              placeholder="ej.: manual-usuario"
              className="h-8 w-full rounded-md border border-border-light bg-surface-secondary px-2 font-mono text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-primary" htmlFor="rag-doc-id">
              ID del documento
            </label>
            <input
              id="rag-doc-id"
              value={docId}
              onChange={(e) => setDocId(e.target.value)}
              placeholder="ej.: doc-01"
              className="h-8 w-full rounded-md border border-border-light bg-surface-secondary px-2 font-mono text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-primary" htmlFor="rag-content">
              Contenido
            </label>
            <textarea
              id="rag-content"
              value={docContent}
              onChange={(e) => setDocContent(e.target.value)}
              placeholder="El texto que el LLM podrá recuperar como contexto…"
              rows={5}
              className="w-full resize-none rounded-lg border border-border-light bg-surface-secondary p-2 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          {indexResult && (
            <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              ✓ {indexResult}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleIndex()}
            disabled={indexing}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              indexing
                ? 'cursor-not-allowed bg-surface-tertiary text-text-secondary'
                : 'bg-primary text-primary-foreground hover:opacity-90',
            )}
          >
            {indexing ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Indexando…
              </>
            ) : (
              <>
                <Sparkles className="size-4" aria-hidden="true" />
                Indexar documento
              </>
            )}
          </button>
          <p className="text-[10px] text-text-secondary">
            El documento queda disponible para búsqueda semántica y enriquecimiento de contexto en
            las conversaciones.
          </p>
        </div>
      )}

      {tab === 'search' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en tus documentos…"
              aria-label="Consulta de búsqueda semántica"
              className="h-9 w-full rounded-md border border-border-light bg-surface-secondary px-2 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <button
              type="button"
              onClick={() => void handleSearch()}
              disabled={searching || !searchQuery.trim()}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                searching || !searchQuery.trim()
                  ? 'cursor-not-allowed bg-surface-tertiary text-text-secondary'
                  : 'bg-primary text-primary-foreground hover:opacity-90',
              )}
            >
              {searching ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="size-3.5" aria-hidden="true" />
              )}
              Buscar
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="shrink-0 text-[11px] text-text-secondary" htmlFor="rag-search-col">
              Colección (opcional):
            </label>
            <input
              id="rag-search-col"
              value={searchCollection}
              onChange={(e) => setSearchCollection(e.target.value)}
              placeholder="todas"
              className="h-7 w-full rounded-md border border-border-light bg-surface-secondary px-2 font-mono text-[11px] text-text-primary placeholder:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          {searchResults.length === 0 && !searching ? (
            <p className="rounded-lg border border-dashed border-border-light p-3 text-xs text-text-secondary">
              Escribe una consulta para recuperar los fragmentos más relevantes de tus documentos.
            </p>
          ) : (
            <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
              {searchResults.map((r, i) => (
                <li
                  key={`${r.id}-${i}`}
                  className="flex flex-col gap-1 rounded-lg border border-border-light bg-surface-secondary p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px] text-text-primary">{r.id}</span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium',
                        r.score >= 0.5
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : r.score >= 0.3
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-surface-tertiary text-text-secondary',
                      )}
                    >
                      {Math.round(r.score * 100)}% relevante
                    </span>
                  </div>
                  <p className="line-clamp-3 text-[11px] text-text-secondary">{r.content}</p>
                  {r.metadata && Object.keys(r.metadata).length > 0 && (
                    <p className="truncate font-mono text-[9px] text-text-tertiary">
                      {JSON.stringify(r.metadata)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-text-secondary">
            Los resultados muestran similitud semántica estimada. El enriquecimiento de contexto
            (GET /api/rag/enrich) puede inyectar estos fragmentos en el prompt del LLM.
          </p>
        </div>
      )}
    </div>
  );
}
