/**
 * Discovery Search Panel
 * ======================
 * 
 * Panel de búsqueda universal para plugins, skills y herramientas.
 * Integración con el chat input.
 * 
 * Autor: Mi LibreChat
 * Version: 1.0.0
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Search, X, ExternalLink, Star, GitFork, Download, Filter, Loader2 } from 'lucide-react';
import { useDiscoverySearch, useDiscoveryFeatured } from '@librechat/data-provider';
import type { DiscoverySearchResult, DiscoverySource, PluginType } from '@librechat/data-provider';

// ============================================================================
// TYPES
// ============================================================================

interface DiscoverySearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (result: DiscoverySearchResult) => void;
}

interface SourceFilter {
  id: DiscoverySource;
  label: string;
  icon: string;
  enabled: boolean;
}

interface TypeFilter {
  id: PluginType;
  label: string;
  enabled: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SOURCES: SourceFilter[] = [
  { id: 'github', label: 'GitHub', icon: '🐙', enabled: true },
  { id: 'huggingface', label: 'HuggingFace', icon: '🤗', enabled: true },
  { id: 'mcp', label: 'MCP Servers', icon: '🔌', enabled: true },
  { id: 'npm', label: 'NPM', icon: '📦', enabled: false },
  { id: 'pypi', label: 'PyPI', icon: '🐍', enabled: false },
];

const TYPES: TypeFilter[] = [
  { id: 'skill', label: 'Skills', enabled: true },
  { id: 'plugin', label: 'Plugins', enabled: true },
  { id: 'tool', label: 'Tools', enabled: true },
  { id: 'dataset', label: 'Datasets', enabled: false },
  { id: 'model', label: 'Models', enabled: false },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function DiscoverySearchPanel({
  isOpen,
  onClose,
  onSelect,
}: DiscoverySearchPanelProps) {
  // State
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sources, setSources] = useState<SourceFilter[]>(SOURCES);
  const [types, setTypes] = useState<TypeFilter[]>(TYPES);
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Build request object
  const enabledSources = sources.filter(s => s.enabled).map(s => s.id);
  const enabledTypes = types.filter(t => t.enabled).map(t => t.id);

  // React Query hooks
  const { data: searchData, isLoading: isSearching, error: searchError } = useDiscoverySearch({
    query: debouncedQuery,
    sources: enabledSources.length > 0 ? enabledSources : undefined,
  });

  const { data: featuredData, isLoading: isLoadingFeatured } = useDiscoveryFeatured();

  // Filter results by type
  const filteredResults = searchData?.results?.filter(
    result => enabledTypes.length === 0 || enabledTypes.includes(result.type)
  ) ?? [];

  // Toggle handlers
  const toggleSource = useCallback((id: DiscoverySource) => {
    setSources(prev => prev.map(s => 
      s.id === id ? { ...s, enabled: !s.enabled } : s
    ));
  }, []);

  const toggleType = useCallback((id: PluginType) => {
    setTypes(prev => prev.map(t => 
      t.id === id ? { ...t, enabled: !t.enabled } : t
    ));
  }, []);

  // Handle select
  const handleSelect = useCallback((result: DiscoverySearchResult) => {
    onSelect(result);
    setQuery('');
    onClose();
  }, [onSelect, onClose]);

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div 
      className="absolute bottom-full left-0 mb-2 w-[480px] max-h-[600px] 
                 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700
                 overflow-hidden z-50 animate-slide-up"
      style={{ animation: 'slideUp 0.2s ease-out' }}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-500" />
            Discovery
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar plugins, skills, herramientas..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700
                       bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white
                       placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500
                       transition-shadow"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
          )}
        </div>

        {/* Filter Toggle */}
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm transition-colors ${
              showFilters 
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Filtros
          </button>
          
          {debouncedQuery && (
            <span className="text-xs text-gray-500">
              {filteredResults.length} resultados
            </span>
          )}
        </div>

        {/* Source Filters */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {sources.map((source) => (
                <button
                  key={source.id}
                  onClick={() => toggleSource(source.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    source.enabled
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500 border border-transparent'
                  }`}
                >
                  <span className="mr-1">{source.icon}</span>
                  {source.label}
                </button>
              ))}
            </div>
            
            {/* Type Filters */}
            <div className="flex flex-wrap gap-1.5">
              {types.map((type) => (
                <button
                  key={type.id}
                  onClick={() => toggleType(type.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    type.enabled
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500 border border-transparent'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="overflow-y-auto max-h-[400px] p-2">
        {/* Loading */}
        {isSearching && isLoadingFeatured && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            <span className="ml-2 text-sm text-gray-500">Buscando...</span>
          </div>
        )}

        {/* Error */}
        {searchError != null && (
          <div className="p-4 text-center">
            <p className="text-sm text-red-500">Error al buscar. Intenta de nuevo.</p>
          </div>
        )}

        {/* Search Results */}
        {debouncedQuery && filteredResults.length > 0 && (
          <div className="space-y-1">
            <p className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400">
              Resultados para "{debouncedQuery}"
            </p>
            {filteredResults.slice(0, 10).map((result, index) => (
              <DiscoveryResultItem
                key={`${result.source}-${result.id}-${index}`}
                result={result}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}

        {/* No Results */}
        {debouncedQuery && filteredResults.length === 0 && !isSearching && (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">
              No se encontraron resultados para "{debouncedQuery}"
            </p>
          </div>
        )}

        {/* Featured (when no search) */}
        {!debouncedQuery && featuredData && (
          <div className="space-y-1">
            <p className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400">
              ⭐ Destacados
            </p>
            {featuredData.slice(0, 8).map((item, index) => (
              <FeaturedItem
                key={`featured-${index}`}
                item={item}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!debouncedQuery && !featuredData && !isLoadingFeatured && (
          <div className="text-center py-8">
            <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Busca plugins, skills y herramientas
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Búsqueda en {sources.filter(s => s.enabled).length} fuentes • Compatible con Claude Code, Cursor, Windsurf y más
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface DiscoveryResultItemProps {
  result: DiscoverySearchResult;
  onSelect: (result: DiscoverySearchResult) => void;
}

function DiscoveryResultItem({ result, onSelect }: DiscoveryResultItemProps) {
  return (
    <button
      onClick={() => onSelect(result)}
      className="w-full p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-gray-900 dark:text-white truncate">
              {result.name}
            </span>
            <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px] text-gray-500 uppercase">
              {result.source}
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
            {result.description}
          </p>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {result.stars && (
              <span className="flex items-center gap-0.5">
                <Star className="w-3 h-3 text-yellow-500" />
                {result.stars.toLocaleString()}
              </span>
            )}
            <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
              {result.type}
            </span>
            {result.compatibleAgents?.slice(0, 2).map(agent => (
              <span key={agent} className="text-blue-600 dark:text-blue-400">{agent}</span>
            ))}
          </div>
        </div>
        <ExternalLink className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      </div>
    </button>
  );
}

interface FeaturedItemProps {
  item: {
    id: string;
    name: string;
    description: string;
    source: DiscoverySource;
    type: PluginType;
    url: string;
    stars: number;
    category: string;
    icon: string;
  };
  onSelect: (result: DiscoverySearchResult) => void;
}

function FeaturedItem({ item, onSelect }: FeaturedItemProps) {
  const result: DiscoverySearchResult = {
    id: item.id,
    name: item.name,
    description: item.description,
    source: item.source,
    type: item.type,
    url: item.url,
    stars: item.stars,
    tags: [item.category],
    compatibleAgents: ['claude_code', 'cursor', 'windsurf'],
    score: 1,
  };

  return (
    <button
      onClick={() => onSelect(result)}
      className="w-full p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left group"
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{item.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white truncate">
              {item.name}
            </span>
            <span className="flex items-center gap-0.5 text-xs text-gray-500">
              <Star className="w-3 h-3 text-yellow-500" />
              {item.stars.toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
            {item.description}
          </p>
        </div>
        <ExternalLink className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  );
}

export default DiscoverySearchPanel;
