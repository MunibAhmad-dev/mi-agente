/**
 * ComfyUI Hook
 * ============
 * Hook para gestionar el estado del sistema de ventanas de ComfyUI
 * Integración con React Query para llamadas al backend
 */

import { useState, useCallback, useMemo } from 'react';
import type {
  ComfyUIParams,
  ComfyUIModel,
  LoRA,
  GenerationMode,
  TGenerationItem,
} from './types';
import { DEFAULT_PARAMS } from './models';
import {
  useComfyUIGenerate,
  useComfyUICancel,
  useComfyUIConnection,
  useComfyUIModels,
  useComfyUILoRAs,
  useComfyUIQueue,
} from 'librechat-data-provider';

interface UseComfyUIOptions {
  onGenerate?: (params: ComfyUIParams) => void;
  onImageGenerated?: (imageUrl: string, generationId: string) => void;
}

export function useComfyUI({ onGenerate, onImageGenerated }: UseComfyUIOptions = {}) {
  // Estado de los parámetros
  const [params, setParams] = useState<ComfyUIParams>({
    mode: DEFAULT_PARAMS.mode,
    loras: [],
    prompt: '',
    negativePrompt: DEFAULT_PARAMS.negativePrompt,
    steps: DEFAULT_PARAMS.steps,
    cfgScale: DEFAULT_PARAMS.cfgScale,
    width: DEFAULT_PARAMS.width,
    height: DEFAULT_PARAMS.height,
    batchSize: DEFAULT_PARAMS.batchSize,
  });

  // Estado de la ventana
  const [isWindowOpen, setIsWindowOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'models' | 'loras' | 'params'>('models');

  // Modelos y LoRAs seleccionados
  const [selectedModel, setSelectedModel] = useState<ComfyUIModel | undefined>();
  const [selectedLoras, setSelectedLoras] = useState<LoRA[]>([]);

  // Estado de generaciones recientes
  const [recentGenerations, setRecentGenerations] = useState<TGenerationItem[]>([]);

  // React Query hooks
  const connectionQuery = useComfyUIConnection();
  const modelsQuery = useComfyUIModels();
  const lorasQuery = useComfyUILoRAs();
  const queueQuery = useComfyUIQueue();
  const generateMutation = useComfyUIGenerate();
  const cancelMutation = useComfyUICancel();

  // Computed values
  const isConnected = connectionQuery.data ?? false;
  const models = modelsQuery.data ?? [];
  const loras = lorasQuery.data ?? [];
  const queueStatus = queueQuery.data ?? { queueRunning: 0, queuePending: 0 };
  const isGenerating = generateMutation.isLoading;
  const progress = isGenerating ? 50 : 0; // TODO: Get real progress from API

  // Actualizar modo
  const setMode = useCallback((mode: GenerationMode) => {
    setParams((prev) => ({ ...prev, mode }));
  }, []);

  // Actualizar modelo
  const selectModel = useCallback((model: ComfyUIModel) => {
    setSelectedModel(model);
    setParams((prev) => ({ ...prev, model: model.id }));
  }, []);

  // Toggle LoRA
  const toggleLora = useCallback((lora: LoRA) => {
    setSelectedLoras((prev) => {
      const exists = prev.find((l) => l.id === lora.id);
      if (exists) {
        return prev.filter((l) => l.id !== lora.id);
      }
      return [...prev, { ...lora, strength: 1.0 }];
    });
  }, []);

  // Actualizar strength de LoRA
  const updateLoraStrength = useCallback((loraId: string, strength: number) => {
    setSelectedLoras((prev) =>
      prev.map((l) => (l.id === loraId ? { ...l, strength } : l))
    );
  }, []);

  // Actualizar parámetros
  const updateParam = useCallback(<K extends keyof ComfyUIParams>(
    key: K,
    value: ComfyUIParams[K]
  ) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Abrir/cerrar ventana
  const openWindow = useCallback(() => setIsWindowOpen(true), []);
  const closeWindow = useCallback(() => setIsWindowOpen(false), []);

  // Generar
  const generate = useCallback(async () => {
    if (!selectedModel || !params.prompt) {
      return;
    }

    try {
      const finalParams: ComfyUIParams = {
        ...params,
        model: selectedModel.id,
        loras: selectedLoras,
      };

      // Llamar al callback si existe
      if (onGenerate) {
        onGenerate(finalParams);
      }

      // Llamar al API
      const result = await generateMutation.mutateAsync(finalParams);

      // Agregar a generaciones recientes
      if (result.id) {
        const newGeneration: TGenerationItem = {
          id: result.id,
          type: 'image',
          status: 'queued',
          progress: 0,
          prompt: params.prompt,
          model: selectedModel.id,
          createdAt: new Date().toISOString(),
        };
        setRecentGenerations((prev) => [newGeneration, ...prev].slice(0, 10));

        // Notificar al callback
        if (onImageGenerated && result.id) {
          onImageGenerated('', result.id);
        }
      }

      return result;
    } catch (error) {
      console.error('[ComfyUI] Generation failed:', error);
      throw error;
    }
  }, [selectedModel, params, selectedLoras, onGenerate, onImageGenerated, generateMutation]);

  // Cancelar generación
  const cancel = useCallback(async (promptId: string) => {
    try {
      await cancelMutation.mutateAsync(promptId);
    } catch (error) {
      console.error('[ComfyUI] Cancel failed:', error);
    }
  }, [cancelMutation]);

  // Resetear
  const reset = useCallback(() => {
    setSelectedModel(undefined);
    setSelectedLoras([]);
    setParams({
      mode: DEFAULT_PARAMS.mode,
      loras: [],
      prompt: '',
      negativePrompt: DEFAULT_PARAMS.negativePrompt,
      steps: DEFAULT_PARAMS.steps,
      cfgScale: DEFAULT_PARAMS.cfgScale,
      width: DEFAULT_PARAMS.width,
      height: DEFAULT_PARAMS.height,
      batchSize: DEFAULT_PARAMS.batchSize,
    });
  }, []);

  // Verificar si está listo para generar
  const canGenerate = useMemo(() => {
    return !!selectedModel && !!params.prompt && !isGenerating && isConnected;
  }, [selectedModel, params.prompt, isGenerating, isConnected]);

  return {
    // Estado
    params,
    isWindowOpen,
    activeTab,
    isGenerating,
    progress,
    selectedModel,
    selectedLoras,
    canGenerate,
    isConnected,
    // Datos del servidor
    models,
    loras,
    queueStatus,
    recentGenerations,
    // Queries
    isLoadingModels: modelsQuery.isLoading,
    isLoadingLoras: lorasQuery.isLoading,
    modelsError: modelsQuery.error,
    lorasError: lorasQuery.error,
    // Acciones
    setMode,
    selectModel,
    toggleLora,
    updateLoraStrength,
    updateParam,
    openWindow,
    closeWindow,
    generate,
    cancel,
    reset,
    setActiveTab,
  };
}

export type UseComfyUIReturn = ReturnType<typeof useComfyUI>;
