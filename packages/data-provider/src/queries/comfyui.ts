/**
 * ComfyUI React Queries
 * =====================
 * Hooks de React Query para interactuar con ComfyUI
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as comfyuiService from '../comfyui-service';
import type {
  ComfyUIModel,
  LoRA,
  ComfyUIParams,
  ComfyUIGeneration,
  ComfyUIQueueResponse,
} from '../types/comfyui';

/** Query key factory for ComfyUI */
export const comfyuiKeys = {
  all: ['comfyui'] as const,
  models: () => [...comfyuiKeys.all, 'models'] as const,
  loras: () => [...comfyuiKeys.all, 'loras'] as const,
  queue: () => [...comfyuiKeys.all, 'queue'] as const,
  history: (promptId?: string) => [...comfyuiKeys.all, 'history', promptId] as const,
  generation: (id: string) => [...comfyuiKeys.all, 'generation', id] as const,
};

/**
 * Hook to check ComfyUI connection status
 */
export function useComfyUIConnection() {
  return useQuery({
    queryKey: [...comfyuiKeys.all, 'connection'],
    queryFn: comfyuiService.checkConnection,
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

/**
 * Hook to get available models
 */
export function useComfyUIModels() {
  return useQuery({
    queryKey: comfyuiKeys.models(),
    queryFn: comfyuiService.getModels,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to get available LoRAs
 */
export function useComfyUILoRAs() {
  return useQuery({
    queryKey: comfyuiKeys.loras(),
    queryFn: comfyuiService.getLoRAs,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to get queue status
 */
export function useComfyUIQueue() {
  return useQuery({
    queryKey: comfyuiKeys.queue(),
    queryFn: comfyuiService.getQueueStatus,
    staleTime: 5000,
    refetchInterval: 10000,
  });
}

/**
 * Hook to get generation history
 */
export function useComfyUIHistory(promptId?: string) {
  return useQuery({
    queryKey: comfyuiKeys.history(promptId),
    queryFn: () => comfyuiService.getHistory(promptId),
    staleTime: 30000,
    refetchInterval: 30000,
  });
}

/**
 * Hook to generate image/video
 */
export function useComfyUIGenerate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (params: ComfyUIParams) => comfyuiService.generate(params),
    onSuccess: (data) => {
      // Invalidate queue to show new item
      queryClient.invalidateQueries({ queryKey: comfyuiKeys.queue() });
      // Add to generations cache
      if (data.id) {
        queryClient.setQueryData<ComfyUIGeneration>(
          comfyuiKeys.generation(data.id),
          data
        );
      }
    },
  });
}

/**
 * Hook to cancel a generation
 */
export function useComfyUICancel() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (promptId: string) => comfyuiService.cancelGeneration(promptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: comfyuiKeys.queue() });
    },
  });
}

/**
 * Hook to clear the queue
 */
export function useComfyUIClearQueue() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: comfyuiService.clearQueue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: comfyuiKeys.queue() });
      queryClient.invalidateQueries({ queryKey: comfyuiKeys.history() });
    },
  });
}

/**
 * Hook to get a specific generation
 */
export function useComfyUIGeneration(id: string) {
  return useQuery({
    queryKey: comfyuiKeys.generation(id),
    queryFn: async () => {
      const history = await comfyuiService.getHistory(id);
      const promptData = history[id];
      if (promptData) {
        return {
          id,
          status: promptData.status.completed ? 'completed' : 'running',
          progress: promptData.status.exec_time,
          createdAt: new Date().toISOString(),
          completedAt: promptData.status.completed ? new Date().toISOString() : undefined,
        } as ComfyUIGeneration;
      }
      return null;
    },
    enabled: !!id,
    refetchInterval: 5000,
  });
}

/**
 * Hook to get system stats
 */
export function useComfyUISystemStats() {
  return useQuery({
    queryKey: [...comfyuiKeys.all, 'systemStats'],
    queryFn: comfyuiService.getSystemStats,
    staleTime: 10000,
    refetchInterval: 30000,
  });
}

/**
 * Hook to get output image as base64
 */
export function useComfyUIOutputImage(filename: string, enabled = true) {
  return useQuery({
    queryKey: [...comfyuiKeys.all, 'output', filename],
    queryFn: () => comfyuiService.getOutputImage(filename),
    enabled: enabled && !!filename,
    staleTime: Infinity,
  });
}

/**
 * Hook to get preview image as base64
 */
export function useComfyUIPreview(promptId: string, enabled = true) {
  return useQuery({
    queryKey: [...comfyuiKeys.all, 'preview', promptId],
    queryFn: () => comfyuiService.getPreviewImage(promptId),
    enabled: enabled && !!promptId,
    staleTime: 5000,
    refetchInterval: 10000,
  });
}
