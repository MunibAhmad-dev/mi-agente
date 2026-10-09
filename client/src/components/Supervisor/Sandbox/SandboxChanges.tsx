/**
 * SandboxChanges Component
 *
 * Lista de cambios pendientes en el sandbox
 */

import React, { useState, useCallback } from 'react';
import { useGetModifiedFiles, useStageFiles, usePromoteChanges, useDiscardChanges } from '~/hooks/supervisor/useSandbox';
import './SandboxChanges.css';

interface SandboxChangesProps {
  sandboxId: string;
}

interface FileChange {
  path: string;
  type: 'modified' | 'added' | 'deleted';
  oldSize?: number;
  newSize?: number;
  modifiedAt: Date;
  staged?: boolean;
}

const SandboxChanges: React.FC<SandboxChangesProps> = ({ sandboxId }) => {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const { data: filesData, isLoading } = useGetModifiedFiles(sandboxId);
  const stageFiles = useStageFiles();
  const promoteChanges = usePromoteChanges();
  const discardChanges = useDiscardChanges();

  const files: FileChange[] = filesData?.files || [];

  const handleSelectFile = useCallback((path: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map((f) => f.path)));
    }
  }, [selectedFiles, files]);

  const handleStage = useCallback(async () => {
    if (selectedFiles.size === 0) return;

    try {
      await stageFiles.mutateAsync({
        sandboxId,
        filePaths: Array.from(selectedFiles),
      });
      setSelectedFiles(new Set());
    } catch (error) {
      console.error('Error staging files:', error);
    }
  }, [selectedFiles, sandboxId, stageFiles]);

  const handlePromote = useCallback(async () => {
    if (selectedFiles.size === 0) return;

    if (!confirm(`Promote ${selectedFiles.size} file(s) to the real workspace?`)) {
      return;
    }

    try {
      const result = await promoteChanges.mutateAsync({
        sandboxId,
        filePaths: Array.from(selectedFiles),
      });

      if (result.success) {
        alert(`Successfully promoted ${result.count} file(s)`);
        setSelectedFiles(new Set());
      } else {
        alert(`Promoted with errors: ${result.errors.map((e: { error: string }) => e.error).join(', ')}`);
      }
    } catch (error) {
      console.error('Error promoting changes:', error);
    }
  }, [selectedFiles, sandboxId, promoteChanges]);

  const handleDiscard = useCallback(async () => {
    if (selectedFiles.size === 0) return;

    if (!confirm(`Discard ${selectedFiles.size} change(s)? This cannot be undone.`)) {
      return;
    }

    try {
      await discardChanges.mutateAsync({
        sandboxId,
        filePaths: Array.from(selectedFiles),
      });
      setSelectedFiles(new Set());
    } catch (error) {
      console.error('Error discarding changes:', error);
    }
  }, [selectedFiles, sandboxId, discardChanges]);

  const handleDiscardAll = useCallback(async () => {
    if (files.length === 0) return;

    if (!confirm(`Discard ALL ${files.length} changes? This cannot be undone.`)) {
      return;
    }

    try {
      await discardChanges.mutateAsync({
        sandboxId,
        filePaths: undefined, // All files
      });
      setSelectedFiles(new Set());
    } catch (error) {
      console.error('Error discarding all changes:', error);
    }
  }, [files, sandboxId, discardChanges]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'modified':
        return '📝';
      case 'added':
        return '✨';
      case 'deleted':
        return '🗑️';
      default:
        return '📄';
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="sandbox-changes">
        <div className="changes-loading">Loading changes...</div>
      </div>
    );
  }

  return (
    <div className="sandbox-changes">
      {/* Header */}
      <div className="changes-header">
        <div className="changes-title">
          <span>Pending Changes</span>
          <span className="changes-count">{files.length}</span>
        </div>

        <div className="changes-actions">
          <button
            className="changes-btn"
            onClick={handleSelectAll}
            disabled={files.length === 0}
          >
            {selectedFiles.size === files.length ? 'Deselect All' : 'Select All'}
          </button>
          <button
            className="changes-btn"
            onClick={handleDiscardAll}
            disabled={files.length === 0 || discardChanges.isLoading}
          >
            Discard All
          </button>
        </div>
      </div>

      {/* File List */}
      {files.length === 0 ? (
        <div className="changes-empty">
          <p>No pending changes</p>
        </div>
      ) : (
        <div className="changes-list">
          {files.map((file) => (
            <div
              key={file.path}
              className={`change-item ${selectedFiles.has(file.path) ? 'selected' : ''} ${file.staged ? 'staged' : ''}`}
              onClick={() => handleSelectFile(file.path)}
            >
              <input
                type="checkbox"
                checked={selectedFiles.has(file.path)}
                onChange={() => handleSelectFile(file.path)}
                onClick={(e) => e.stopPropagation()}
              />

              <span className="change-icon">{getTypeIcon(file.type)}</span>

              <div className="change-info">
                <span className="change-path">{file.path}</span>
                <span className="change-meta">
                  {file.type} • {formatDate(file.modifiedAt)}
                  {file.staged && <span className="staged-badge">Staged</span>}
                </span>
              </div>

              <span className={`change-type ${file.type}`}>
                {file.type === 'modified' ? 'M' : file.type === 'added' ? 'A' : 'D'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Bottom Actions */}
      {selectedFiles.size > 0 && (
        <div className="changes-bottom">
          <span className="changes-selected">
            {selectedFiles.size} selected
          </span>

          <div className="changes-bottom-actions">
            <button
              className="changes-btn changes-btn-stage"
              onClick={handleStage}
              disabled={stageFiles.isLoading}
            >
              Stage for Review
            </button>
            <button
              className="changes-btn changes-btn-promote"
              onClick={handlePromote}
              disabled={promoteChanges.isLoading}
            >
              Promote to Workspace
            </button>
            <button
              className="changes-btn changes-btn-discard"
              onClick={handleDiscard}
              disabled={discardChanges.isLoading}
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SandboxChanges;
