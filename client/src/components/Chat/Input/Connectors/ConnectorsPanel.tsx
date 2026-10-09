import React, { memo, useMemo, useState, useEffect } from 'react';
import * as Ariakit from '@ariakit/react';
import { Github, Search, LogIn, LogOut, Loader2, Check, X } from 'lucide-react';
import type { TConnectorProvider, TConnectorSearchResult } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import {
  useConnectorsQuery,
  useConnectorSearchQuery,
  useDisconnectConnectorMutation,
  startConnectorLogin,
} from '~/data-provider/Connectors';
import { cn } from '~/utils';

/** Ícono simple para Hugging Face (evitamos usar el emoji/logo con marca registrada). */
function HFIcon({ className }: { className?: string }) {
  return <span className={cn('font-bold', className)}>HF</span>;
}

const TABS: { key: TConnectorProvider; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'github', label: 'GitHub', Icon: Github },
  { key: 'huggingface', label: 'Hugging Face', Icon: HFIcon },
];

type ConnectorsPanelProps = {
  /** Se llama cuando el usuario elige un repo/modelo/dataset/space para usarlo en el chat. */
  onSelect: (item: TConnectorSearchResult, provider: TConnectorProvider) => void;
};

function ConnectorsPanel({ onSelect }: ConnectorsPanelProps) {
  const localize = useLocalize();
  const [activeTab, setActiveTab] = useState<TConnectorProvider>('github');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce de 300ms para la búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: connectors, isLoading: loadingStatus } = useConnectorsQuery();
  const disconnectMutation = useDisconnectConnectorMutation();

  const status = useMemo(
    () => connectors?.find((c) => c.provider === activeTab),
    [connectors, activeTab],
  );

  const {
    data: searchData,
    isFetching: isSearching,
    isError: searchError,
  } = useConnectorSearchQuery(activeTab, debouncedQuery, {
    enabled: activeTab === 'huggingface' || !!status?.connected,
  });

  const results = searchData?.results ?? [];
  const needsLogin = activeTab === 'github' && !loadingStatus && !status?.connected;

  return (
    <div className="flex w-80 flex-col gap-3 p-1">
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-surface-secondary p-1">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors',
              activeTab === key
                ? 'bg-surface-primary text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            {/* Indicador de conexión */}
            {connectors?.find((c) => c.provider === key)?.connected && (
              <span className="ml-1 flex h-2 w-2">
                <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Estado de conexión */}
      {status?.connected && (
        <div className="flex items-center justify-between rounded-md bg-surface-secondary px-2 py-1.5 text-xs text-text-secondary">
          <span className="flex items-center gap-1.5">
            <Check className="h-3 w-3 text-green-500" />
            {localize('com_ui_connected_as') ?? 'Conectado como'}{' '}
            <strong className="text-text-primary">{status.meta?.username}</strong>
          </span>
          <button
            type="button"
            onClick={() => disconnectMutation.mutate(activeTab)}
            disabled={disconnectMutation.isLoading}
            className="flex items-center gap-1 text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
          >
            {disconnectMutation.isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <LogOut className="h-3 w-3" />
                {localize('com_ui_disconnect') ?? 'Desconectar'}
              </>
            )}
          </button>
        </div>
      )}

      {/* Login o búsqueda */}
      {needsLogin ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => startConnectorLogin(activeTab)}
            className="flex items-center justify-center gap-2 rounded-md border border-border-medium bg-surface-primary px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-hover"
          >
            <LogIn className="h-4 w-4" />
            {localize('com_ui_connect_account', { 0: TABS.find((t) => t.key === activeTab)?.label }) ??
              `Conectar cuenta de ${TABS.find((t) => t.key === activeTab)?.label}`}
          </button>
          <p className="text-center text-[10px] text-text-secondary">
            {activeTab === 'github'
              ? (localize('com_ui_github_login_help') ?? 'Se abrirá GitHub para autorizar el acceso')
              : (localize('com_ui_hf_login_help') ?? 'Se abrirá Hugging Face para autorizar el acceso')}
          </p>
        </div>
      ) : (
        <>
          {/* Campo de búsqueda */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                activeTab === 'github'
                  ? (localize('com_ui_search_your_repos') ?? 'Buscar en tus repos…')
                  : (localize('com_ui_search_hf') ?? 'Buscar modelos, datasets, spaces…')
              }
              className="w-full rounded-md border border-border-medium bg-surface-primary py-1.5 pl-8 pr-2 text-sm focus:outline-none focus:ring-1 focus:ring-border-heavy"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Resultados */}
          <div className="max-h-64 overflow-y-auto">
            {isSearching && (
              <div className="flex items-center justify-center py-4 text-text-secondary">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="ml-2 text-xs">{localize('com_ui_searching') ?? 'Buscando…'}</span>
              </div>
            )}
            {!isSearching && searchError && (
              <div className="py-2 text-center">
                <p className="text-xs text-red-500">
                  {localize('com_ui_error') ?? 'Ocurrió un error al buscar.'}
                </p>
              </div>
            )}
            {!isSearching && !searchError && results.length === 0 && query && (
              <p className="py-2 text-center text-xs text-text-secondary">
                {localize('com_ui_no_results') ?? 'Sin resultados.'}
              </p>
            )}
            {!isSearching && !searchError && results.length === 0 && !query && (
              <p className="py-2 text-center text-xs text-text-secondary italic">
                {activeTab === 'github'
                  ? (localize('com_ui_github_start_search') ?? 'Escribe para buscar tus repos')
                  : (localize('com_ui_hf_start_search') ?? 'Escribe para buscar modelos, datasets o spaces')}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item, activeTab)}
                    className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-hover"
                  >
                    <span className="flex w-full items-center justify-between font-medium text-text-primary">
                      <span className="truncate">{item.name}</span>
                      {item.type && (
                        <span className="ml-2 shrink-0 rounded bg-surface-tertiary px-1.5 py-0.5 text-[10px] uppercase text-text-secondary">
                          {item.type}
                        </span>
                      )}
                    </span>
                    {item.description && (
                      <span className="line-clamp-1 text-xs text-text-secondary">
                        {item.description}
                      </span>
                    )}
                    {/* Metadatos adicionales */}
                    <span className="flex gap-2 text-[10px] text-text-tertiary">
                      {item.stars !== undefined && <span>⭐ {item.stars}</span>}
                      {item.likes !== undefined && <span>❤️ {item.likes}</span>}
                      {item.downloads !== undefined && <span>📥 {item.downloads}</span>}
                      {item.private && <span className="text-red-500">🔒 Private</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

export default memo(ConnectorsPanel);
