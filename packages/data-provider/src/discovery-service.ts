/**
 * Discovery Service
 * =================
 * Cliente para el sistema de búsqueda universal
 * 
 * @example
 * import * as discovery from './discovery-service';
 * 
 * // Búsqueda universal
 * const results = await discovery.search('react typescript');
 * 
 * // Plugins destacados
 * const featured = await discovery.getFeatured();
 * 
 * // Categorías
 * const categories = await discovery.getCategories();
 */

import * as endpoints from './api-endpoints';
import request from './request';
import type {
  DiscoverySearchResult,
  DiscoverySearchRequest,
  DiscoverySearchResponse,
  DiscoveryFeaturedItem,
  DiscoveryCategory,
  DiscoveryAgent,
} from './types/discovery';
// Valores (constantes), no tipos: no pueden ir en `import type`.
import { COMPATIBLE_AGENTS, PLUGIN_CATEGORIES, FEATURED_PLUGINS } from './types/discovery';

/** Búsqueda universal en todas las fuentes */
export async function search(params: DiscoverySearchRequest): Promise<DiscoverySearchResponse> {
  const startTime = Date.now();
  
  try {
    const response = (await request.post(endpoints.discoverySearch(), {
      ...params,
      sources: params.sources ?? ['github', 'huggingface', 'mcp', 'npm', 'pypi'],
      limit: params.limit ?? 20,
      includeInstallCommand: params.includeInstallCommand ?? true,
    })) as DiscoverySearchResponse;
    
    return {
      ...response,
      queryTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error('[Discovery] Search failed:', error);
    // Devolver fallback con datos locales
    return getFallbackResponse(params.query, params.sources);
  }
}

/** Búsqueda en una fuente específica */
export async function searchInSource(
  source: string,
  query: string,
  limit = 10
): Promise<DiscoverySearchResult[]> {
  try {
    const response = await request.get<{ results?: DiscoverySearchResult[] }>(
      endpoints.discoverySearchInSource(source, query, limit)
    );
    return response?.results ?? [];
  } catch (error) {
    console.error(`[Discovery] Search in ${source} failed:`, error);
    return [];
  }
}

/** Obtiene plugins destacados */
export async function getFeatured(): Promise<DiscoveryFeaturedItem[]> {
  try {
    const response = await request.get<DiscoveryFeaturedItem[]>(endpoints.discoveryFeatured());
    return response ?? [];
  } catch (error) {
    console.error('[Discovery] Failed to get featured:', error);
    // Devolver fallback
    return getFeaturedFallback();
  }
}

/** Obtiene categorías */
export async function getCategories(): Promise<DiscoveryCategory[]> {
  try {
    const response = await request.get<DiscoveryCategory[]>(endpoints.discoveryCategories());
    return response ?? [];
  } catch (error) {
    console.error('[Discovery] Failed to get categories:', error);
    return getCategoriesFallback();
  }
}

/** Obtiene agentes compatibles */
export async function getAgents(): Promise<DiscoveryAgent[]> {
  try {
    const response = await request.get<DiscoveryAgent[]>(endpoints.discoveryAgents());
    return response ?? [];
  } catch (error) {
    console.error('[Discovery] Failed to get agents:', error);
    return getAgentsFallback();
  }
}

/** Obtiene detalles de un plugin */
export async function getPluginDetails(
  source: string,
  pluginId: string
): Promise<DiscoverySearchResult | null> {
  try {
    const response = await request.get<DiscoverySearchResult>(
      endpoints.discoveryPluginDetails(source, pluginId)
    );
    return response;
  } catch (error) {
    console.error('[Discovery] Failed to get plugin details:', error);
    return null;
  }
}

/** Busca en GitHub repos con topics de skills */
export async function searchGitHubSkills(query: string, limit = 10): Promise<DiscoverySearchResult[]> {
  return searchInSource('github', query, limit);
}

/** Busca en HuggingFace spaces */
export async function searchHuggingFace(query: string, limit = 10): Promise<DiscoverySearchResult[]> {
  return searchInSource('huggingface', query, limit);
}

/** Busca servidores MCP */
export async function searchMCPServers(query: string, limit = 10): Promise<DiscoverySearchResult[]> {
  return searchInSource('mcp', query, limit);
}

/** Busca en NPM */
export async function searchNPM(query: string, limit = 10): Promise<DiscoverySearchResult[]> {
  return searchInSource('npm', query, limit);
}

/** Busca en PyPI */
export async function searchPyPI(query: string, limit = 10): Promise<DiscoverySearchResult[]> {
  return searchInSource('pypi', query, limit);
}

// ============== Fallback Data ==============

function getFallbackResponse(query: string, sources?: string[]): DiscoverySearchResponse {
  const fallbackResults: DiscoverySearchResult[] = FEATURED_PLUGINS
    .filter(p => 
      (!sources || sources.length === 0 || sources.includes(p.source)) &&
      (p.name.toLowerCase().includes(query.toLowerCase()) ||
       p.description.toLowerCase().includes(query.toLowerCase()))
    )
    .map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      source: p.source,
      type: p.type,
      url: p.url,
      stars: p.stars,
      tags: [p.category],
      compatibleAgents: ['claude_code', 'cursor', 'windsurf', 'manus'],
      score: p.stars / 1000,
    }));

  return {
    results: fallbackResults.slice(0, 20),
    totalFound: fallbackResults.length,
    sourcesSearched: sources as any[] ?? ['github', 'huggingface', 'mcp'],
    queryTimeMs: 0,
    cacheHit: true,
  };
}

function getFeaturedFallback(): DiscoveryFeaturedItem[] {
  return FEATURED_PLUGINS;
}

function getCategoriesFallback(): DiscoveryCategory[] {
  return PLUGIN_CATEGORIES.map(cat => ({
    ...cat,
    count: FEATURED_PLUGINS.filter(p => p.category === cat.id).length,
  }));
}

function getAgentsFallback(): DiscoveryAgent[] {
  return COMPATIBLE_AGENTS;
}

// Re-exportar tipos estáticos
export { FEATURED_PLUGINS, PLUGIN_CATEGORIES, COMPATIBLE_AGENTS };
