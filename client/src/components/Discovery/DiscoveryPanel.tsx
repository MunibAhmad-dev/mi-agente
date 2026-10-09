/**
 * Discovery Panel
 * ===============
 * Panel de búsqueda universal para plugins, skills y herramientas
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDiscovery } from './useDiscovery';
import type { DiscoverySearchResult, DiscoverySource } from './types';

// Íconos para fuentes
const SOURCE_ICONS: Record<DiscoverySource, string> = {
  github: '🐙',
  huggingface: '🤗',
  mcp: '🔌',
  npm: '📦',
  pypi: '🐍',
};

// Íconos para tipos
const TYPE_ICONS: Record<string, string> = {
  skill: '⭐',
  plugin: '🔌',
  tool: '🛠️',
  dataset: '📊',
  model: '🧠',
  agent: '🤖',
};

interface DiscoveryPanelProps {
  onPluginSelect?: (plugin: DiscoverySearchResult) => void;
  onClose?: () => void;
  initialQuery?: string;
}

export function DiscoveryPanel({ 
  onPluginSelect, 
  onClose,
  initialQuery = '',
}: DiscoveryPanelProps) {
  const { t } = useTranslation();
  const {
    query,
    sources,
    selectedAgents,
    view,
    selectedCategory,
    results,
    featured,
    categories,
    agents,
    isLoading,
    isSearching,
    search,
    searchImmediate,
    toggleSource,
    selectCategory,
    selectPlugin,
    showAllFeatured,
    showSearch,
    showAgents,
    clearSearch,
    setView,
  } = useDiscovery({ 
    initialQuery,
    onPluginSelect,
  });

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {t('discovery_title', 'Plugin Discovery')}
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label={(t as (k: string, d?: string) => string)('close', 'Close')}
          >
            <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="p-4">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => search(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                searchImmediate(query);
              }
            }}
            placeholder={t('discovery_search_placeholder', 'Search plugins, skills, tools...')}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 pr-10 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
          {query && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Source Filters */}
        <div className="mt-3 flex flex-wrap gap-2">
          {(['github', 'huggingface', 'mcp', 'npm', 'pypi'] as DiscoverySource[]).map((source) => (
            <button
              key={source}
              onClick={() => toggleSource(source)}
              className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm transition-colors ${
                sources.includes(source)
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
              }`}
            >
              <span>{SOURCE_ICONS[source]}</span>
              <span className="capitalize">{source === 'huggingface' ? 'HuggingFace' : source}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 px-4 dark:border-gray-700">
        <button
          onClick={showAllFeatured}
          className={`px-4 py-2 text-sm font-medium ${
            view === 'featured' && !selectedCategory
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          ⭐ {t('discovery_featured', 'Featured')}
        </button>
        <button
          onClick={() => setView('search')}
          className={`px-4 py-2 text-sm font-medium ${
            view === 'search'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🔍 {t('discovery_search', 'Search')}
        </button>
        <button
          onClick={showAgents}
          className={`px-4 py-2 text-sm font-medium ${
            view === 'agents'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🤖 {t('discovery_agents', 'Agents')}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Categories (when viewing featured) */}
        {view === 'featured' && !selectedCategory && (
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-medium text-gray-500">
              {t('discovery_categories', 'Categories')}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => selectCategory(category.id)}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                >
                  <span className="text-xl">{category.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {category.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {category.count} {t('discovery_plugins', 'plugins')}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Selected Category */}
        {view === 'featured' && selectedCategory && (
          <div className="mb-4">
            <button
              onClick={showAllFeatured}
              className="mb-2 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
            >
              ← {t('discovery_back', 'Back to categories')}
            </button>
            <h3 className="text-sm font-medium text-gray-500">
              {categories.find(c => c.id === selectedCategory)?.name}
            </h3>
          </div>
        )}

        {/* Agents View */}
        {view === 'agents' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
              >
                <span className="text-2xl">{agent.icon}</span>
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {agent.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {agent.supportedTypes.join(', ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Search Results or Featured */}
        {(view === 'search' || view === 'featured' || selectedCategory) && (
          <>
            {isLoading || isSearching ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
              </div>
            ) : results.length === 0 ? (
              <div className="py-8 text-center text-gray-500">
                {t('discovery_no_results', 'No results found')}
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((result) => (
                  <PluginCard
                    key={result.id}
                    plugin={result}
                    onClick={() => selectPlugin(result)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-4 py-2 text-center text-xs text-gray-500 dark:border-gray-700">
        {t('discovery_powered_by', 'Powered by GitHub, HuggingFace, MCP & more')}
      </div>
    </div>
  );
}

// Plugin Card Component
interface PluginCardProps {
  plugin: DiscoverySearchResult;
  onClick: () => void;
}

function PluginCard({ plugin, onClick }: PluginCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-gray-200 p-4 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-xl dark:bg-gray-600">
          {TYPE_ICONS[plugin.type] || '📦'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-gray-900 dark:text-white">
              {plugin.name}
            </span>
            <span className="flex-shrink-0 text-xs">
              {SOURCE_ICONS[plugin.source as DiscoverySource]}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-gray-500">
            {plugin.description}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {plugin.stars && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                ⭐ {formatNumber(plugin.stars)}
              </span>
            )}
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-600 dark:text-gray-300">
              {plugin.type}
            </span>
            {plugin.installationCommand && (
              <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">
                {plugin.installationCommand.split(' ').slice(0, 2).join(' ')}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

export default DiscoveryPanel;
