/**
 * Agent Runtime hooks — react-query wrappers sobre dataService.
 * Consumen los endpoints /api/tools y /api/agent-runtime/* expuestos en FASE A.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type {
  AgentRuntimeToolsResponse,
  AgentRuntimeTrace,
  AgentRuntimeOptimization,
} from 'librechat-data-provider';

export const useAgentRuntimeTools = () =>
  useQuery<AgentRuntimeToolsResponse>([QueryKeys.agentRuntimeTools], () =>
    dataService.getAgentRuntimeTools(),
  );

export const useToggleAgentRuntimeTool = () => {
  const qc = useQueryClient();
  return useMutation(
    ({ id, enabled }: { id: string; enabled: boolean }) =>
      dataService.patchAgentRuntimeTool(id, enabled),
    {
      onSuccess: () => qc.invalidateQueries([QueryKeys.agentRuntimeTools]),
    },
  );
};

export const useAgentRuntimeTraces = () =>
  useQuery<{ success: boolean; traces: AgentRuntimeTrace[] }>(
    [QueryKeys.agentRuntimeTraces],
    () => dataService.getAgentRuntimeTraces(),
    { refetchInterval: 5000 },
  );

export const useAgentRuntimeOptimization = () =>
  useQuery<{ success: boolean; recommendation: AgentRuntimeOptimization }>(
    [QueryKeys.agentRuntimeOptimization],
    () => dataService.getAgentRuntimeOptimization(),
  );

export const useAgentRuntimeMemory = (query?: string) =>
  useQuery<{ success: boolean; entries: unknown[] }>(
    [QueryKeys.agentRuntimeMemory, query ?? ''],
    () => dataService.getAgentRuntimeMemory(query),
  );

export const useAgentRuntimeMemoryStats = () =>
  useQuery<{ success: boolean; stats: unknown }>([QueryKeys.agentRuntimeMemory, 'stats'], () =>
    dataService.getAgentRuntimeMemoryStats(),
  );

export const useCreateAgentRuntimeMemory = () => {
  const qc = useQueryClient();
  return useMutation(
    (entry: Record<string, unknown>) => dataService.createAgentRuntimeMemory(entry),
    {
      onSuccess: () => {
        qc.invalidateQueries([QueryKeys.agentRuntimeMemory]);
      },
    },
  );
};

export const useDeleteAgentRuntimeMemory = () => {
  const qc = useQueryClient();
  return useMutation((id: string) => dataService.deleteAgentRuntimeMemory(id), {
    onSuccess: () => {
      qc.invalidateQueries([QueryKeys.agentRuntimeMemory]);
    },
  });
};

export const useAgentRuntimeSubagentRoles = () =>
  useQuery<{ success: boolean; roles: unknown[] }>([QueryKeys.agentRuntimeSubagents], () =>
    dataService.getAgentRuntimeSubagentRoles(),
  );

export const useDispatchAgentRuntimeSubagent = () => {
  const qc = useQueryClient();
  return useMutation(
    (payload: { role: string; task: string; context?: unknown }) =>
      dataService.dispatchAgentRuntimeSubagent(payload),
    {
      onSuccess: () => qc.invalidateQueries([QueryKeys.agentRuntimeSubagents]),
    },
  );
};

export const useApplyAgentRuntimeOptimization = () => {
  const qc = useQueryClient();
  return useMutation(
    (config: Record<string, unknown>) => dataService.applyAgentRuntimeOptimization(config),
    {
      onSuccess: () => qc.invalidateQueries([QueryKeys.agentRuntimeOptimization]),
    },
  );
};
