/**
 * ComfyUI WebSocket Hook
 * =====================
 * 
 * Hook para manejar la conexión WebSocket con ComfyUI
 * y monitorear el progreso de generación en tiempo real.
 * 
 * Autor: Mi LibreChat
 * Version: 1.0.0
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// ============================================================================
// TYPES
// ============================================================================

export interface ComfyUIProgress {
  type: 'executing' | 'progress' | 'completed' | 'error';
  promptId: string;
  node?: string;
  progress?: number;
  value?: number;
  max?: number;
  percent?: number;
  output?: unknown;
  error?: string;
}

export interface UseComfyUIWebSocketOptions {
  /** Prompt ID para suscribirse */
  promptId?: string;
  /** Callback cuando cambia el progreso */
  onProgress?: (progress: ComfyUIProgress) => void;
  /** Callback cuando se completa */
  onComplete?: (result: unknown) => void;
  /** Callback cuando hay error */
  onError?: (error: string) => void;
  /** Auto conectar al montar */
  autoConnect?: boolean;
}

// ============================================================================
// HOOK
// ============================================================================

export function useComfyUIWebSocket({
  promptId,
  onProgress,
  onComplete,
  onError,
  autoConnect = true,
}: UseComfyUIWebSocketOptions = {}) {
  // State
  const [isConnected, setIsConnected] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<ComfyUIProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Refs
  const socketRef = useRef<Socket | null>(null);
  const promptIdRef = useRef<string | undefined>(promptId);
  
  // Keep promptId ref updated
  useEffect(() => {
    promptIdRef.current = promptId;
  }, [promptId]);
  
  // Connect to WebSocket
  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      return;
    }
    
    const socket = io('/comfyui', {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    
    socket.on('connect', () => {
      console.log('[ComfyUI WS] Connected');
      setIsConnected(true);
      setError(null);
      
      // Resubscribe to prompt if we have one
      if (promptIdRef.current) {
        socket.emit('subscribe', { promptId: promptIdRef.current });
      }
    });
    
    socket.on('disconnect', () => {
      console.log('[ComfyUI WS] Disconnected');
      setIsConnected(false);
    });
    
    socket.on('connect_error', (err: unknown) => {
      console.error('[ComfyUI WS] Connection error:', err);
      setError(err instanceof Error ? err.message : String(err));
    });
    
    // Progress events
    socket.on('executing', (data: ComfyUIProgress) => {
      console.log('[ComfyUI WS] Executing:', data);
      setCurrentProgress(data);
      onProgress?.(data);
    });
    
    socket.on('progress', (data: ComfyUIProgress) => {
      console.log('[ComfyUI WS] Progress:', data);
      setCurrentProgress(data);
      onProgress?.(data);
    });
    
    socket.on('completed', (data: ComfyUIProgress) => {
      console.log('[ComfyUI WS] Completed:', data);
      setCurrentProgress({ type: 'completed', promptId: data.promptId, output: data.output });
      onComplete?.(data.output);
    });
    
    socket.on('error', (data: ComfyUIProgress) => {
      console.error('[ComfyUI WS] Error:', data);
      setCurrentProgress({ type: 'error', promptId: data.promptId, error: data.error });
      setError(data.error || 'Unknown error');
      onError?.(data.error || 'Unknown error');
    });
    
    socketRef.current = socket;
  }, [onProgress, onComplete, onError]);
  
  // Disconnect
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      // Unsubscribe from current prompt
      if (promptIdRef.current) {
        socketRef.current.emit('unsubscribe', { promptId: promptIdRef.current });
      }
      
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  }, []);
  
  // Subscribe to prompt
  const subscribe = useCallback((newPromptId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe', { promptId: newPromptId });
      promptIdRef.current = newPromptId;
    }
  }, []);
  
  // Unsubscribe from prompt
  const unsubscribe = useCallback((targetPromptId?: string) => {
    const pid = targetPromptId || promptIdRef.current;
    if (socketRef.current?.connected && pid) {
      socketRef.current.emit('unsubscribe', { promptId: pid });
    }
  }, []);
  
  // Auto connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);
  
  // Subscribe to prompt when it changes
  useEffect(() => {
    if (isConnected && promptId) {
      subscribe(promptId);
    }
  }, [isConnected, promptId, subscribe]);
  
  // Return
  return {
    // State
    isConnected,
    currentProgress,
    progress: currentProgress?.percent ?? currentProgress?.progress ?? 0,
    error,
    
    // Actions
    connect,
    disconnect,
    subscribe,
    unsubscribe,
  };
}

export default useComfyUIWebSocket;
