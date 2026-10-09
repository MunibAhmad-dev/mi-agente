/**
 * MissionControl Configuration
 *
 * Configuración centralizada para Mission Control
 */

import {
  Activity,
  Brain,
  BrainCircuit,
  Clock,
  Database,
  Eye,
  HeartPulse,
  Key,
  Layers,
  Network,
  Users,
  Wrench,
  FileEdit,
  BarChart3,
  Globe,
  Terminal,
  Cpu,
  ShieldCheck,
  DollarSign,
  Sparkles,
  Package,
  Settings,
  GraduationCap,
  Shield,
  Zap,
  ScrollText,
  Film,
} from 'lucide-react';

/**
 * Tipos de panel en Mission Control
 */
export type MissionControlPanel =
  | 'overview' // Vista general unificada
  | 'agents' // Control de agentes
  | 'activity' // Activity Center
  | 'timeline' // Timeline
  | 'changes' // Cambios de archivos
  | 'metrics' // Métricas y estadísticas
  | 'settings' // Configuración del agente
  | 'subagents' // Subagents y router adaptativo
  | 'loop' // Executive AI Loop (Face 8)
  | 'research' // Autonomous Research (Part 10)
  | 'memory' // Memory viewer (p2-5)
  | 'health' // Runtime health dashboard (p2-7)
  | 'harness' // HarnessManager live status (Face 14)
  | 'observability' // Agent traces — m-2
  | 'llm' // LLM provider & key management (Face 13)
  | 'training' // Agent training & self-improvement (Face 16)
  | 'security' // Security scanner & self-repair (Face 11)
  | 'skills-discovery' // Skills discovery, install & auto-match (Face 15)
  | 'knowledge' // Knowledge Base — RAG collections, index, search (Face 22)
  | 'orchestrator' // Multi-agent session orchestrator (Face 8)
  | 'performance' // System performance & benchmarks (Face 12)
  | 'case-intelligence' // Reputation case management (Face 20)
  | 'agent-analysis' // Agent capability reverse-engineering (Face 21)
  | 'constitution' // Agent Constitution / master system prompt (Face 7)
  | 'cognitive' // Universal Cognitive System — memory, RAG, learning, skills (Face 17)
  | 'creative' // Creative Engine — video + music generation (Face 22-23)
  | 'visual' // Visual Intelligence & Visual Software Engineering (Face 9)
  | 'model-browser'; // Hardware model browser — VRAM/RAM/CPU viability (Face 13)

/**
 * Subtipo de actividad
 */
export type ActivitySubTab =
  | 'tools'
  | 'catalog'
  | 'cost'
  | 'skills'
  | 'artifacts'
  | 'terminal'
  | 'browser'
  | 'processes';

/**
 * Configuración de tabs principales
 */
export interface TabConfig {
  id: MissionControlPanel;
  label: string;
  icon: React.ElementType;
  description: string;
}

