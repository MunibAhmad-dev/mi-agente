/**
 * Discovery Types
 * ===============
 * Tipos locales para componentes de Discovery
 */

import type {
  DiscoverySearchResult,
  DiscoveryFeaturedItem,
  DiscoveryCategory,
  DiscoveryAgent,
} from '@librechat/data-provider';

export type {
  DiscoverySearchResult,
  DiscoveryFeaturedItem,
  DiscoveryCategory,
  DiscoveryAgent,
};

export type DiscoverySource = 'github' | 'huggingface' | 'mcp' | 'npm' | 'pypi';

export type DiscoveryView = 'search' | 'featured' | 'categories' | 'agents';

export interface DiscoveryState {
  query: string;
  sources: DiscoverySource[];
  selectedAgents: string[];
  view: DiscoveryView;
  selectedCategory?: string;
  selectedPlugin?: DiscoverySearchResult;
}

export interface DiscoveryFilters {
  sources: DiscoverySource[];
  agents: string[];
  types: string[];
  minStars?: number;
}
