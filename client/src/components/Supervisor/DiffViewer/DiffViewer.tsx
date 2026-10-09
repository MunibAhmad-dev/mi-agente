/**
 * DiffViewer Component
 *
 * Componente para visualizar diferencias entre archivos
 * Muestra comparaciones lado a lado o en línea
 */

import React, { useMemo, useState, useCallback } from 'react';
import './DiffViewer.css';

export interface DiffChange {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
  lineNumber?: number;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffResult {
  oldContent: string;
  newContent: string;
  changes: DiffChange[];
  stats: {
    additions: number;
    deletions: number;
    unchanged: number;
  };
}

interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  oldFileName?: string;
  newFileName?: string;
  mode?: 'side-by-side' | 'inline';
  showLineNumbers?: boolean;
  onClose?: () => void;
}

/**
 * Función para calcular diferencias entre dos textos
 */
function computeDiff(oldText: string, newText: string): DiffResult {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  
  const changes: DiffChange[] = [];
  let oldIdx = 0;
  let newIdx = 0;
  
  // Algoritmo LCS (Longest Common Subsequence) simplificado
  // Para una implementación más robusta, usar la biblioteca 'diff'
  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (oldIdx >= oldLines.length) {
      // Líneas añadidas
      changes.push({
        type: 'added',
        value: newLines[newIdx],
        newLineNumber: newIdx + 1,
      });
      newIdx++;
    } else if (newIdx >= newLines.length) {
      // Líneas eliminadas
      changes.push({
        type: 'removed',
        value: oldLines[oldIdx],
        oldLineNumber: oldIdx + 1,
      });
      oldIdx++;
    } else if (oldLines[oldIdx] === newLines[newIdx]) {
      // Líneas iguales
      changes.push({
        type: 'unchanged',
        value: oldLines[oldIdx],
        oldLineNumber: oldIdx + 1,
        newLineNumber: newIdx + 1,
      });
      oldIdx++;
      newIdx++;
    } else {
      // Buscar en las siguientes líneas
      let foundInNew = -1;
      let foundInOld = -1;
      
      for (let i = newIdx + 1; i < Math.min(newLines.length, newIdx + 5); i++) {
        if (oldLines[oldIdx] === newLines[i]) {
          foundInNew = i;
          break;
        }
      }
      
      for (let i = oldIdx + 1; i < Math.min(oldLines.length, oldIdx + 5); i++) {
        if (oldLines[i] === newLines[newIdx]) {
          foundInOld = i;
          break;
        }
      }
      
      if (foundInNew > 0 && (foundInOld < 0 || foundInNew - newIdx <= foundInOld - oldIdx)) {
        // Añadir líneas en new
        while (newIdx < foundInNew) {
          changes.push({
            type: 'added',
            value: newLines[newIdx],
            newLineNumber: newIdx + 1,
          });
          newIdx++;
        }
      } else if (foundInOld > 0) {
        // Eliminar líneas en old
        while (oldIdx < foundInOld) {
          changes.push({
            type: 'removed',
            value: oldLines[oldIdx],
            oldLineNumber: oldIdx + 1,
          });
          oldIdx++;
        }
      } else {
        // Reemplazo simple
        changes.push({
          type: 'removed',
          value: oldLines[oldIdx],
          oldLineNumber: oldIdx + 1,
        });
        changes.push({
          type: 'added',
          value: newLines[newIdx],
          newLineNumber: newIdx + 1,
        });
        oldIdx++;
        newIdx++;
      }
    }
  }
  
  // Calcular estadísticas
  const stats = {
    additions: changes.filter(c => c.type === 'added').length,
    deletions: changes.filter(c => c.type === 'removed').length,
    unchanged: changes.filter(c => c.type === 'unchanged').length,
  };
  
  return {
    oldContent: oldText,
    newContent: newText,
    changes,
    stats,
  };
}

