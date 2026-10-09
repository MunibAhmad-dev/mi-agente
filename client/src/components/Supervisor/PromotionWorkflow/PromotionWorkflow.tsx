/**
 * PromotionWorkflow Component
 *
 * Workflow para aprobar/rechazar cambios del sandbox
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useGetAllDiffs, usePromoteChanges, useDiscardChanges, useStageFiles } from '~/hooks/supervisor/useSandbox';
import DiffViewer from '../DiffViewer';
import './PromotionWorkflow.css';

interface PromotionWorkflowProps {
  sandboxId: string;
  onClose?: () => void;
  onPromote?: () => void;
  onDiscard?: () => void;
}

interface FileDiff {
  filePath: string;
  type: 'modified' | 'added' | 'deleted';
  stats?: {
    additions: number;
    deletions: number;
    unchanged: number;
  };
  changes?: Array<{
    type: 'added' | 'removed' | 'unchanged';
    value: string;
    oldLineNumber?: number;
    newLineNumber?: number;
  }>;
  oldContent?: string;
  newContent?: string;
}

type ViewMode = 'list' | 'diff';
type SelectionMode = 'single' | 'all' | 'unstaged';

const PromotionWorkflow: React.FC<PromotionWorkflowProps> = ({
  sandboxId,
  onClose,
  onPromote,
  onDiscard,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedFile, setSelectedFile] = useState<FileDiff | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('unstaged');
  const [customSelection, setCustomSelection] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'promote' | 'discard' | null>(null);

  const { data: diffsData, isLoading, refetch } = useGetAllDiffs(sandboxId);
  const promoteChanges = usePromoteChanges();
  const discardChanges = useDiscardChanges();
  const stageFiles = useStageFiles();

  const files: FileDiff[] = diffsData?.files || [];

  // Filtrar archivos según el modo de selección
  const filteredFiles = useMemo(() => {
    if (selectionMode === 'all') return files;
    if (selectionMode === 'unstaged') return files.filter(f => !customSelection.has(f.filePath));
    return files;
  }, [files, selectionMode, customSelection]);

  // Archivos seleccionados para procesar
  const filesToProcess = useMemo(() => {
    if (selectionMode === 'all' || selectionMode === 'unstaged') {
      return filteredFiles.map(f => f.filePath);
    }
    return Array.from(customSelection);
  }, [selectionMode, filteredFiles, customSelection]);

  // Estadísticas totales
  const totalStats = useMemo(() => {
    return files.reduce((acc, file) => ({
      additions: acc.additions + (file.stats?.additions || 0),
      deletions: acc.deletions + (file.stats?.deletions || 0),
      files: acc.files + 1,
    }), { additions: 0, deletions: 0, files: 0 });
  }, [files]);

  const handleFileClick = useCallback((file: FileDiff) => {
    setSelectedFile(file);
    setViewMode('diff');
  }, []);

  const handleBackToList = useCallback(() => {
    setViewMode('list');
    setSelectedFile(null);
  }, []);

  const handleToggleFile = useCallback((filePath: string) => {
    setCustomSelection(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
    setSelectionMode('single');
  }, []);

  const handleStageSelected = useCallback(async () => {
    if (filesToProcess.length === 0) return;

    setIsProcessing(true);
    try {
      await stageFiles.mutateAsync({
        sandboxId,
        filePaths: filesToProcess,
      });
      setCustomSelection(new Set());
      setSelectionMode('unstaged');
      refetch();
    } catch (error) {
      console.error('Error staging files:', error);
      alert('Failed to stage files');
    } finally {
      setIsProcessing(false);
    }
  }, [filesToProcess, sandboxId, stageFiles, refetch]);

  const handlePromote = useCallback(async () => {
    if (filesToProcess.length === 0) return;

    setConfirmAction('promote');
  }, [filesToProcess]);

  const handleConfirmPromote = useCallback(async () => {
    setIsProcessing(true);
    setConfirmAction(null);

    try {
      const result = await promoteChanges.mutateAsync({
        sandboxId,
        filePaths: filesToProcess,
      });

      if (result.success) {
        alert(`Successfully promoted ${result.count} file(s)`);
        onPromote?.();
      } else {
        alert(`Promoted with errors: ${result.errors.map((e: { error: string }) => e.error).join(', ')}`);
      }
      refetch();
    } catch (error) {
      console.error('Error promoting changes:', error);
      alert('Failed to promote changes');
    } finally {
      setIsProcessing(false);
    }
  }, [filesToProcess, sandboxId, promoteChanges, onPromote, refetch]);

  const handleDiscard = useCallback(async () => {
    if (filesToProcess.length === 0) return;

    setConfirmAction('discard');
  }, [filesToProcess]);

  const handleConfirmDiscard = useCallback(async () => {
    setIsProcessing(true);
    setConfirmAction(null);

    try {
      await discardChanges.mutateAsync({
        sandboxId,
        filePaths: filesToProcess,
      });
      alert(`Discarded ${filesToProcess.length} file(s)`);
      onDiscard?.();
      refetch();
    } catch (error) {
      console.error('Error discarding changes:', error);
      alert('Failed to discard changes');
    } finally {
      setIsProcessing(false);
    }
  }, [filesToProcess, sandboxId, discardChanges, onDiscard, refetch]);

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'modified': return '📝';
      case 'added': return '✨';
      case 'deleted': return '🗑️';
      default: return '📄';
    }
  };

  if (isLoading) {
    return (
      <div className="promotion-workflow">
        <div className="workflow-loading">Loading changes...</div>
      </div>
    );
  }

  return (
    <div className="promotion-workflow">
      {/* Header */}
      <div className="workflow-header">
        <div className="workflow-title">
          <h3>Promotion Workflow</h3>
          <span className="workflow-count">{totalStats.files} files</span>
        </div>

        <div className="workflow-actions-header">
          <button className="workflow-btn-close" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="workflow-stats">
        <span className="stat-additions">+{totalStats.additions}</span>
        <span className="stat-deletions">-{totalStats.deletions}</span>
      </div>

      {/* Selection Controls */}
      <div className="workflow-selection">
        <label>Select files:</label>
        <div className="selection-options">
          <button
            className={`selection-btn ${selectionMode === 'unstaged' ? 'active' : ''}`}
            onClick={() => setSelectionMode('unstaged')}
          >
            Unstaged ({files.filter(f => !customSelection.has(f.filePath)).length})
          </button>
          <button
            className={`selection-btn ${selectionMode === 'all' ? 'active' : ''}`}
            onClick={() => setSelectionMode('all')}
          >
            All ({files.length})
          </button>
          <button
            className={`selection-btn ${selectionMode === 'single' ? 'active' : ''}`}
            onClick={() => setSelectionMode('single')}
          >
            Custom ({customSelection.size})
          </button>
        </div>
        {selectionMode === 'single' && customSelection.size > 0 && (
          <button
            className="stage-selected-btn"
            onClick={handleStageSelected}
            disabled={isProcessing}
          >
            Stage Selected
          </button>
        )}
      </div>

      {/* Content */}
      {viewMode === 'list' ? (
        <div className="workflow-content">
          {files.length === 0 ? (
            <div className="workflow-empty">
              <p>No pending changes</p>
            </div>
          ) : (
            <div className="file-list">
              {filteredFiles.map((file) => (
                <div
                  key={file.filePath}
                  className={`file-item ${selectedFile?.filePath === file.filePath ? 'selected' : ''}`}
                  onClick={() => handleFileClick(file)}
                >
                  {selectionMode === 'single' && (
                    <input
                      type="checkbox"
                      checked={customSelection.has(file.filePath)}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleToggleFile(file.filePath);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}

                  <span className="file-icon">{getFileIcon(file.type)}</span>

                  <div className="file-info">
                    <span className="file-path">{file.filePath}</span>
                    {file.stats && (
                      <span className="file-stats">
                        <span className="stat-add">+{file.stats.additions}</span>
                        <span className="stat-del">-{file.stats.deletions}</span>
                      </span>
                    )}
                  </div>

                  <span className={`file-badge ${file.type}`}>
                    {file.type === 'modified' ? 'M' : file.type === 'added' ? 'A' : 'D'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="workflow-diff">
          <div className="diff-header">
            <button className="back-btn" onClick={handleBackToList}>
              ← Back to list
            </button>
            <span className="diff-file-name">{selectedFile?.filePath}</span>
          </div>
          {selectedFile && (
            <DiffViewer
              oldContent={selectedFile.oldContent || ''}
              newContent={selectedFile.newContent || ''}
              oldFileName={selectedFile.filePath}
              newFileName={`${selectedFile.filePath} (sandbox)`}
              mode="side-by-side"
            />
          )}
        </div>
      )}

      {/* Bottom Actions */}
      {viewMode === 'list' && (
        <div className="workflow-footer">
          <span className="selected-count">
            {filesToProcess.length} file(s) selected
          </span>

          <div className="footer-actions">
            <button
              className="action-btn discard-btn"
              onClick={handleDiscard}
              disabled={filesToProcess.length === 0 || isProcessing}
            >
              Discard
            </button>
            <button
              className="action-btn promote-btn"
              onClick={handlePromote}
              disabled={filesToProcess.length === 0 || isProcessing}
            >
              {isProcessing ? 'Processing...' : 'Promote to Workspace'}
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="confirmation-overlay">
          <div className="confirmation-modal">
            <h4>Confirm {confirmAction}</h4>
            <p>
              Are you sure you want to {confirmAction} {filesToProcess.length} file(s)?
              {confirmAction === 'discard' && (
                <strong> This action cannot be undone.</strong>
              )}
            </p>
            <div className="modal-actions">
              <button
                className="modal-btn cancel-btn"
                onClick={() => setConfirmAction(null)}
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                className={`modal-btn ${confirmAction}-btn`}
                onClick={confirmAction === 'promote' ? handleConfirmPromote : handleConfirmDiscard}
                disabled={isProcessing}
              >
                {confirmAction === 'promote' ? 'Promote' : 'Discard'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PromotionWorkflow;
