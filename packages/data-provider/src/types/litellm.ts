/**
 * LiteLLM Types
 * =============
 * 
 * Types for the LiteLLM Gateway integration.
 */

export interface LLMModel {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  supportedParams: string[];
  maxTokens: number;
  supportsStreaming: boolean;
  supportsFunctionCalling: boolean;
  pricing: {
    prompt: number;
    completion: number;
    currency: string;
  };
}

export interface LLMHealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  providers: Record<string, ProviderHealth>;
  timestamp: string;
}

export interface ProviderHealth {
  status: 'up' | 'down' | 'degraded';
  latencyMs?: number;
  errorRate?: number;
  quotaRemaining?: number;
}

export interface LLMUsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  byProvider: Record<string, ProviderUsage>;
}

export interface ProviderUsage {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

export interface LLMConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface LLMCompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stream?: boolean;
  user?: string;
}

export interface LLMCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finishReason: string;
  }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMErrorResponse {
  error: {
    message: string;
    type: string;
    code?: string;
    param?: string;
  };
}
