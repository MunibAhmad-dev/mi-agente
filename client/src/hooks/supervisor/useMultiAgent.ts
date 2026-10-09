/**
 * useMultiAgent Hooks
 *
 * Hooks de React para el sistema multi-agente
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = '/api/multiagent';

// ============ Sessions ============

export function useListSessions() {
  return useQuery({
    queryKey: ['multiagent', 'sessions'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/sessions`);
      if (!response.ok) throw new Error('Failed to fetch sessions');
      return response.json();
    },
  });
}

export function useGetSession(sessionId: string) {
  return useQuery({
    queryKey: ['multiagent', 'sessions', sessionId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/sessions/${sessionId}`);
      if (!response.ok) throw new Error('Failed to fetch session');
      return response.json();
    },
    enabled: !!sessionId,
    refetchInterval: 3000,
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name?: string;
      description?: string;
      config?: Record<string, unknown>;
    }) => {
      const response = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create session');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['multiagent', 'sessions'] });
    },
  });
}

export function usePauseSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await fetch(`${API_BASE}/sessions/${sessionId}/pause`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to pause session');
      return response.json();
    },
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['multiagent', 'sessions', sessionId] });
    },
  });
}

export function useResumeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await fetch(`${API_BASE}/sessions/${sessionId}/resume`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to resume session');
      return response.json();
    },
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['multiagent', 'sessions', sessionId] });
    },
  });
}

export function useDestroySession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await fetch(`${API_BASE}/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to destroy session');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['multiagent', 'sessions'] });
    },
  });
}

// ============ Agents ============

export function useGetSessionAgents(sessionId: string) {
  return useQuery({
    queryKey: ['multiagent', 'sessions', sessionId, 'agents'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/sessions/${sessionId}/agents`);
      if (!response.ok) throw new Error('Failed to fetch agents');
      return response.json();
    },
    enabled: !!sessionId,
    refetchInterval: 2000,
  });
}

export function useAddAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      type,
      name,
      config,
    }: {
      sessionId: string;
      type?: string;
      name?: string;
      config?: Record<string, unknown>;
    }) => {
      const response = await fetch(`${API_BASE}/sessions/${sessionId}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name, config }),
      });
      if (!response.ok) throw new Error('Failed to add agent');
      return response.json();
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['multiagent', 'sessions', sessionId, 'agents'] });
    },
  });
}

export function useStartAgent() {
  return useMutation({
    mutationFn: async (agentId: string) => {
      const response = await fetch(`${API_BASE}/agents/${agentId}/start`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to start agent');
      return response.json();
    },
  });
}

export function usePauseAgent() {
  return useMutation({
    mutationFn: async (agentId: string) => {
      const response = await fetch(`${API_BASE}/agents/${agentId}/pause`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to pause agent');
      return response.json();
    },
  });
}

export function useResumeAgent() {
  return useMutation({
    mutationFn: async (agentId: string) => {
      const response = await fetch(`${API_BASE}/agents/${agentId}/resume`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to resume agent');
      return response.json();
    },
  });
}

export function useStopAgent() {
  return useMutation({
    mutationFn: async (agentId: string) => {
      const response = await fetch(`${API_BASE}/agents/${agentId}/stop`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to stop agent');
      return response.json();
    },
  });
}

// ============ Tasks ============

export function useGetSessionTasks(sessionId: string, status?: string) {
  return useQuery({
    queryKey: ['multiagent', 'sessions', sessionId, 'tasks', { status }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);

      const response = await fetch(
        `${API_BASE}/sessions/${sessionId}/tasks?${params}`
      );
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
    enabled: !!sessionId,
    // FASE 5 → UI: polling para que el contexto ensamblado (memorias/RAG
    // usadas, tokens, descartes) aparezca en vivo durante y tras la ejecución.
    refetchInterval: 2000,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      agentId,
      title,
      description,
      priority,
      context,
    }: {
      sessionId: string;
      agentId?: string;
      title: string;
      description?: string;
      priority?: number;
      context?: Record<string, unknown>;
    }) => {
      const response = await fetch(`${API_BASE}/sessions/${sessionId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, title, description, priority, context }),
      });
      if (!response.ok) throw new Error('Failed to create task');
      return response.json();
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['multiagent', 'sessions', sessionId, 'tasks'] });
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, result }: { taskId: string; result?: unknown }) => {
      const response = await fetch(`${API_BASE}/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result }),
      });
      if (!response.ok) throw new Error('Failed to complete task');
      return response.json();
    },
  });
}

export function useFailTask() {
  return useMutation({
    mutationFn: async ({ taskId, error }: { taskId: string; error: string }) => {
      const response = await fetch(`${API_BASE}/tasks/${taskId}/fail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error }),
      });
      if (!response.ok) throw new Error('Failed to fail task');
      return response.json();
    },
  });
}
