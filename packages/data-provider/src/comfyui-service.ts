/**
 * ComfyUI Service
 * ================
 * Cliente para interactuar con el servidor ComfyUI
 * 
 * @example
 * import * as comfyui from './comfyui-service';
 * 
 * // Obtener modelos disponibles
 * const models = await comfyui.getModels();
 * 
 * // Generar imagen
 * const result = await comfyui.generate({
 *   mode: 'text2img',
 *   model: 'sdxl-base-1.0',
 *   prompt: 'a beautiful sunset',
 *   steps: 30,
 *   cfgScale: 7,
 *   width: 1024,
 *   height: 1024,
 *   loras: [],
 *   negativePrompt: 'blurry, low quality',
 * });
 */

import * as endpoints from './api-endpoints';
import request from './request';
import type {
  ComfyUIModel,
  LoRA,
  ComfyUIParams,
  ComfyUIGeneration,
  ComfyUIQueueResponse,
  ComfyUIHistoryResponse,
  ComfyUIModelsResponse,
  ComfyUILoRAsResponse,
  ComfyUISystemStatsResponse,
} from './types/comfyui';

/** Obtiene la lista de modelos disponibles en ComfyUI */
export async function getModels(): Promise<ComfyUIModel[]> {
  try {
    const response = await request.get<ComfyUIModelsResponse>(endpoints.comfyuiModels());
    return response?.models ?? [];
  } catch (error) {
    console.error('[ComfyUI] Failed to get models:', error);
    return [];
  }
}

/** Obtiene la lista de LoRAs disponibles */
export async function getLoRAs(): Promise<LoRA[]> {
  try {
    const response = await request.get<ComfyUILoRAsResponse>(endpoints.comfyuiLoras());
    return response?.loras ?? [];
  } catch (error) {
    console.error('[ComfyUI] Failed to get LoRAs:', error);
    return [];
  }
}

/** Obtiene el estado de la cola de ComfyUI */
export async function getQueueStatus(): Promise<ComfyUIQueueResponse> {
  try {
    const response = await request.get<ComfyUIQueueResponse>(endpoints.comfyuiQueue());
    return response;
  } catch (error) {
    console.error('[ComfyUI] Failed to get queue status:', error);
    return { queueRunning: 0, queuePending: 0 };
  }
}

/** Obtiene el historial de generaciones */
export async function getHistory(promptId?: string): Promise<ComfyUIHistoryResponse> {
  try {
    const url = promptId 
      ? endpoints.comfyuiHistory(promptId) 
      : endpoints.comfyuiHistory();
    const response = await request.get<ComfyUIHistoryResponse>(url);
    return response;
  } catch (error) {
    console.error('[ComfyUI] Failed to get history:', error);
    return {};
  }
}

/** Obtiene estadísticas del sistema ComfyUI */
export async function getSystemStats(): Promise<ComfyUISystemStatsResponse | null> {
  try {
    const response = await request.get<ComfyUISystemStatsResponse>(endpoints.comfyuiSystemStats());
    return response;
  } catch (error) {
    console.error('[ComfyUI] Failed to get system stats:', error);
    return null;
  }
}

/** Genera una imagen o video usando ComfyUI */
export async function generate(params: ComfyUIParams): Promise<ComfyUIGeneration> {
  try {
    const response = (await request.post(endpoints.comfyuiGenerate(), {
      ...params,
      // Ensure defaults
      steps: params.steps ?? 30,
      cfgScale: params.cfgScale ?? 7,
      width: params.width ?? 1024,
      height: params.height ?? 1024,
      batchSize: params.batchSize ?? 1,
      negativePrompt: params.negativePrompt ?? '',
      loras: params.loras ?? [],
    })) as ComfyUIGeneration;
    return response;
  } catch (error) {
    console.error('[ComfyUI] Failed to generate:', error);
    return {
      id: '',
      status: 'failed',
      error: error instanceof Error ? error.message : 'Generation failed',
      createdAt: new Date().toISOString(),
    };
  }
}

/** Cancela una generación en progreso */
export async function cancelGeneration(promptId: string): Promise<boolean> {
  try {
    await request.delete(endpoints.comfyuiCancel(promptId));
    return true;
  } catch (error) {
    console.error('[ComfyUI] Failed to cancel generation:', error);
    return false;
  }
}

/** Limpia la cola de generaciones */
export async function clearQueue(): Promise<boolean> {
  try {
    await request.delete(endpoints.comfyuiClearQueue());
    return true;
  } catch (error) {
    console.error('[ComfyUI] Failed to clear queue:', error);
    return false;
  }
}

/** Obtiene el estado de conexión con ComfyUI */
export async function checkConnection(): Promise<boolean> {
  try {
    await request.get(endpoints.comfyuiPing());
    return true;
  } catch {
    return false;
  }
}

/** Descarga una imagen generada */
export async function getOutputImage(filename: string): Promise<string | null> {
  try {
    const response = await request.getResponse<{ data: ArrayBuffer; headers: Record<string, string> }>(
      endpoints.comfyuiOutput(filename),
      { responseType: 'arraybuffer' },
    );
    const base64 = Buffer.from(response.data).toString('base64');
    const contentType = response.headers['content-type'] ?? 'image/png';
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error('[ComfyUI] Failed to get output image:', error);
    return null;
  }
}

/** Obtiene la miniatura de previsualización */
export async function getPreviewImage(promptId: string): Promise<string | null> {
  try {
    const response = await request.getResponse<{ data: ArrayBuffer }>(
      endpoints.comfyuiPreview(promptId),
      { responseType: 'arraybuffer' },
    );
    const base64 = Buffer.from(response.data).toString('base64');
    return `data:image/png;base64,${base64}`;
  } catch (error) {
    console.error('[ComfyUI] Failed to get preview image:', error);
    return null;
  }
}
