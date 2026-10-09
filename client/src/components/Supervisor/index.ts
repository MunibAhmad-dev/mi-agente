/**
 * Supervisor Components
 *
 * Sistema de supervisión de agentes IA
 * Nota (Fase 9): se eliminaron SupervisorPanel/ActivityFeed/Timeline/Permissions
 * porque dependían de /api/supervisor cuyo backend tenía models inexistentes.
 * Los paneles con backend real (MultiAgentPanel -> /api/multiagent,
 * Sandbox -> /api/sandbox) se conservan y se enrutan en /supervisor.
 */

// Sandbox
export {
  SandboxPanel,
  SandboxTerminal,
  SandboxFileTree,
  SandboxPreview,
  SandboxChanges,
} from './Sandbox';

// DiffViewer
export { default as DiffViewer } from './DiffViewer';

// PromotionWorkflow
export { default as PromotionWorkflow } from './PromotionWorkflow';

// MultiAgentPanel
export { default as MultiAgentPanel } from './MultiAgentPanel';

// BrowserPreview
export { default as BrowserPreview } from './BrowserPreview';
