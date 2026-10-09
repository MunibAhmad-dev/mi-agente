/**
 * Marketplace Service
 * ===================
 * Cliente para el sistema de Marketplace de skills y plugins
 * 
 * @example
 * import * as marketplace from './marketplace-service';
 * 
 * // Lista de skills
 * const skills = await marketplace.getSkills();
 * 
 * // Skills destacados
 * const featured = await marketplace.getFeatured();
 * 
 * // Categorías
 * const categories = await marketplace.getCategories();
 * 
 * // Calificar un skill
 * await marketplace.rateSkill('github-mcp', { score: 5, comment: 'Great!' });
 */

import * as endpoints from './api-endpoints';
import request from './request';

export interface MarketplaceSkill {
  id: string;
  name: string;
  description: string;
  source: string;
  type: string;
  url: string;
  stars?: number;
  downloads?: number;
  author?: string;
  tags: string[];
  categories?: string[];
  compatibleAgents?: string[];
  verified: boolean;
  featured: boolean;
  rating?: number;
  reviewCount?: number;
  reviews?: SkillReview[];
}

export interface MarketplaceCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  skillCount: number;
  featuredSkills: string[];
}

export interface MarketplaceAgent {
  id: string;
  name: string;
  icon: string;
  website: string;
  skillCount: number;
}

export interface SkillReview {
  id: string;
  score: number;
  comment: string;
  author: string;
  createdAt: string;
  helpful: number;
  notHelpful: number;
}

export interface MarketplaceStats {
  totalSkills: number;
  totalCategories: number;
  totalDownloads: number;
  averageRating: number;
  topSources: { source: string; count: number }[];
  topAgents: { agent: string; count: number }[];
}

export interface MarketplaceFilters {
  source?: string;
  type?: string;
  category?: string;
  agent?: string;
  minRating?: number;
  verifiedOnly?: boolean;
  featuredOnly?: boolean;
  sortBy?: 'rating' | 'downloads' | 'stars' | 'newest' | 'name';
  limit?: number;
  offset?: number;
}

/** Obtiene lista de skills con filtros */
export async function getSkills(filters?: MarketplaceFilters): Promise<{
  skills: MarketplaceSkill[];
  total: number;
  limit: number;
  offset: number;
}> {
  const params: Record<string, string> = {};
  
  if (filters) {
    if (filters.source) params.source = filters.source;
    if (filters.type) params.type = filters.type;
    if (filters.category) params.category = filters.category;
    if (filters.agent) params.agent = filters.agent;
    if (filters.minRating) params.minRating = filters.minRating.toString();
    if (filters.verifiedOnly) params.verifiedOnly = 'true';
    if (filters.featuredOnly) params.featuredOnly = 'true';
    if (filters.sortBy) params.sortBy = filters.sortBy;
    if (filters.limit) params.limit = filters.limit.toString();
    if (filters.offset) params.offset = filters.offset.toString();
  }

  const response = await request.get<{
    skills: MarketplaceSkill[];
    total: number;
    limit: number;
    offset: number;
  }>(endpoints.marketplaceSkills(params));
  return response;
}

/** Obtiene detalles de un skill */
export async function getSkillDetails(id: string): Promise<MarketplaceSkill> {
  const response = await request.get<MarketplaceSkill>(endpoints.marketplaceSkillDetails(id));
  return response;
}

/** Obtiene categorías */
export async function getCategories(): Promise<MarketplaceCategory[]> {
  const response = await request.get<MarketplaceCategory[]>(endpoints.marketplaceCategories());
  return response;
}

/** Obtiene skills destacados */
export async function getFeatured(): Promise<MarketplaceSkill[]> {
  const response = await request.get<MarketplaceSkill[]>(endpoints.marketplaceFeatured());
  return response;
}

/** Obtiene agentes */
export async function getAgents(): Promise<MarketplaceAgent[]> {
  const response = await request.get<MarketplaceAgent[]>(endpoints.marketplaceAgents());
  return response;
}

/** Obtiene estadísticas */
export async function getStats(): Promise<MarketplaceStats> {
  const response = await request.get<MarketplaceStats>(endpoints.marketplaceStats());
  return response;
}

/** Busca en marketplace */
export async function search(query: string, limit = 20): Promise<MarketplaceSkill[]> {
  const response = await request.get<{ results?: MarketplaceSkill[] }>(endpoints.marketplaceSearch(query, limit));
  return response?.results ?? [];
}

/** Califica un skill */
export async function rateSkill(
  id: string,
  rating: { score: number; comment?: string; author?: string }
): Promise<{ success: boolean; review: SkillReview }> {
  const response = (await request.post(endpoints.marketplaceRateSkill(id), rating)) as {
    success: boolean;
    review: SkillReview;
  };
  return response;
}

/** Registra instalación de skill */
export async function installSkill(
  id: string,
  agent: string
): Promise<{ success: boolean; skillId: string; agent: string }> {
  const response = (await request.post(endpoints.marketplaceInstallSkill(id), { agent })) as {
    success: boolean;
    skillId: string;
    agent: string;
  };
  return response;
}

/** Obtiene installation command para un agente específico */
export function getInstallCommand(skill: MarketplaceSkill, agentId: string): string | undefined {
  // MCP servers
  if (skill.source === 'mcp') {
    const serverName = skill.id.replace('-mcp', '').replace('mcp-', '');
    return `npx -y @modelcontextprotocol/server-${serverName}`;
  }
  
  // NPM packages
  if (skill.source === 'npm') {
    return `npm install ${skill.name.toLowerCase().replace(' ', '-')}`;
  }
  
  // PyPI packages
  if (skill.source === 'pypi') {
    return `pip install ${skill.name.toLowerCase().replace(' ', '-')}`;
  }
  
  // GitHub repos
  if (skill.source === 'github' && skill.url) {
    return `git clone ${skill.url.replace('github.com', 'github.com').replace('.git', '')}.git`;
  }
  
  return undefined;
}

/** Formatea número de descargas */
export function formatDownloads(downloads?: number): string {
  if (!downloads) return '0';
  if (downloads >= 1000000000) return `${(downloads / 1000000000).toFixed(1)}B`;
  if (downloads >= 1000000) return `${(downloads / 1000000).toFixed(1)}M`;
  if (downloads >= 1000) return `${(downloads / 1000).toFixed(1)}K`;
  return downloads.toString();
}

/** Formatea número de stars */
export function formatStars(stars?: number): string {
  if (!stars) return '0';
  if (stars >= 1000) return `${(stars / 1000).toFixed(1)}K`;
  return stars.toString();
}
