/**
 * LiteLLM React Queries
 * =====================
 * 
 * React Query hooks for interacting with the LiteLLM Gateway.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { 
  LLMModel, 
  LLMHealthStatus, 
  LLMConfig, 
  LLMUsageStats,
  LLMCompletionRequest,
  LLMCompletionResponse 
} from '../types/litellm';

// API base URL
const API_BASE = '/api/litellm';

/**
 * Fetch available models
 */
export const useLLMModels = (provider?: string) => {
  return useQuery({
    queryKey: ['litellm', 'models', provider],
    queryFn: async (): Promise<LLMModel[]> => {
      const url = provider 
        ? `${API_BASE}/models?provider=${provider}`
        : `${API_BASE}/models`;
      const res = await fetch(url);
      const data = await res.json();
      return data.models || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: true,
  });
};

/**
 * Fetch health status
 */
export const useLLMHealth = () => {
  return useQuery({
    queryKey: ['litellm', 'health'],
    queryFn: async (): Promise<LLMHealthStatus> => {
      const res = await fetch(`${API_BASE}/health`);
      if (!res.ok) {
        throw new Error('Failed to fetch health status');
      }
      return res.json();
    },
    refetchInterval: 30000, // 30 seconds
    staleTime: 10000, // 10 seconds
    retry: 3,
  });
};

/**
 * Fetch usage stats
 */
export const useLLMUsage = (timeRange?: string) => {
  return useQuery({
    queryKey: ['litellm', 'usage', timeRange],
    queryFn: async (): Promise<LLMUsageStats> => {
      const url = timeRange
        ? `${API_BASE}/usage?range=${timeRange}`
        : `${API_BASE}/usage`;
      const res = await fetch(url);
      const data = await res.json();
      return data.stats || { totalRequests: 0, totalTokens: 0, totalCost: 0, byProvider: {} };
    },
    staleTime: 60000, // 1 minute
  });
};

/**
 * Send completion request
 */
export const useLLMCompletion = () => {
  return useMutation({
    mutationFn: async (request: LLMCompletionRequest): Promise<LLMCompletionResponse> => {
      const res = await fetch(`${API_BASE}/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || 'Completion request failed');
      }
      
      return res.json();
    },
  });
};

/**
 * Test provider connection
 */
export const useLLMTestConnection = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (config: LLMConfig): Promise<{ success: boolean; message: string }> => {
      const res = await fetch(`${API_BASE}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['litellm', 'health'] });
    },
  });
};

/**
 * Add a new provider
 */
export const useLLMAddProvider = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (config: LLMConfig): Promise<{ success: boolean; providerId: string }> => {
      const res = await fetch(`${API_BASE}/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['litellm', 'models'] });
      queryClient.invalidateQueries({ queryKey: ['litellm', 'health'] });
    },
  });
};

/**
 * Remove a provider
 */
export const useLLMRemoveProvider = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (providerId: string): Promise<{ success: boolean }> => {
      const res = await fetch(`${API_BASE}/providers/${providerId}`, {
        method: 'DELETE',
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['litellm', 'models'] });
      queryClient.invalidateQueries({ queryKey: ['litellm', 'health'] });
    },
  });
};

/**
 * Get provider config
 */
export const useLLMProviderConfig = (providerId: string) => {
  return useQuery({
    queryKey: ['litellm', 'provider', providerId],
    queryFn: async (): Promise<LLMConfig> => {
      const res = await fetch(`${API_BASE}/providers/${providerId}`);
      const data = await res.json();
      return data.config || {};
    },
    staleTime: 60000, // 1 minute
    enabled: !!providerId,
  });
};
