import { useMutation } from '@tanstack/react-query';
import { dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

/**
 * Generates a proposed multi-agent plan for a natural-language task.
 * Read-only on the server: nothing is created until useApplyAgentPlanMutation
 * is called with the (possibly edited) plan.
 */
export const usePlanAgentTaskMutation = (options?: {
  onSuccess?: (data: t.ArchitectPlanResponse) => void;
  onError?: (error: Error) => void;
}): UseMutationResult<t.ArchitectPlanResponse, Error, { task: string }> => {
  return useMutation((body: { task: string }) => dataService.planAgentTask(body), {
    onSuccess: (data) => options?.onSuccess?.(data),
    onError: (error: Error) => options?.onError?.(error),
  });
};

/**
 * Creates the agents described by a plan. If the server responds 409 with
 * `pending_confirmation`, the caller must re-invoke with those capability
 * names included in `confirmed_installs` (the UI surfaces this as a confirm
 * dialog before installing any new skill/plugin, even in automatic mode).
 */
export const useApplyAgentPlanMutation = (options?: {
  onSuccess?: (data: t.ArchitectApplyResponse) => void;
  onError?: (error: Error) => void;
}): UseMutationResult<
  t.ArchitectApplyResponse,
  Error,
  { plan: t.ArchitectPlan; confirmed_installs?: string[] }
> => {
  return useMutation(
    (body: { plan: t.ArchitectPlan; confirmed_installs?: string[] }) =>
      dataService.applyAgentPlan(body),
    {
      onSuccess: (data) => options?.onSuccess?.(data),
      onError: (error: Error) => options?.onError?.(error),
    },
  );
};
