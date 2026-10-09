/**
 * GitHub API Client
 * =================
 * Cliente para interactuar con la API de GitHub para conectores
 */
import { apiEndpoints } from '../routes/endpoints.js';
import axios, { AxiosInstance } from 'axios';
export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics: string[];
  owner: {
    login: string;
    avatar_url: string;
  };
  updated_at: string;
  default_branch: string;
}
export interface GitHubSearchResult {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepo[];
}
export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  name: string | null;
  company: string | null;
  public_repos: number;
  followers: number;
}
export class GitHubClient {
  private client: AxiosInstance;
  private token: string | null = null;
  constructor(accessToken?: string) {
    this.token = accessToken || null;
    
    this.client = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (this.token) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
    }
  }
  /**
   * Verificar si el token es válido
   */
  async verifyToken(): Promise<GitHubUser | null> {
    try {
      const response = await this.client.get<GitHubUser>('/user');
      return response.data;
    } catch (error) {
      return null;
    }
  }
  /**
   * Obtener información del usuario
   */
  async getUser(): Promise<GitHubUser | null> {
    return this.verifyToken();
  }
  /**
   * Buscar repositorios
   */
  async searchRepos(
    query: string,
    options: {
      page?: number;
      per_page?: number;
      sort?: 'stars' | 'forks' | 'updated';
      order?: 'asc' | 'desc';
      language?: string;
    } = {}
  ): Promise<GitHubSearchResult> {
    const { page = 1, per_page = 30, sort = 'stars', order = 'desc', language } = options;
    let searchQuery = query;
    if (language) {
      searchQuery += ` language:${language}`;
    }
    const response = await this.client.get<GitHubSearchResult>('/search/repositories', {
      params: {
        q: searchQuery,
        page,
        per_page,
        sort,
        order,
      },
    });
    return response.data;
  }
  /**
   * Buscar repos con skills/plugins
   */
  async searchSkills(
    query: string,
    options: { page?: number; per_page?: number } = {}
  ): Promise<GitHubSearchResult> {
    const searchQuery = `${query} (skill OR plugin OR tool OR agent)`;
    return this.searchRepos(searchQuery, { ...options, sort: 'stars' });
  }
  /**
   * Obtener repos del usuario autenticado
   */
  async getMyRepos(
    options: {
      page?: number;
      per_page?: number;
      type?: 'all' | 'owner' | 'public' | 'private';
      sort?: 'created' | 'updated' | 'pushed' | 'full_name';
    } = {}
  ): Promise<GitHubRepo[]> {
    const { page = 1, per_page = 30, type = 'owner', sort = 'updated' } = options;
    const response = await this.client.get<GitHubRepo[]>('/user/repos', {
      params: {
        page,
        per_page,
        type,
        sort,
      },
    });
    return response.data;
  }
  /**
   * Obtener detalles de un repositorio
   */
  async getRepo(owner: string, repo: string): Promise<GitHubRepo | null> {
    try {
      const response = await this.client.get<GitHubRepo>(`/repos/${owner}/${repo}`);
      return response.data;
    } catch (error) {
      return null;
    }
  }
  /**
   * Obtener topics de un repositorio
   */
  async getRepoTopics(owner: string, repo: string): Promise<string[]> {
    try {
      const response = await this.client.get<{ names: string[] }>(
        `/repos/${owner}/${repo}/topics`
      );
      return response.data.names || [];
    } catch (error) {
      return [];
    }
  }
  /**
   * Listar archivos en un directorio
   */
  async listContents(
    owner: string,
    repo: string,
    path: string = ''
  ): Promise<any[]> {
    const response = await this.client.get(`/repos/${owner}/${repo}/contents/${path}`);
    return response.data;
  }
  /**
   * Obtener README de un repositorio
   */
  async getReadme(owner: string, repo: string): Promise<string | null> {
    try {
      const response = await this.client.get(`/repos/${owner}/${repo}/readme`);
      // El contenido viene en base64
      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      return content;
    } catch (error) {
      return null;
    }
  }
  /**
   * Obtener releases de un repositorio
   */
  async getReleases(owner: string, repo: string, per_page: number = 5): Promise<unknown> {
    const response = await this.client.get(`/repos/${owner}/${repo}/releases`, {
      params: { per_page },
    });
    return response.data;
  }
  /**
   * Verificar si un repo tiene Actions
   */
  async hasActions(owner: string, repo: string): Promise<boolean> {
    try {
      await this.client.get(`/repos/${owner}/${repo}/actions/workflows`);
      return true;
    } catch (error) {
      return false;
    }
  }
  /**
   * Obtener languages de un repositorio (porcentaje de uso)
   */
  async getLanguages(owner: string, repo: string): Promise<Record<string, number>> {
    const response = await this.client.get<Record<string, number>>(
      `/repos/${owner}/${repo}/languages`
    );
    return response.data;
  }
}
/**
 * Factory para crear cliente con token del usuario
 */
export function createGitHubClient(accessToken?: string): GitHubClient {
  return new GitHubClient(accessToken);
}
/**
 * Cliente sin autenticación (rate limit más bajo)
 */
export const publicGitHubClient: GitHubClient = new GitHubClient();