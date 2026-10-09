/**
 * LiteLLM Client for LibreChat
 * =============================
 * Cliente que conecta LibreChat con LiteLLM Gateway
 * 
 * Este cliente:
 * - NO mantiene lógica de prioridad propia
 * - Delega toda la priorización a LiteLLM Router
 * - Usa model_info.order para orden de intento
 * - Usa cooldown_time para fallback automático
 * 
 * @example
 * import { LiteLLMClient } from '@librechat/data-provider/litellm-client';
 * 
 * const client = new LiteLLMClient({
 *   baseURL: 'http://localhost:4000',
 *   apiKey: process.env.LITELLM_API_KEY,
 * });
 * 
 * const response = await client.chat({
 *   model: 'aios-principal',
 *   messages: [{ role: 'user', content: 'Hello' }],
 * });
 */

import { z } from 'zod';
import request from './request';

// Types
export const ModelInfoSchema = z.object({
  order: z.number().optional(),
  mode: z.string().optional(),
  supported_parameters: z.array(z.string()).optional(),
});

export const ModelSchema = z.object({
  id: z.string(),
  object: z.string().optional(),
  created: z.number().optional(),
  owned_by: z.string().optional(),
});

export const UsageSchema = z.object({
  prompt_tokens: z.number().optional(),
  completion_tokens: z.number().optional(),
  total_tokens: z.number().optional(),
});

export const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.union([z.string(), z.array(z.any())]),
  name: z.string().optional(),
  tool_calls: z.array(z.object({
    id: z.string(),
    type: z.literal('function'),
    function: z.object({
      name: z.string(),
      arguments: z.string(),
    }),
  })).optional(),
  tool_call_id: z.string().optional(),
});

export const ChatCompletionChunkSchema = z.object({
  id: z.string(),
  object: z.literal('chat.completion.chunk'),
  created: z.number(),
  model: z.string(),
  choices: z.array(z.object({
    index: z.number(),
    delta: z.object({
      role: z.string().optional(),
      content: z.string().optional(),
      tool_calls: z.array(z.object({
        index: z.number(),
        id: z.string().optional(),
        type: z.literal('function').optional(),
        function: z.object({
          name: z.string().optional(),
          arguments: z.string().optional(),
        }),
      })).optional(),
    }).optional(),
    finish_reason: z.string().nullable().optional(),
  })),
});

export const ChatCompletionSchema = z.object({
  id: z.string(),
  object: z.literal('chat.completion'),
  created: z.number(),
  model: z.string(),
  choices: z.array(z.object({
    index: z.number(),
    message: z.object({
      role: z.string(),
      content: z.string().nullable(),
      tool_calls: z.array(z.object({
        id: z.string(),
        type: z.literal('function'),
        function: z.object({
          name: z.string(),
          arguments: z.string(),
        }),
      })).optional(),
    }),
    finish_reason: z.string().nullable(),
  })),
  usage: UsageSchema.optional(),
});

export interface LiteLLMOptions {
  baseURL?: string;
  apiKey?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface ChatCompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | Array<Record<string, unknown>>;
    name?: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
    tool_call_id?: string;
  }>;
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    };
  }>;
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  response_format?: { type: 'text' | 'json_object' };
  seed?: number;
}

export interface ModelListResponse {
  object: 'list';
  data: Array<{
    id: string;
    object: 'model';
    created: number;
    owned_by: string;
  }>;
}

export interface HealthResponse {
  status: string;
  version?: string;
  models?: string[];
}

/**
 * LiteLLM Client
 * 
 * Cliente para interactuar con LiteLLM Gateway.
 * Delega toda la lógica de prioridad y fallback a LiteLLM.
 */
export class LiteLLMClient {
  private baseURL: string;
  private apiKey: string;
  private timeout: number;
  private headers: Record<string, string>;

  constructor(options: LiteLLMOptions = {}) {
    this.baseURL = (options.baseURL || 'http://localhost:4000').replace(/\/$/, '');
    this.apiKey = options.apiKey || '';
    this.timeout = options.timeout || 120000;
    this.headers = {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
      ...options.headers,
    };
  }

  /**
   * Chat Completion
   * 
   * Envía una solicitud de chat completion a LiteLLM Gateway.
   * LiteLLM se encarga de la priorización y fallback.
   */
  async chat(body: ChatCompletionRequest): Promise<z.infer<typeof ChatCompletionSchema>> {
    const url = `${this.baseURL}/v1/chat/completions`;
    
    const response = await request.post(url, body, {
      headers: this.headers,
      timeout: this.timeout,
    });

    return ChatCompletionSchema.parse(response);
  }

  /**
   * Chat Completion Stream
   * 
   * Versión streaming de chat completion.
   */
  async *chatStream(request: ChatCompletionRequest): AsyncGenerator<z.infer<typeof ChatCompletionChunkSchema>> {
    const url = `${this.baseURL}/v1/chat/completions`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ ...request, stream: true }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LiteLLM Error ${response.status}: ${error}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          
          const data = line.slice(6);
          if (!data || data.trim() === '') {
            // Skip invalid JSON
            continue;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * List Models
   * 
   * Lista todos los modelos disponibles en LiteLLM.
   */
  async listModels(): Promise<ModelListResponse> {
    const url = `${this.baseURL}/v1/models`;
    
    const response = await request.get(url, {
      headers: this.headers,
      timeout: 10000,
    });

    return response as ModelListResponse;
  }

  /**
   * Health Check
   * 
   * Verifica el estado del gateway LiteLLM.
   */
  async healthCheck(): Promise<HealthResponse> {
    const url = `${this.baseURL}/health`;
    
    try {
      const response = await request.get(url, {
        timeout: 5000,
      });
      return response as HealthResponse;
    } catch {
      return { status: 'error', version: undefined, models: undefined };
    }
  }

  /**
   * Get Model Info
   * 
   * Obtiene información de un modelo específico.
   */
  async getModelInfo(modelId: string): Promise<{ id: string; model_info?: { order?: number } } | null> {
    const models = await this.listModels();
    const model = models.data.find(m => m.id === modelId);
    return model ? { id: model.id } : null;
  }

  /**
   * Check if LiteLLM is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const health = await this.healthCheck();
      return health.status === 'ok' || health.status === 'healthy';
    } catch {
      return false;
    }
  }
}

// Default instance
export const createLiteLLMClient = (options?: LiteLLMOptions) => new LiteLLMClient(options);

// Export singleton for convenience
let defaultClient: LiteLLMClient | null = null;

export const getLiteLLMClient = (options?: LiteLLMOptions): LiteLLMClient => {
  if (!defaultClient || options) {
    defaultClient = new LiteLLMClient(options);
  }
  return defaultClient;
};
