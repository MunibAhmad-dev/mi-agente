/**
 * API-Key Client for LibreChat
 * =============================
 * 
 * Client for interacting with the API-Key Manager service.
 * 
 * Features:
 * - Chat completions with intelligent routing
 * - Provider and key management
 * - Usage tracking
 * - Automatic failover
 * 
 * Autor: Mi LibreChat
 * Versión: 1.0.0
 * Licencia: MIT
 */

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: Message[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  preferred_providers?: string[];
  excluded_providers?: string[];
  selection_strategy?: 'priority' | 'cost' | 'latency' | 'availability' | 'hybrid';
  user_id?: string;
  [key: string]: any;
}

export interface ChatResponse {
  success: boolean;
  provider_name: string;
  key_id: number;
  model_used: string;
  response?: {
    id: string;
    choices: Array<{
      message: {
        role: string;
        content: string;
      };
      finish_reason: string;
    }>;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  };
  error?: string;
  error_code?: number;
  latency_ms: number;
  tokens_used: number;
  cost_used: number;
  fallback_count: number;
  from_cache: boolean;
}

export interface Provider {
  id: number;
  name: string;
  display_name: string;
  api_base: string;
  status: 'active' | 'degraded' | 'offline';
  priority: number;
  supported_models: string[];
  cooldown_seconds: number;
  max_retries: number;
  supports_streaming: boolean;
  supports_function_calling: boolean;
  supports_vision: boolean;
}

export interface ApiKey {
  id: number;
  provider_id: number;
  label: string | null;
  status: 'active' | 'exhausted' | 'cooldown' | 'invalid' | 'revoked';
  remaining_quota: number | null;
  daily_limit: number | null;
  is_primary: boolean;
  error_count: number;
  success_count: number;
  last_used_at: string | null;
  cooldown_until: string | null;
  estimated_cost: number;
  created_at: string;
}

export interface SystemStats {
  providers: {
    total: number;
    active: number;
  };
  keys: {
    total: number;
    active: number;
    exhausted: number;
  };
  usage_24h: {
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    success_rate: number;
    total_tokens: number;
    estimated_cost: number;
  };
}

export interface RouteResult {
  success: boolean;
  provider: string;
  model: string;
  latency_ms: number;
  tokens: number;
  cost: number;
}

export class APIKeyClient {
  private baseUrl: string;
  private apiKey: string | null;
  private defaultTimeout: number;

  constructor(options: {
    baseUrl?: string;
    apiKey?: string;
    timeout?: number;
  } = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:4001';
    this.apiKey = options.apiKey || null;
    this.defaultTimeout = options.timeout || 60000;
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    
    return headers;
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number = this.defaultTimeout
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/v1/chat/completions`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Chat request failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async getModels(provider?: string): Promise<any[]> {
    const url = provider 
      ? `${this.baseUrl}/api/v1/chat/models?provider=${provider}`
      : `${this.baseUrl}/api/v1/chat/models`;

    const response = await this.fetchWithTimeout(url, { method: 'GET' });
    
    if (!response.ok) {
      throw new Error(`Get models failed: ${response.status}`);
    }

    return response.json();
  }

  async listProviders(): Promise<Provider[]> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/v1/providers`,
      { method: 'GET' }
    );

    if (!response.ok) {
      throw new Error(`List providers failed: ${response.status}`);
    }

    return response.json();
  }

  async createProvider(provider: Partial<Provider>): Promise<Provider> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/v1/providers`,
      {
        method: 'POST',
        body: JSON.stringify(provider),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Create provider failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async listKeys(options?: {
    provider_id?: number;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiKey[]> {
    const params = new URLSearchParams();
    if (options?.provider_id) params.append('provider_id', options.provider_id.toString());
    if (options?.status) params.append('status', options.status);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());

    const url = `${this.baseUrl}/api/v1/keys${params.toString() ? `?${params}` : ''}`;
    
    const response = await this.fetchWithTimeout(url, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`List keys failed: ${response.status}`);
    }

    return response.json();
  }

  async createKey(key: {
    provider_id: number;
    key: string;
    label?: string;
    remaining_quota?: number;
    daily_limit?: number;
    is_primary?: boolean;
  }): Promise<ApiKey> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/v1/keys`,
      {
        method: 'POST',
        body: JSON.stringify(key),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Create key failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async deleteKey(id: number): Promise<boolean> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/v1/keys/${id}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      throw new Error(`Delete key failed: ${response.status}`);
    }

    return true;
  }

  async markKeyExhausted(id: number, cooldownSeconds?: number): Promise<boolean> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/v1/keys/${id}/exhaust`,
      {
        method: 'POST',
        body: JSON.stringify({ cooldown_seconds: cooldownSeconds }),
      }
    );

    if (!response.ok) {
      throw new Error(`Mark exhausted failed: ${response.status}`);
    }

    return true;
  }

  async getSystemStats(): Promise<SystemStats> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/v1/stats`,
      { method: 'GET' }
    );

    if (!response.ok) {
      throw new Error(`Get stats failed: ${response.status}`);
    }

    return response.json();
  }

  async healthCheck(): Promise<{ status: string; version: string }> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/health`,
      { method: 'GET' },
      5000
    );

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }

    return response.json();
  }
}

let clientInstance: APIKeyClient | null = null;

export function getAPIKeyClient(options?: {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
}): APIKeyClient {
  if (!clientInstance) {
    clientInstance = new APIKeyClient(options);
  }
  return clientInstance;
}

export default APIKeyClient;
