/**
 * ExecutiveLoopPanel — Face 8: Executive AI Loop progress panel.
 *
 * Shows the full 12-phase pipeline:
 *   Intent → Goal Decomposition → Approach → TaskGraph (with risk badges + parallel) →
 *   Per-step quality → Critic notes → Success criteria
 */

import React, { useState } from 'react';
import {
  Brain, Loader2, CheckCircle2, XCircle, Clock, Zap,
  Shield, AlertTriangle, GitBranch, ChevronDown, ChevronRight,
} from 'lucide-react';
import { cn } from '~/utils';
import type { LoopState, LoopStep, GoalDecomposition, SuccessCriterion } from '~/hooks/useExecutiveLoop';

interface Props { state: LoopState; className?: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const INTENT_META: Record<string, { label: string; color: string }> = {
  simple_query:     { label: 'Quick Answer',    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  research_request: { label: 'Research',         color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  multi_step_task:  { label: 'Multi-step Task',  color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  code_task:        { label: 'Code Task',        color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
};

const APPROACH_LABELS: Record<string, string> = {
  direct_answer:    'Direct',
  research_first:   'Research → Synthesize',
  plan_and_execute: 'Plan → Execute',
  code_pipeline:    'Plan → Code → Verify',
};

// Risk level → display
const RISK_META: Record<number, { label: string; color: string; icon: React.ReactNode }> = {
  0: { label: 'R0', color: 'text-gray-400', icon: <Shield size={9} /> },
  1: { label: 'R1', color: 'text-green-500', icon: <Shield size={9} /> },
  2: { label: 'R2', color: 'text-green-600', icon: <Shield size={9} /> },
  3: { label: 'R3', color: 'text-yellow-500', icon: <AlertTriangle size={9} /> },
  4: { label: 'R4', color: 'text-orange-500', icon: <AlertTriangle size={9} /> },
  5: { label: 'R5', color: 'text-red-500',    icon: <AlertTriangle size={9} /> },
  6: { label: 'R6', color: 'text-red-600',    icon: <AlertTriangle size={9} /> },
  7: { label: 'R7', color: 'text-red-700',    icon: <XCircle size={9} /> },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: number | null }) {
  if (level === null) return null;
  const meta = RISK_META[level] ?? RISK_META[1];
  return (
    <span className={cn('flex items-center gap-0.5 text-[10px] font-mono opacity-70', meta.color)}>
      {meta.icon}{meta.label}
    </span>
  );
}

function StepRow({ step, isCurrent }: { step: LoopStep; isCurrent: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn('flex flex-col rounded-sm transition-colors', isCurrent && 'bg-blue-50/60 dark:bg-blue-950/20')}>
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Status icon */}
        <span className="w-4 flex items-center justify-center shrink-0">
          {step.status === 'pending'  && <Clock size={13} className="text-gray-300" />}
          {step.status === 'running'  && <Loader2 size={13} className="text-blue-500 animate-spin" />}
          {step.status === 'done'     && <CheckCircle2 size={13} className="text-green-500" />}
          {step.status === 'partial'  && <CheckCircle2 size={13} className="text-yellow-500" />}
          {step.status === 'fallback' && <CheckCircle2 size={13} className="text-gray-400" />}
          {step.status === 'failed'   && <XCircle size={13} className="text-red-500" />}
          {step.status === 'blocked'  && <XCircle size={13} className="text-red-700" />}
        </span>

        {/* Parallel indicator */}
        {step.parallel && (
          <GitBranch size={10} className="shrink-0 text-blue-400" />
        )}

        {/* Step name */}
        <span className={cn('flex-1 text-xs truncate',
          step.status === 'done'     && 'text-gray-500 dark:text-gray-400',
          step.status === 'running'  && 'font-medium text-blue-700 dark:text-blue-300',
          step.status === 'failed'   && 'text-red-600 dark:text-red-400 line-through',
          step.status === 'blocked'  && 'text-red-700 dark:text-red-300 line-through',
          step.status === 'fallback' && 'text-gray-400',
          step.status === 'pending'  && 'text-gray-400',
        )}>
          {step.name}
        </span>

        {/* Risk badge */}
        <RiskBadge level={step.riskLevel} />

        {/* Quality badge */}
        {step.quality !== null && (
          <span className={cn('text-[10px] font-mono px-1 py-0.5 rounded',
            step.quality >= 0.8 ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
            : step.quality >= 0.6 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
            : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
          )}>
            {Math.round(step.quality * 100)}%
          </span>
        )}

        {/* Expand critic notes */}
        {step.criticNotes && step.criticNotes.length > 0 && (
          <button onClick={() => setExpanded((v) => !v)} className="text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        )}
      </div>

      {/* Critic notes (expandable) */}
      {expanded && step.criticNotes && (
        <div className="px-9 pb-2 flex flex-col gap-0.5">
          {step.criticNotes.map((note, i) => (
            <p key={i} className="text-[10px] text-orange-600 dark:text-orange-400">⚠ {note}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function GoalSection({ goal }: { goal: GoalDecomposition }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border border-gray-100 dark:border-gray-800 text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span className="text-[10px] uppercase tracking-wider font-semibold">Goal decomposition</span>
        <span className={cn('ml-auto text-[10px] px-1.5 rounded-full',
          goal.complexity === 'high' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
          : goal.complexity === 'medium' ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
          : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
        )}>
          {goal.complexity}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2 flex flex-col gap-1.5 border-t border-gray-100 dark:border-gray-800 pt-1.5">
          {goal.subgoals.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 mb-0.5">Sub-goals</p>
              {goal.subgoals.map((g, i) => (
                <p key={i} className="text-[10px] text-gray-600 dark:text-gray-400 truncate">· {g}</p>
              ))}
            </div>
          )}
          {goal.constraints.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-amber-500 mb-0.5">Constraints</p>
              {goal.constraints.map((c, i) => (
                <p key={i} className="text-[10px] text-amber-600 dark:text-amber-400">⚡ {c}</p>
              ))}
            </div>
          )}
          {goal.successCriteria.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-green-500 mb-0.5">Success criteria</p>
              {goal.successCriteria.map((c, i) => (
                <p key={i} className="text-[10px] text-green-600 dark:text-green-400">✓ {c}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SuccessCriteriaResults({ results }: { results: SuccessCriterion[] }) {
  if (!results.length) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 px-1">Success criteria</p>
      {results.map((r, i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-0.5 text-[10px]">
          {r.met
            ? <CheckCircle2 size={10} className="text-green-500 shrink-0" />
            : <XCircle size={10} className="text-red-400 shrink-0" />}
          <span className={r.met ? 'text-gray-600 dark:text-gray-400' : 'text-red-500'}>{r.criterion}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export function ExecutiveLoopPanel({ state, className }: Props) {
  const { phase, intent, confidence, approach, steps, quality, summary, error, isRunning, goal, successCriteriaResults, stepsTotal, stepsDone, stepsFailed } = state;

  if (phase === 'idle') {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-3 p-8 text-center', className)}>
        <Brain size={32} className="text-gray-300 dark:text-gray-600" />
        <p className="text-sm text-gray-400 dark:text-gray-500">Send a message to see the AI loop in action.</p>
        <p className="text-[10px] text-gray-300 dark:text-gray-700">
          Intent → Plan → TaskGraph → Policy → Execute → Verify → Critic
        </p>
      </div>
    );
  }

  const intentMeta = intent ? INTENT_META[intent] : null;
  const runningSteps = steps.filter((s) => s.status === 'running');
  const parallelCount = runningSteps.filter((s) => s.parallel).length;

  return (
    <div className={cn('flex flex-col gap-2.5 p-3 text-sm', className)}>

      {/* Header */}
      <div className="flex items-center gap-2">
        <Brain size={13} className="text-blue-500 shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
          Executive Loop
        </span>
        {isRunning && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-blue-500">
            <Zap size={10} />
            {parallelCount > 1 ? `${parallelCount} parallel` : 'Running'}
          </span>
        )}
        {phase === 'complete' && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-green-500">
            <CheckCircle2 size={10} /> Done
          </span>
        )}
      </div>

      {/* Intent + Approach badges */}
      {(intentMeta || approach) && (
        <div className="flex flex-wrap gap-1.5 items-center">
          {intentMeta && (
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', intentMeta.color)}>
              {intentMeta.label}
            </span>
          )}
          {approach && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              {APPROACH_LABELS[approach] ?? approach}
            </span>
          )}
          {confidence !== null && (
            <span className="text-[10px] text-gray-400 ml-auto">{Math.round(confidence * 100)}% conf</span>
          )}
        </div>
      )}

      {/* Goal decomposition */}
      {goal && <GoalSection goal={goal} />}

      {/* Phase status */}
      {isRunning && (phase === 'classifying' || phase === 'directing' || phase === 'planning' || phase === 'verifying') && (
        <div className="flex items-center gap-1.5 text-[10px] text-blue-500 px-1">
          <Loader2 size={10} className="animate-spin" />
          {{
            classifying: 'Understanding request…',
            directing:   'Deciding approach…',
            planning:    'Building task graph…',
            verifying:   'Checking output quality…',
          }[phase]}
        </div>
      )}

      {/* Progress counter */}
      {stepsTotal > 0 && (stepsDone > 0 || stepsFailed > 0) && (
        <div className="flex items-center gap-2 text-[10px] text-gray-400 px-1">
          <span className="text-green-500">{stepsDone}✓</span>
          {stepsFailed > 0 && <span className="text-red-500">{stepsFailed}✗</span>}
          <span>/ {stepsTotal} steps</span>
          {parallelCount > 1 && (
            <span className="flex items-center gap-0.5 text-blue-400">
              <GitBranch size={9} /> {parallelCount} parallel
            </span>
          )}
        </div>
      )}

      {/* Steps */}
      {steps.length > 0 && (
        <div className="flex flex-col gap-0.5 rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
          {steps.map((step) => (
            <StepRow key={step.index} step={step} isCurrent={step.status === 'running'} />
          ))}
        </div>
      )}

      {/* Success criteria */}
      {phase === 'complete' && successCriteriaResults.length > 0 && (
        <SuccessCriteriaResults results={successCriteriaResults} />
      )}

      {/* Final summary */}
      {phase === 'complete' && summary && (
        <div className={cn('rounded-md px-3 py-2 text-xs flex items-center gap-2',
          (quality ?? 0) >= 0.6
            ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300'
            : 'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-300',
        )}>
          <CheckCircle2 size={12} className="shrink-0" />
          {summary}
          {quality !== null && (
            <span className="ml-auto font-mono font-medium">{Math.round(quality * 100)}%</span>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md px-3 py-2 text-xs bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 flex items-center gap-2">
          <XCircle size={12} className="shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

export default ExecutiveLoopPanel;
