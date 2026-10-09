/**
 * Discovery Hook
 * ==============
 * Hook para gestionar el estado del sistema de Discovery
 */

import { useState, useCallback, useMemo } from 'react';
import {
  useDiscoverySearch,
  useDiscoveryFeatured,
  useDiscoveryCategories,
  useDiscoveryAgents,
} from '@librechat/data-provider';
import type {
  DiscoverySearchResult,
  DiscoveryFeaturedItem,
  DiscoveryCategory,
  DiscoveryAgent,
  DiscoverySource,
  DiscoveryView,
} from './types';

interface UseDiscoveryOptions {
  initialQuery?: string;
  initialSources?: DiscoverySource[];
  onPluginSelect?: (plugin: DiscoverySearchResult) => void;
}

export function useDiscovery({ 
  initialQuery = '', 
  initialSources = ['github', 'huggingface', 'mcp', 'npm', 'pypi'],
  onPluginSelect,
}: UseDiscoveryOptions = {}) {
  // Estado de búsqueda
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [sources, setSources] = useState<DiscoverySource[]>(initialSources);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [view, setView] = useState<DiscoveryView>('featured');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedPlugin, setSelectedPlugin] = useState<DiscoverySearchResult | undefined>();

  // React Query hooks
  const searchQuery = useDiscoverySearch({
    query: debouncedQuery,
    sources,
    agents: selectedAgents,
    limit: 20,
  });

  const featuredQuery = useDiscoveryFeatured();
  const categoriesQuery = useDiscoveryCategories();
  const agentsQuery = useDiscoveryAgents();

  // Computed values
  const isLoading = view === 'search' 
    ? searchQuery.isLoading 
    : view === 'featured' 
      ? featuredQuery.isLoading 
      : false;

  const results: DiscoverySearchResult[] = useMemo(() => {
    if (view === 'search') {
      return searchQuery.data?.results ?? [];
    }
    if (view === 'featured') {
      return featuredQuery.data?.map(pluginToResult) ?? [];
    }
    if (view === 'categories' && selectedCategory) {
      return featuredQuery.data
        ?.filter(p => p.category === selectedCategory)
        .map(pluginToResult) ?? [];
    }
    return [];
  }, [view, searchQuery.data, featuredQuery.data, selectedCategory]);

  const featured: DiscoveryFeaturedItem[] = featuredQuery.data ?? [];
  const categories: DiscoveryCategory[] = categoriesQuery.data ?? [];
  const agents: DiscoveryAgent[] = agentsQuery.data ?? [];

  // Acciones
  const search = useCallback((newQuery: string) => {
    setQuery(newQuery);
    // Debounce
    setTimeout(() => setDebouncedQuery(newQuery), 300);
  }, []);

  const searchImmediate = useCallback((newQuery: string) => {
    setQuery(newQuery);
    setDebouncedQuery(newQuery);
    setView('search');
  }, []);

  const toggleSource = useCallback((source: DiscoverySource) => {
    setSources(prev => {
      if (prev.includes(source)) {
        return prev.filter(s => s !== source);
      }
      return [...prev, source];
    });
  }, []);

  const toggleAgent = useCallback((agentId: string) => {
    setSelectedAgents(prev => {
      if (prev.includes(agentId)) {
        return prev.filter(a => a !== agentId);
      }
      return [...prev, agentId];
    });
  }, []);

  const selectCategory = useCallback((categoryId: string | undefined) => {
    setSelectedCategory(categoryId);
    setView(categoryId ? 'categories' : 'featured');
  }, []);

  const selectPlugin = useCallback((plugin: DiscoverySearchResult) => {
    setSelectedPlugin(plugin);
    if (onPluginSelect) {
      onPluginSelect(plugin);
    }
  }, [onPluginSelect]);

  const showAllFeatured = useCallback(() => {
    setView('featured');
    setSelectedCategory(undefined);
  }, []);

  const showSearch = useCallback(() => {
    setView('search');
  }, []);

  const showAgents = useCallback(() => {
    setView('agents');
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setView('featured');
  }, []);

  return {
    // Estado
    query,
    sources,
    selectedAgents,
    view,
    selectedCategory,
    selectedPlugin,
    // Datos
    results,
    featured,
    categories,
    agents,
    // Loading states
    isLoading,
    isSearching: searchQuery.isFetching,
    // Errores
    searchError: searchQuery.error,
    featuredError: featuredQuery.error,
    // Stats
    totalFound: searchQuery.data?.totalFound ?? 0,
    queryTimeMs: searchQuery.data?.queryTimeMs ?? 0,
    sourcesSearched: searchQuery.data?.sourcesSearched ?? [],
    // Acciones
    search,
    searchImmediate,
    toggleSource,
    toggleAgent,
    selectCategory,
    selectPlugin,
    showAllFeatured,
    showSearch,
    showAgents,
    clearSearch,
    setView,
  };
}

function pluginToResult(plugin: DiscoveryFeaturedItem): DiscoverySearchResult {
  return {
    id: plugin.id,
    name: plugin.name,
    description: plugin.description,
    source: plugin.source as DiscoverySearchResult['source'],
    type: plugin.type as DiscoverySearchResult['type'],
    url: plugin.url,
    stars: plugin.stars,
    tags: [plugin.category],
    compatibleAgents: ['claude_code', 'cursor', 'windsurf', 'manus'],
    score: plugin.stars / 1000,
  };
}

export type UseDiscoveryReturn = ReturnType<typeof useDiscovery>;
