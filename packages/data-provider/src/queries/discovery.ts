/**
 * Discovery React Queries
 * =======================
 * Hooks de React Query para el sistema de búsqueda universal
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as discoveryService from '../discovery-service';
import type {
  DiscoverySearchRequest,
  DiscoveryFeaturedItem,
  DiscoveryCategory,
  DiscoveryAgent,
  DiscoverySearchResult,
} from '../types/discovery';

/** Query key factory for Discovery */
export const discoveryKeys = {
  all: ['discovery'] as const,
  search: (query: string, sources?: string[]) => 
    [...discoveryKeys.all, 'search', { query, sources }] as const,
  featured: () => [...discoveryKeys.all, 'featured'] as const,
  categories: () => [...discoveryKeys.all, 'categories'] as const,
  agents: () => [...discoveryKeys.all, 'agents'] as const,
  plugin: (source: string, id: string) => 
    [...discoveryKeys.all, 'plugin', source, id] as const,
};

/**
 * Hook para búsqueda universal
 */
export function useDiscoverySearch(request: DiscoverySearchRequest) {
  return useQuery({
    queryKey: discoveryKeys.search(request.query, request.sources),
    queryFn: () => discoveryService.search(request),
    enabled: request.query.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook para plugins destacados
 */
export function useDiscoveryFeatured() {
  return useQuery({
    queryKey: discoveryKeys.featured(),
    queryFn: discoveryService.getFeatured,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook para categorías
 */
export function useDiscoveryCategories() {
  return useQuery({
    queryKey: discoveryKeys.categories(),
    queryFn: discoveryService.getCategories,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Hook para agentes compatibles
 */
export function useDiscoveryAgents() {
  return useQuery({
    queryKey: discoveryKeys.agents(),
    queryFn: discoveryService.getAgents,
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Hook para detalles de plugin
 */
export function useDiscoveryPlugin(source: string, pluginId: string) {
  return useQuery({
    queryKey: discoveryKeys.plugin(source, pluginId),
    queryFn: () => discoveryService.getPluginDetails(source, pluginId),
    enabled: !!source && !!pluginId,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook para búsqueda en fuente específica
 */
export function useDiscoverySearchInSource(source: string, query: string, limit = 10) {
  return useQuery({
    queryKey: [...discoveryKeys.all, 'source', source, query],
    queryFn: () => discoveryService.searchInSource(source, query, limit),
    enabled: query.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook para búsqueda rápida en GitHub
 */
export function useDiscoveryGitHub(query: string, limit = 10) {
  return useQuery({
    queryKey: [...discoveryKeys.all, 'github', query],
    queryFn: () => discoveryService.searchGitHubSkills(query, limit),
    enabled: query.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook para búsqueda rápida en HuggingFace
 */
export function useDiscoveryHuggingFace(query: string, limit = 10) {
  return useQuery({
    queryKey: [...discoveryKeys.all, 'huggingface', query],
    queryFn: () => discoveryService.searchHuggingFace(query, limit),
    enabled: query.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook para búsqueda de servidores MCP
 */
export function useDiscoveryMCPServers(query: string, limit = 10) {
  return useQuery({
    queryKey: [...discoveryKeys.all, 'mcp', query],
    queryFn: () => discoveryService.searchMCPServers(query, limit),
    enabled: query.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
