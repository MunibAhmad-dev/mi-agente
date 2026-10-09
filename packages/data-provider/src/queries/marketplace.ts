/**
 * Marketplace React Queries
 * =========================
 * Hooks de React Query para el Marketplace
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as marketplaceService from '../marketplace-service';
import type { MarketplaceFilters } from '../marketplace-service';

/** Query key factory for Marketplace */
export const marketplaceKeys = {
  all: ['marketplace'] as const,
  skills: (filters?: MarketplaceFilters) => 
    [...marketplaceKeys.all, 'skills', filters ?? {}] as const,
  skill: (id: string) => [...marketplaceKeys.all, 'skill', id] as const,
  featured: () => [...marketplaceKeys.all, 'featured'] as const,
  categories: () => [...marketplaceKeys.all, 'categories'] as const,
  agents: () => [...marketplaceKeys.all, 'agents'] as const,
  stats: () => [...marketplaceKeys.all, 'stats'] as const,
  search: (query: string) => [...marketplaceKeys.all, 'search', query] as const,
};

/**
 * Hook para lista de skills
 */
export function useMarketplaceSkills(filters?: MarketplaceFilters) {
  return useQuery({
    queryKey: marketplaceKeys.skills(filters),
    queryFn: () => marketplaceService.getSkills(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook para detalles de skill
 */
export function useMarketplaceSkill(id: string) {
  return useQuery({
    queryKey: marketplaceKeys.skill(id),
    queryFn: () => marketplaceService.getSkillDetails(id),
    enabled: !!id,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook para skills destacados
 */
export function useMarketplaceFeatured() {
  return useQuery({
    queryKey: marketplaceKeys.featured(),
    queryFn: marketplaceService.getFeatured,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook para categorías
 */
export function useMarketplaceCategories() {
  return useQuery({
    queryKey: marketplaceKeys.categories(),
    queryFn: marketplaceService.getCategories,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Hook para agentes
 */
export function useMarketplaceAgents() {
  return useQuery({
    queryKey: marketplaceKeys.agents(),
    queryFn: marketplaceService.getAgents,
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Hook para estadísticas
 */
export function useMarketplaceStats() {
  return useQuery({
    queryKey: marketplaceKeys.stats(),
    queryFn: marketplaceService.getStats,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook para búsqueda
 */
export function useMarketplaceSearch(query: string, limit = 20) {
  return useQuery({
    queryKey: marketplaceKeys.search(query),
    queryFn: () => marketplaceService.search(query, limit),
    enabled: query.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook para calificar skill
 */
export function useMarketplaceRateSkill() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: { score: number; comment?: string; author?: string } }) =>
      marketplaceService.rateSkill(id, rating),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: marketplaceKeys.skill(id) });
      queryClient.invalidateQueries({ queryKey: marketplaceKeys.stats() });
    },
  });
}

/**
 * Hook para instalar skill
 */
export function useMarketplaceInstallSkill() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, agent }: { id: string; agent: string }) =>
      marketplaceService.installSkill(id, agent),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: marketplaceKeys.stats() });
    },
  });
}
