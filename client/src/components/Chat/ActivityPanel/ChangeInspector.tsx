/**
 * ChangeInspector - Panel para revisar cambios de archivos
 * 
 * Muestra: archivos modificados, diferencias, aprobar/rechazar
 */

import React, { useState } from 'react';
import {
  FilePlus,
  FileEdit,
  FileMinus,
  Check,
  X,
  CheckCircle,
  XCircle,
  Clock,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Filter,
  Eye,
} from 'lucide-react';
import { useChangeInspector } from '~/hooks/useChangeInspector';
import { DiffViewer } from './DiffViewer';
import { cn } from '~/utils';
import type { FileChange, ChangeStatus } from '~/store/changeInspectorStore';

/**
 * Props del ChangeInspector
 */
interface ChangeInspectorProps {
  className?: string;
}

/**
 * Obtener icono según tipo de cambio
 */
function getChangeTypeIcon(type: FileChange['type']): React.ReactNode {
  switch (type) {
    case 'create': return <FilePlus size={14} />;
    case 'modify': return <FileEdit size={14} />;
    case 'delete': return <FileMinus size={14} />;
    default: return <FileEdit size={14} />;
  }
}

/**
 * Obtener icono según estado
 */
function getStatusIcon(status: ChangeStatus): React.ReactNode {
  switch (status) {
    case 'pending': return <Clock size={14} />;
    case 'approved': return <CheckCircle size={14} />;
    case 'rejected': return <XCircle size={14} />;
    case 'applied': return <Check size={14} />;
    default: return <Clock size={14} />;
  }
}

/**
 * Obtener color según estado
 */
function getStatusColor(status: ChangeStatus): string {
  switch (status) {
    case 'pending': return 'text-yellow-500';
    case 'approved': return 'text-green-500';
    case 'rejected': return 'text-red-500';
    case 'applied': return 'text-blue-500';
    default: return 'text-gray-500';
  }
}

/**
 * Obtener label del estado
 */
function getStatusLabel(status: ChangeStatus): string {
  switch (status) {
    case 'pending': return 'Pendiente';
    case 'approved': return 'Aprobado';
    case 'rejected': return 'Rechazado';
    case 'applied': return 'Aplicado';
    default: return status;
  }
}

/**
 * Item de cambio en la lista
 */
const ChangeListItem: React.FC<{
  change: FileChange;
  isSelected: boolean;
  onClick: () => void;
}> = ({ change, isSelected, onClick }) => {
  const statusColor = getStatusColor(change.status);
  const typeColor = change.type === 'create' 
    ? 'text-green-500' 
    : change.type === 'delete' 
      ? 'text-red-500' 
      : 'text-blue-500';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
        isSelected 
          ? 'bg-indigo-50 dark:bg-indigo-900/30 border-l-2 border-indigo-500' 
          : 'hover:bg-gray-50 dark:hover:bg-gray-800 border-l-2 border-transparent'
      )}
    >
      {/* Icono de tipo */}
      <span className={typeColor}>
        {getChangeTypeIcon(change.type)}
      </span>

      {/* Nombre del archivo */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
          {change.path.split('/').pop()}
        </p>
        <p className="text-xs text-gray-400 truncate">
          {change.path}
        </p>
      </div>

      {/* Stats */}
      {change.type === 'modify' && (
        <div className="flex items-center gap-1 text-xs">
          <span className="text-green-500">+{change.additions || 0}</span>
          <span className="text-red-500">-{change.deletions || 0}</span>
        </div>
      )}

      {/* Estado */}
      <span className={statusColor}>
        {getStatusIcon(change.status)}
      </span>

      {/* Flecha */}
      <ChevronRight size={14} className="text-gray-400" />
    </button>
  );
};

/**
 * Panel de estadísticas
 */
const StatsPanel: React.FC<{
  stats: ReturnType<typeof useChangeInspector>['stats'];
}> = ({ stats }) => {
  return (
    <div className="flex flex-wrap gap-3 px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-xs">
      <div className="flex items-center gap-1">
        <Clock size={12} className="text-yellow-500" />
        <span className="text-gray-600 dark:text-gray-400">
          Pendientes: <span className="font-medium">{stats.pending}</span>
        </span>
      </div>
      <div className="flex items-center gap-1">
        <CheckCircle size={12} className="text-green-500" />
        <span className="text-gray-600 dark:text-gray-400">
          Aprobados: <span className="font-medium">{stats.approved}</span>
        </span>
      </div>
      <div className="flex items-center gap-1">
        <XCircle size={12} className="text-red-500" />
        <span className="text-gray-600 dark:text-gray-400">
          Rechazados: <span className="font-medium">{stats.rejected}</span>
        </span>
      </div>
      <div className="flex items-center gap-1">
        <FilePlus size={12} className="text-green-500" />
        <span className="text-gray-600 dark:text-gray-400">
          Nuevos: <span className="font-medium">{stats.creates}</span>
        </span>
      </div>
      <div className="flex items-center gap-1">
        <FileEdit size={12} className="text-blue-500" />
        <span className="text-gray-600 dark:text-gray-400">
          Modificados: <span className="font-medium">{stats.modifies}</span>
        </span>
      </div>
    </div>
  );
};