const DiffViewer: React.FC<DiffViewerProps> = ({
  oldContent,
  newContent,
  oldFileName = 'Original',
  newFileName = 'Modificado',
  mode = 'side-by-side',
  showLineNumbers = true,
  onClose,
}) => {
  const [viewMode, setViewMode] = useState<'side-by-side' | 'inline'>(mode);
  const [syncScroll, setSyncScroll] = useState(true);

  const diff = useMemo(() => {
    return computeDiff(oldContent, newContent);
  }, [oldContent, newContent]);

  const handleSyncScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!syncScroll) return;
    const target = e.currentTarget;
    const containers = document.querySelectorAll('.diff-content');
    containers.forEach((container) => {
      if (container !== target) {
        container.scrollTop = target.scrollTop;
      }
    });
  }, [syncScroll]);

  const renderInlineView = () => {
    return (
      <div className="diff-inline" onScroll={handleSyncScroll}>
        {diff.changes.map((change, index) => (
          <div
            key={index}
            className={`diff-line diff-line-${change.type}`}
          >
            {showLineNumbers && (
              <span className="diff-line-number">
                {change.oldLineNumber || ' '}
              </span>
            )}
            <span className="diff-line-marker">
              {change.type === 'added' ? '+' : change.type === 'removed' ? '-' : ' '}
            </span>
            <span className="diff-line-content">
              {highlightChanges(change.value, change.type)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderSideBySideView = () => {
    const oldLines: DiffChange[] = [];
    const newLines: DiffChange[] = [];
    
    let i = 0;
    while (i < diff.changes.length) {
      const change = diff.changes[i];
      
      if (change.type === 'unchanged') {
        oldLines.push(change);
        newLines.push(change);
        i++;
      } else if (change.type === 'removed') {
        oldLines.push(change);
        newLines.push({ type: 'unchanged', value: '', oldLineNumber: undefined, newLineNumber: undefined });
        i++;
      } else if (change.type === 'added') {
        oldLines.push({ type: 'unchanged', value: '', oldLineNumber: undefined, newLineNumber: undefined });
        newLines.push(change);
        i++;
      } else {
        i++;
      }
    }

    return (
      <div className="diff-side-by-side">
        <div className="diff-pane diff-pane-old" onScroll={handleSyncScroll}>
          <div className="diff-header">{oldFileName}</div>
          <div className="diff-content">
            {oldLines.map((line, index) => (
              <div
                key={index}
                className={`diff-line diff-line-${line.type}`}
              >
                {showLineNumbers && (
                  <span className="diff-line-number">
                    {line.oldLineNumber || ' '}
                  </span>
                )}
                <span className="diff-line-content">{line.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="diff-pane diff-pane-new" onScroll={handleSyncScroll}>
          <div className="diff-header">{newFileName}</div>
          <div className="diff-content">
            {newLines.map((line, index) => (
              <div
                key={index}
                className={`diff-line diff-line-${line.type}`}
              >
                {showLineNumbers && (
                  <span className="diff-line-number">
                    {line.newLineNumber || ' '}
                  </span>
                )}
                <span className="diff-line-content">{line.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="diff-viewer">
      {/* Header */}
      <div className="diff-toolbar">
        <div className="diff-stats">
          <span className="diff-stat diff-stat-additions">
            +{diff.stats.additions}
          </span>
          <span className="diff-stat diff-stat-deletions">
            -{diff.stats.deletions}
          </span>
          <span className="diff-stat diff-stat-unchanged">
            {diff.stats.unchanged} unchanged
          </span>
        </div>

        <div className="diff-controls">
          <label className="diff-checkbox">
            <input
              type="checkbox"
              checked={syncScroll}
              onChange={(e) => setSyncScroll(e.target.checked)}
            />
            Sync scroll
          </label>

          <div className="diff-view-toggle">
            <button
              className={`diff-toggle-btn ${viewMode === 'inline' ? 'active' : ''}`}
              onClick={() => setViewMode('inline')}
            >
              Inline
            </button>
            <button
              className={`diff-toggle-btn ${viewMode === 'side-by-side' ? 'active' : ''}`}
              onClick={() => setViewMode('side-by-side')}
            >
              Side by Side
            </button>
          </div>

          {onClose && (
            <button className="diff-close-btn" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="diff-body">
        {viewMode === 'inline' ? renderInlineView() : renderSideBySideView()}
      </div>
    </div>
  );
};

/**
 * Resalta los cambios específicos dentro de una línea
 */
function highlightChanges(text: string, type: 'added' | 'removed' | 'unchanged'): React.ReactNode {
  if (type === 'unchanged') {
    return text;
  }
  
  // Resaltar caracteres específicos añadidos/eliminados
  return <span className={`diff-highlight diff-highlight-${type}`}>{text}</span>;
}

export default DiffViewer;
