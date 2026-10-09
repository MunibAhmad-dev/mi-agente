/**
 * Supervisor Route — Face 8 (Executive AI Loop) + Multi-Agent + Sandbox
 *
 * Mounted panels (all have real backend routes):
 *  - MissionControl   -> /api/executive-loop (Face 8 pipeline)
 *  - MultiAgentPanel  -> /api/multiagent
 *  - SandboxPanel     -> /api/sandbox
 */
import React from 'react';
import MultiAgentPanel from '~/components/Supervisor/MultiAgentPanel';
import SandboxPanel from '~/components/Supervisor/Sandbox/SandboxPanel';
import { MissionControl } from '~/components/Chat/ActivityPanel';

export default function Supervisor() {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="border-b border-black/10 pb-2 dark:border-white/10">
        <h1 className="text-xl font-semibold">Supervisor</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Executive AI Loop · Multi-agent sessions · Code sandbox
        </p>
      </div>

      {/* Face 8 — Executive AI Loop (Mission Control) */}
      <div className="rounded-lg border border-black/10 dark:border-white/10">
        <div className="border-b border-black/10 px-3 py-2 dark:border-white/10">
          <h2 className="text-sm font-semibold">Executive AI Loop — Face 8</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Intent → Director → Planner → Execute → Verify
          </p>
        </div>
        <div className="p-3">
          <MissionControl defaultPanel="loop" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
          <h2 className="mb-2 text-sm font-semibold">Multi-Agent</h2>
          <MultiAgentPanel />
        </div>
        <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
          <h2 className="mb-2 text-sm font-semibold">Sandbox</h2>
          <SandboxPanel />
        </div>
      </div>
    </div>
  );
}