/**
 * Panel de acciones
 */
const ActionBar: React.FC<{
  selectedChange: FileChange | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
  hasPending: boolean;
}> = ({ selectedChange, onApprove, onReject, onApproveAll, onRejectAll, hasPending }) => {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-t border-gray-200 dark:border-gray-700">
      {selectedChange ? (
        <>
          {selectedChange.status === 'pending' ? (
            <>
              <button
                onClick={() => onApprove(selectedChange.id)}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded text-sm font-medium transition-colors"
              >
                <Check size={14} />
                Aprobar
              </button>
              <button
                onClick={() => onReject(selectedChange.id)}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded text-sm font-medium transition-colors"
              >
                <X size={14} />
                Rechazar
              </button>
            </>
          ) : (
            <button
              onClick={() => {/* undo */}}
              className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded text-sm transition-colors"
            >
              <RefreshCw size={14} />
              Deshacer
            </button>
          )}
        </>
      ) : hasPending ? (
        <>
          <button
            onClick={onApproveAll}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded text-sm font-medium transition-colors"
          >
            <CheckCircle size={14} />
            Aprobar todos
          </button>
          <button
            onClick={onRejectAll}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded text-sm font-medium transition-colors"
          >
            <XCircle size={14} />
            Rechazar todos
          </button>
        </>
      ) : null}
    </div>
  );
};

/**
 * ChangeInspector - Componente principal
 */
export const ChangeInspector: React.FC<ChangeInspectorProps> = ({ className }) => {
  const {
    allChanges,
    selectedChange,
    stats,
    selectChange,
    approveChange,
    rejectChange,
    approveAll,
    rejectAll,
  } = useChangeInspector();

  const [filter, setFilter] = useState<ChangeStatus | 'all'>('all');

  // Filtrar cambios
  const filteredChanges = filter === 'all' 
    ? allChanges 
    : allChanges.filter(c => c.status === filter);

  return (
    <div className={cn('flex flex-col bg-white dark:bg-gray-900', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <FileEdit size={18} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Cambios
          </span>
          {stats.pending > 0 && (
            <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs font-medium rounded-full">
              {stats.pending}
            </span>
          )}
        </div>

        {/* Filtro */}
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as ChangeStatus | 'all')}
          className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800"
        >
          <option value="all">Todos</option>
          <option value="pending">Pendientes</option>
          <option value="approved">Aprobados</option>
          <option value="rejected">Rechazados</option>
          <option value="applied">Aplicados</option>
        </select>
      </div>

      {/* Estadísticas */}
      <StatsPanel stats={stats} />

      {/* Contenido */}
      <div className="flex-1 flex overflow-hidden">
        {/* Lista de cambios */}
        <div className="w-1/2 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
          {filteredChanges.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <FileEdit size={32} className="mb-2 opacity-50" />
              <p className="text-sm">Sin cambios</p>
            </div>
          ) : (
            filteredChanges.map((change) => (
              <ChangeListItem
                key={change.id}
                change={change}
                isSelected={selectedChange?.id === change.id}
                onClick={() => selectChange(change.id)}
              />
            ))
          )}
        </div>

        {/* Vista de diff */}
        <div className="w-1/2 overflow-y-auto p-4">
          {selectedChange ? (
            <>
              {/* Header del archivo */}
              <div className="mb-3">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {selectedChange.path.split('/').pop()}
                </h3>
                <p className="text-xs text-gray-400">
                  {selectedChange.path}
                </p>
              </div>

              {/* Diff */}
              <DiffViewer
                change={selectedChange}
                maxHeight="300px"
              />

              {/* Nota de revisión */}
              {selectedChange.reviewNote && (
                <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs">
                  <span className="font-medium">Nota:</span> {selectedChange.reviewNote}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Eye size={32} className="mb-2 opacity-50" />
              <p className="text-sm">Selecciona un cambio para ver detalles</p>
            </div>
          )}
        </div>
      </div>

      {/* Barra de acciones */}
      <ActionBar
        selectedChange={selectedChange}
        onApprove={approveChange}
        onReject={rejectChange}
        onApproveAll={approveAll}
        onRejectAll={rejectAll}
        hasPending={stats.pending > 0}
      />
    </div>
  );
};

export default ChangeInspector;
