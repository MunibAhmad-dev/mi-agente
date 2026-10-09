/**
 * Agent Utilities - Funciones compartidas para agentes
 */

import {
  Bot,
  Terminal,
  FileText,
  Search,
  Code,
  FolderOpen,
  Globe,
  Database,
  Wrench,
  CheckCircle,
  XCircle,
  Clock,
  Play,
  Pause,
  Square,
  Loader2,
  Crown,
  User,
  Hammer,
  Eye,
  Shield,
} from 'lucide-react';

/**
 * Obtener icono para herramienta por nombre
 */
export function getToolIcon(toolName: string): React.ElementType {
  const lower = toolName.toLowerCase();
  
  if (lower.includes('bash') || lower.includes('terminal') || lower.includes('command')) {
    return Terminal;
  }
  if (lower.includes('read') || lower.includes('file')) {
    return FileText;
  }
  if (lower.includes('search')) {
    return Search;
  }
  if (lower.includes('code') || lower.includes('edit') || lower.includes('write')) {
    return Code;
  }
  if (lower.includes('folder') || lower.includes('list')) {
    return FolderOpen;
  }
  if (lower.includes('browser') || lower.includes('navigate')) {
    return Globe;
  }
  if (lower.includes('database') || lower.includes('db')) {
    return Database;
  }
  
  return Wrench;
}

/**
 * Obtener icono para rol de agente
 */
export function getAgentRoleIcon(role: string): React.ElementType {
  const icons: Record<string, React.ElementType> = {
    orchestrator: Crown,
    specialist: User,
    worker: Hammer,
    supervisor: Eye,
    qa: CheckCircle,
    security: Shield,
    researcher: Search,
  };
  return icons[role] || Bot;
}

/**
 * Estados de herramienta
 */
export type ToolStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Estados de agente
 */
export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'waiting' | 'completed' | 'failed' | 'paused' | 'cancelled';

/**
 * Obtener icono para estado
 */
export function getStatusIcon(status: AgentStatus | ToolStatus): React.ReactNode {
  switch (status) {
    case 'running':
    case 'pending':
    case 'thinking':
      return <Loader2 size={14} className="animate-spin" />;
    case 'completed':
      return <CheckCircle size={14} />;
    case 'failed':
      return <XCircle size={14} />;
    case 'paused':
      return <Pause size={14} />;
    case 'cancelled':
      return <Square size={14} />;
    default:
      return <Clock size={14} />;
  }
}

/**
 * Obtener color para estado
 */
export function getStatusColor(status: AgentStatus | ToolStatus): string {
  const colors: Record<string, string> = {
    idle: 'text-gray-400',
    thinking: 'text-yellow-500',
    pending: 'text-yellow-500',
    running: 'text-blue-500',
    executing: 'text-blue-500',
    waiting: 'text-purple-500',
    completed: 'text-green-500',
    failed: 'text-red-500',
    paused: 'text-orange-500',
    cancelled: 'text-gray-500',
  };
  return colors[status] || 'text-gray-400';
}

/**
 * Obtener fondo para estado
 */
export function getStatusBg(status: AgentStatus | ToolStatus): string {
  const colors: Record<string, string> = {
    idle: 'bg-gray-100 dark:bg-gray-800',
    thinking: 'bg-yellow-50 dark:bg-yellow-900/20',
    pending: 'bg-yellow-50 dark:bg-yellow-900/20',
    running: 'bg-blue-50 dark:bg-blue-900/20',
    executing: 'bg-blue-50 dark:bg-blue-900/20',
    waiting: 'bg-purple-50 dark:bg-purple-900/20',
    completed: 'bg-green-50 dark:bg-green-900/20',
    failed: 'bg-red-50 dark:bg-red-900/20',
    paused: 'bg-orange-50 dark:bg-orange-900/20',
    cancelled: 'bg-gray-100 dark:bg-gray-800',
  };
  return colors[status] || 'bg-gray-100';
}

/**
 * Obtener label para estado
 */
export function getStatusLabel(status: AgentStatus | ToolStatus): string {
  const labels: Record<string, string> = {
    idle: 'Idle',
    thinking: 'Pensando',
    pending: 'Pendiente',
    running: 'Ejecutando',
    executing: 'Ejecutando',
    waiting: 'Esperando',
    completed: 'Completado',
    failed: 'Falló',
    paused: 'Pausado',
    cancelled: 'Cancelado',
  };
  return labels[status] || status;
}

/**
 * Formatear duración en milisegundos
 */
export function formatDuration(ms?: number): string {
  if (!ms) return '--';
  
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/**
 * Formatear timestamp
 */
export function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Verificar si un estado es "activo"
 */
export function isActiveStatus(status: AgentStatus | ToolStatus): boolean {
  return ['thinking', 'executing', 'running', 'waiting', 'pending'].includes(status);
}

/**
 * Verificar si un estado es "terminal" (finalizado)
 */
export function isTerminalStatus(status: AgentStatus | ToolStatus): boolean {
  return ['completed', 'failed', 'cancelled'].includes(status);
}