export const MISSION_CONTROL_TABS: TabConfig[] = [
  { id: 'overview', label: 'Overview', icon: Activity, description: 'Vista general' },
  { id: 'loop', label: 'AI Loop', icon: Brain, description: 'Executive AI Loop — Face 8' },
  { id: 'research', label: 'Research', icon: Globe, description: 'Autonomous Research — Part 10' },
  { id: 'memory', label: 'Memory', icon: Database, description: 'Stored memories viewer' },
  { id: 'health', label: 'Health', icon: HeartPulse, description: 'Runtime health dashboard' },
  { id: 'harness', label: 'Harness', icon: Layers, description: 'HarnessManager live status — Face 14' },
  { id: 'observability', label: 'Observability', icon: Eye, description: 'Agent execution traces — m-2' },
  { id: 'llm', label: 'LLM Keys', icon: Key, description: 'Provider API keys & adaptive router — Face 13' },
  { id: 'training', label: 'Training', icon: GraduationCap, description: 'Agent training & self-improvement — Face 16' },
  { id: 'security', label: 'Security', icon: ShieldCheck, description: 'Security scanners & self-repair — Face 11' },
  { id: 'skills-discovery', label: 'Skills', icon: Sparkles, description: 'Discover, install & auto-match skills — Face 15' },
  { id: 'knowledge', label: 'Knowledge', icon: Database, description: 'RAG knowledge base — collections, index & search — Face 22' },
  { id: 'orchestrator', label: 'Orchestrator', icon: Network, description: 'Multi-agent session management — Face 8' },
  { id: 'performance', label: 'Performance', icon: Zap, description: 'System benchmarks & slow queries — Face 12' },
  { id: 'case-intelligence', label: 'Cases', icon: Shield, description: 'Reputation case management — Face 20' },
  { id: 'agent-analysis', label: 'Agent Analysis', icon: BrainCircuit, description: 'Capability reverse-engineering — Face 21' },
  { id: 'constitution', label: 'Constitution', icon: ScrollText, description: 'Master system prompt & agent values — Face 7' },
  { id: 'cognitive', label: 'Cognitive', icon: Brain, description: 'Universal Cognitive System — memory, RAG, learning — Face 17' },
  { id: 'creative', label: 'Creative', icon: Film, description: 'Video + music generation — Face 22-23' },
  { id: 'visual', label: 'Visual AI', icon: Eye, description: 'Visual Intelligence — DOM analysis, accessibility, screenshots — Face 9' },
  { id: 'model-browser', label: 'Models', icon: Cpu, description: 'Ollama model browser — hardware viability (VRAM/RAM/CPU) — Face 13' },
  { id: 'agents', label: 'Agentes', icon: Users, description: 'Jerarquía de agentes' },
  { id: 'activity', label: 'Actividad', icon: Wrench, description: 'Herramientas y terminal' },
  { id: 'timeline', label: 'Timeline', icon: Clock, description: 'Historial de eventos' },
  { id: 'changes', label: 'Cambios', icon: FileEdit, description: 'Archivos modificados' },
  { id: 'metrics', label: 'Métricas', icon: BarChart3, description: 'Estadísticas' },
  { id: 'settings', label: 'Config', icon: Settings, description: 'Permisos y límites' },
  { id: 'subagents', label: 'Subagents', icon: Users, description: 'Roles y router adaptativo' },
];

/**
 * Configuración de subt tabs de actividad
 */
export interface SubTabConfig {
  id: ActivitySubTab;
  label: string;
  icon: React.ElementType;
}

export const ACTIVITY_SUB_TABS: SubTabConfig[] = [
  { id: 'tools', label: 'Herramientas', icon: Wrench },
  { id: 'catalog', label: 'Catálogo', icon: ShieldCheck },
  { id: 'cost', label: 'Coste', icon: DollarSign },
  { id: 'skills', label: 'Skills', icon: Sparkles },
  { id: 'artifacts', label: 'Artefactos', icon: Package },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'browser', label: 'Navegador', icon: Globe },
  { id: 'processes', label: 'Procesos', icon: Cpu },
];

/**
 * Estados de agente
 */
export type AgentState =
  | 'idle'
  | 'thinking'
  | 'executing'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled';

/**
 * Roles de agente
 */
export type AgentRole =
  | 'orchestrator'
  | 'specialist'
  | 'worker'
  | 'supervisor'
  | 'qa'
  | 'security'
  | 'researcher';

/**
 * Colores por defecto para roles
 */
export const AGENT_ROLE_COLORS: Record<AgentRole, string> = {
  orchestrator: '#6366f1',
  specialist: '#3b82f6',
  worker: '#22c55e',
  supervisor: '#f59e0b',
  qa: '#8b5cf6',
  security: '#ef4444',
  researcher: '#06b6d4',
};

/**
 * Nombres por defecto para roles
 */
export const AGENT_ROLE_NAMES: Record<AgentRole, string> = {
  orchestrator: 'Orquestador',
  specialist: 'Especialista',
  worker: 'Trabajador',
  supervisor: 'Supervisor',
  qa: 'QA',
  security: 'Seguridad',
  researcher: 'Investigador',
};

/**
 * Descripciones de roles
 */
export const AGENT_ROLE_DESCRIPTIONS: Record<AgentRole, string> = {
  orchestrator: 'Coordina y supervisa a todos los agentes',
  specialist: 'Agente con conocimientos específicos',
  worker: 'Ejecuta tareas asignadas',
  supervisor: 'Supervisa el trabajo de otros agentes',
  qa: 'Control de calidad',
  security: 'Análisis de seguridad',
  researcher: 'Investiga y busca información',
};

/**
 * Capacidades de roles
 */
export const AGENT_ROLE_CAPABILITIES: Record<AgentRole, string[]> = {
  orchestrator: ['planificacion', 'coordinacion', 'supervision'],
  specialist: [],
  worker: ['ejecucion_tareas'],
  supervisor: ['supervision', 'reportes'],
  qa: ['pruebas', 'validacion', 'calidad'],
  security: ['analisis_seguridad', 'validacion'],
  researcher: ['busqueda', 'analisis', 'investigacion'],
};
