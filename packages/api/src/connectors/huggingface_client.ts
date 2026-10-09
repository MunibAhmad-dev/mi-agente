/**
 * HuggingFace API Client
 * ======================
 * Cliente para interactuar con la API de HuggingFace para conectores
 */
import axios, { AxiosInstance } from 'axios';
export interface HuggingFaceModel {
  id: string;
  modelId: string;
  author: string;
  sha: string;
  lastModified: string;
  private: boolean;
  downloads: number;
  likes: number;
  tags: string[];
  pipeline_tag?: string;
  library_name?: string;
  createdAt?: string;
}
export interface HuggingFaceDataset {
  id: string;
  author: string;
  sha: string;
  lastModified: string;
  private: boolean;
  downloads: number;
  likes: number;
  tags: string[];
  createdAt?: string;
}
export interface HuggingFaceSpace {
  id: string;
  author: string;
  sha: string;
  lastModified: string;
  private: boolean;
  sdk: string;
  hardware: string;
  url: string;
  likes: number;
}
export interface HuggingFaceUser {
  id: string;
  email?: string;
  username: string;
  fullname?: string;
  avatarUrl?: string;
  bio?: string;
  isPro: boolean;
  spaces: number;
  datasets: number;
  models: number;
  papers?: number;
  followers?: number;
  following?: number;
}
export interface HuggingFaceSearchResult<T> {
  total: number;
  offset: number;
  limit: number;
  data: T[];
}
export class HuggingFaceClient {
  private client: AxiosInstance;
  private token: string | null = null;
  constructor(accessToken?: string) {
    this.token = accessToken || null;
    this.client = axios.create({
      baseURL: 'https://huggingface.co/api',
      headers: {
        Accept: 'application/json',
      },
    });
    if (this.token) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
    }
  }
  /**
   * Verificar si el token es válido
   */
  async verifyToken(): Promise<HuggingFaceUser | null> {
    if (!this.token) return null;
    
    try {
      const response = await this.client.get<HuggingFaceUser>('/whoami-v2');
      return response.data;
    } catch (error) {
      return null;
    }
  }
  /**
   * Obtener información del usuario
   */
  async getUser(): Promise<HuggingFaceUser | null> {
    return this.verifyToken();
  }
  /**
   * Buscar modelos
   */
  async searchModels(
    query: string,
    options: {
      page?: number;
      limit?: number;
      sort?: 'downloads' | 'likes' | 'recently_updated';
      direction?: 'asc' | 'desc';
      filter?: string;
      tags?: string[];
    } = {}
  ): Promise<HuggingFaceSearchResult<HuggingFaceModel>> {
    const {
      page = 0,
      limit = 20,
      sort = 'downloads',
      direction = 'desc',
      filter: filterParam,
      tags,
    } = options;
    const params: Record<string, any> = {
      query,
      page,
      limit,
      sort,
      direction,
    };
    if (filterParam) params.filter = filterParam;
    if (tags && tags.length > 0) params.tags = tags.join(',');
    const response = await this.client.get<HuggingFaceSearchResult<HuggingFaceModel>>(
      '/models',
      { params }
    );
    return response.data;
  }
  /**
   * Buscar modelos por pipeline (text-to-image, etc.)
   */
  async searchModelsByPipeline(
    pipeline: 'text-to-image' | 'image-to-image' | 'text-to-video' | 'image-segmentation' | 'object-detection',
    options: { limit?: number; sort?: string } = {}
  ): Promise<HuggingFaceSearchResult<HuggingFaceModel>> {
    return this.searchModels('', {
      filter: `pipeline_tag:${pipeline}`,
      limit: options.limit || 20,
      sort: options.sort || 'downloads',
      ...options,
    });
  }
  /**
   * Buscar modelos populares para agentes
   */
  async searchAgentModels(
    options: { limit?: number } = {}
  ): Promise<HuggingFaceSearchResult<HuggingFaceModel>> {
    // Modelos populares para coding, reasoning, etc.
    const agentTags = ['transformers', 'pytorch', 'tensorflow'];
    
    return this.searchModels('', {
      filter: 'transformers',
      limit: options.limit || 20,
      sort: 'downloads',
      tags: agentTags,
    });
  }
  /**
   * Buscar datasets
   */
  async searchDatasets(
    query: string,
    options: {
      page?: number;
      limit?: number;
      sort?: 'downloads' | 'likes' | 'recently_updated';
      direction?: 'asc' | 'desc';
    } = {}
  ): Promise<HuggingFaceSearchResult<HuggingFaceDataset>> {
    const { page = 0, limit = 20, sort = 'downloads', direction = 'desc' } = options;
    const response = await this.client.get<HuggingFaceSearchResult<HuggingFaceDataset>>(
      '/datasets',
      { params: { query, page, limit, sort, direction } }
    );
    return response.data;
  }
  /**
   * Buscar Spaces
   */
  async searchSpaces(
    query: string,
    options: {
      page?: number;
      limit?: number;
      sort?: 'downloads' | 'likes' | 'recently_updated';
      direction?: 'asc' | 'desc';
      sdk?: 'gradio' | 'streamlit' | 'docker' | 'static';
      hardware?: 'cpu-basic' | 'cpu-medium' | 't4-small' | 'a10g-small' | 'a100-large';
    } = {}
  ): Promise<HuggingFaceSearchResult<HuggingFaceSpace>> {
    const { page = 0, limit = 20, sort = 'likes', direction = 'desc', sdk, hardware } = options;
    const params: Record<string, any> = { query, page, limit, sort, direction };
    if (sdk) params.sdk = sdk;
    if (hardware) params.hardware = hardware;
    const response = await this.client.get<HuggingFaceSearchResult<HuggingFaceSpace>>(
      '/spaces',
      { params }
    );
    return response.data;
  }
  /**
   * Obtener detalles de un modelo
   */
  async getModel(modelId: string): Promise<HuggingFaceModel | null> {
    try {
      const response = await this.client.get<HuggingFaceModel>(`/models/${modelId}`);
      return response.data;
    } catch (error) {
      return null;
    }
  }
  /**
   * Obtener detalles de un dataset
   */
  async getDataset(datasetId: string): Promise<HuggingFaceDataset | null> {
    try {
      const response = await this.client.get<HuggingFaceDataset>(`/datasets/${datasetId}`);
      return response.data;
    } catch (error) {
      return null;
    }
  }
  /**
   * Obtener detalles de un Space
   */
  async getSpace(spaceId: string): Promise<HuggingFaceSpace | null> {
    try {
      const response = await this.client.get<HuggingFaceSpace>(`/spaces/${spaceId}`);
      return response.data;
    } catch (error) {
      return null;
    }
  }
  /**
   * Obtener modelos del usuario autenticado
   */
  async getMyModels(options: { limit?: number } = {}): Promise<HuggingFaceModel[]> {
    if (!this.token) return [];
    
    try {
      const response = await this.client.get<HuggingFaceModel[]>('/models', {
        params: { author: 'me', limit: options.limit || 50 },
      });
      return response.data;
    } catch (error) {
      return [];
    }
  }
  /**
   * Obtener datasets del usuario autenticado
   */
  async getMyDatasets(options: { limit?: number } = {}): Promise<HuggingFaceDataset[]> {
    if (!this.token) return [];
    
    try {
      const response = await this.client.get<HuggingFaceDataset[]>('/datasets', {
        params: { author: 'me', limit: options.limit || 50 },
      });
      return response.data;
    } catch (error) {
      return [];
    }
  }
  /**
   * Obtener información de Inference API para un modelo
   */
  async getModelTask(modelId: string): Promise<string | null> {
    try {
      const response = await this.client.get(`/models/${modelId}`);
      return response.data.pipeline_tag || null;
    } catch (error) {
      return null;
    }
  }
}
/**
 * Factory para crear cliente con token del usuario
 */
export function createHuggingFaceClient(accessToken?: string): HuggingFaceClient {
  return new HuggingFaceClient(accessToken);
}
/**
 * Cliente sin autenticación
 */
export const publicHuggingFaceClient: HuggingFaceClient = new HuggingFaceClient();