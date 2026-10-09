/**
 * useExecutiveLoop — React hook for Face 8 Executive AI Loop.
 *
 * Handles the upgraded 12-phase pipeline:
 *   classify → decompose → direct → plan → taskgraph → policy →
 *   execute (parallel) → verify → critic → checkpoint → memory → complete
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export type LoopPhase =
  | 'idle'
  | 'classifying' | 'classified'
  | 'decomposed'
  | 'directing'   | 'directed'
  | 'planning'    | 'planned'
  | 'executing'   | 'step_done' | 'step_blocked'
  | 'verifying'
  | 'complete'
  | 'error';

export interface LoopStep {
  index: number;
  name: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'partial' | 'fallback' | 'blocked';
  quality: number | null;
  riskLevel: number | null;
  parallel: boolean;
  criticNotes: string[] | null;
  provider: string | null;
}

export interface GoalDecomposition {
  subgoals: string[];
  constraints: string[];
  successCriteria: string[];
  complexity: 'low' | 'medium' | 'high';
}

export interface SuccessCriterion {
  criterion: string;
  met: boolean;
}

export interface LoopState {
  phase: LoopPhase;
  intent: string | null;
  confidence: number | null;
  approach: string | null;
  steps: LoopStep[];
  currentStepIndex: number | null;
  quality: number | null;
  summary: string | null;
  error: string | null;
  isRunning: boolean;
  goal: GoalDecomposition | null;
  successCriteriaResults: SuccessCriterion[];
  stepsTotal: number;
  stepsDone: number;
  stepsFailed: number;
}

const INITIAL_STATE: LoopState = {
  phase: 'idle',
  intent: null,
  confidence: null,
  approach: null,
  steps: [],
  currentStepIndex: null,
  quality: null,
  summary: null,
  error: null,
  isRunning: false,
  goal: null,
  successCriteriaResults: [],
  stepsTotal: 0,
  stepsDone: 0,
  stepsFailed: 0,
};

export function useExecutiveLoop() {
  const [state, setState] = useState<LoopState>(INITIAL_STATE);
  const esRef = useRef<EventSource | null>(null);

  const close = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  useEffect(() => () => close(), [close]);

  const start = useCallback(async (message: string) => {
    close();
    setState({ ...INITIAL_STATE, phase: 'classifying', isRunning: true });

    try {
      const resp = await fetch('/api/executive-loop/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const { sessionId } = await resp.json();

      const es = new EventSource(`/api/executive-loop/stream/${sessionId}`);
      esRef.current = es;

      es.onmessage = (e) => {
        if (!e.data || e.data.startsWith(':')) return;
        let event: Record<string, unknown>;
        try { event = JSON.parse(e.data); } catch { return; }
        const phase = event.phase as LoopPhase;

        setState((prev) => {
          const next: LoopState = { ...prev, phase };

          switch (phase) {
            case 'classified':
              next.intent = event.intent as string;
              next.confidence = event.confidence as number;
              break;

            case 'decomposed':
              next.goal = {
                subgoals: (event.subgoals as string[]) || [],
                constraints: (event.constraints as string[]) || [],
                successCriteria: (event.successCriteria as string[]) || [],
                complexity: (event.complexity as GoalDecomposition['complexity']) || 'medium',
              };
              break;

            case 'directed':
              next.approach = event.approach as string;
              break;

            case 'planned': {
              // Steps arrive from planned event (with initial risk info)
              const rawSteps = (event.steps as Array<Record<string, unknown>>) || [];
              next.steps = rawSteps.map((s) => ({
                index: s.index as number,
                name: s.name as string,
                status: 'pending' as const,
                quality: null,
                riskLevel: (s.riskLevel as number | null) ?? null,
                parallel: (s.parallel as boolean) || false,
                criticNotes: null,
                provider: null,
              }));
              next.stepsTotal = next.steps.length;
              break;
            }

            case 'executing':
              next.currentStepIndex = event.stepIndex as number;
              next.steps = prev.steps.map((s) =>
                s.index === (event.stepIndex as number)
                  ? {
                      ...s,
                      status: 'running' as const,
                      riskLevel: (event.riskLevel as number) ?? s.riskLevel,
                      parallel: (event.parallel as boolean) ?? s.parallel,
                    }
                  : s,
              );
              break;

            case 'step_done':
              next.steps = prev.steps.map((s) => {
                if (s.index !== (event.stepIndex as number)) return s;
                const passed = event.passed as boolean;
                const fallback = event.fallback as boolean;
                return {
                  ...s,
                  status: (
                    s.status === 'blocked' ? 'blocked'
                    : passed ? 'done'
                    : fallback ? 'fallback'
                    : 'failed'
                  ) as LoopStep['status'],
                  quality: event.quality as number,
                  riskLevel: (event.riskLevel as number) ?? s.riskLevel,
                  parallel: (event.parallel as boolean) ?? s.parallel,
                  criticNotes: (event.criticNotes as string[]) || null,
                  provider: (event.provider as string) || null,
                };
              });
              next.stepsDone = next.steps.filter((s) => s.status === 'done' || s.status === 'partial' || s.status === 'fallback').length;
              next.stepsFailed = next.steps.filter((s) => s.status === 'failed').length;
              break;

            case 'step_blocked':
              next.steps = prev.steps.map((s) =>
                s.index === (event.stepIndex as number) ? { ...s, status: 'blocked' as const } : s,
              );
              break;

            case 'complete':
              next.quality = event.quality as number;
              next.summary = event.summary as string;
              next.stepsTotal = (event.stepsTotal as number) || prev.stepsTotal;
              next.stepsDone = (event.stepsDone as number) || prev.stepsDone;
              next.stepsFailed = (event.stepsFailed as number) || prev.stepsFailed;
              next.successCriteriaResults = (event.successCriteriaResults as SuccessCriterion[]) || [];
              next.isRunning = false;
              es.close();
              break;

            case 'error':
              next.error = event.message as string;
              next.isRunning = false;
              es.close();
              break;
          }

          return next;
        });
      };

      es.onerror = () => {
        setState((prev) => ({ ...prev, isRunning: false, error: 'Stream disconnected' }));
        es.close();
      };
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
        isRunning: false,
      }));
    }
  }, [close]);

  const reset = useCallback(() => {
    close();
    setState(INITIAL_STATE);
  }, [close]);

  return { state, start, reset };
}
