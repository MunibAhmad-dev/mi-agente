/**
 * SandboxPanel Component
 *
 * Panel principal para el sistema de Sandbox de aislamiento
 */

import React, { useState, useCallback } from 'react';
import { useListSandboxes, useCreateSandbox, useDestroySandbox } from '~/hooks/supervisor/useSandbox';
import SandboxTerminal from './SandboxTerminal';
import SandboxFileTree from './SandboxFileTree';
import SandboxPreview from './SandboxPreview';
import SandboxChanges from './SandboxChanges';
import './SandboxPanel.css';

interface SandboxPanelProps {
  sessionId?: string;
  workspacePath?: string;
}

type ViewMode = 'terminal' | 'files' | 'changes' | 'preview';

const SandboxPanel: React.FC<SandboxPanelProps> = ({ sessionId, workspacePath }) => {
  const [selectedSandboxId, setSelectedSandboxId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('terminal');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const { data: sandboxesData, isLoading: loadingList } = useListSandboxes();
  const createSandbox = useCreateSandbox();
  const destroySandbox = useDestroySandbox();

  const sandboxes = sandboxesData?.sandboxes || [];
  const selectedSandbox = sandboxes.find((s: { id: string }) => s.id === selectedSandboxId);

  const handleCreateSandbox = useCallback(async () => {
    if (!sessionId) {
      alert('Session ID is required');
      return;
    }

    setIsCreating(true);
    try {
      const result = await createSandbox.mutateAsync({
        sessionId,
        workspacePath,
        resources: { cpu: '1', memory: '512m' },
      });

      if (result.success && result.sandbox) {
        setSelectedSandboxId(result.sandbox.id);
      }
    } catch (error) {
      console.error('Error creating sandbox:', error);
      alert('Failed to create sandbox');
    } finally {
      setIsCreating(false);
    }
  }, [sessionId, workspacePath, createSandbox]);

  const handleDestroySandbox = useCallback(async () => {
    if (!selectedSandboxId) return;

    if (!confirm('Are you sure you want to destroy this sandbox? All unsaved changes will be lost.')) {
      return;
    }

    try {
      await destroySandbox.mutateAsync(selectedSandboxId);
      setSelectedSandboxId(null);
    } catch (error) {
      console.error('Error destroying sandbox:', error);
      alert('Failed to destroy sandbox');
    }
  }, [selectedSandboxId, destroySandbox]);

  const handleFileSelect = useCallback((filePath: string) => {
    setSelectedFile(filePath);
    setViewMode('preview');
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
        return 'status-ready';
      case 'running':
        return 'status-running';
      case 'creating':
        return 'status-creating';
      case 'error':
        return 'status-error';
      default:
        return 'status-stopped';
    }
  };

  return (
    <div className="sandbox-panel">
      {/* Header */}
      <div className="sandbox-header">
        <div className="sandbox-title">
          <span className="sandbox-icon">🏖️</span>
          <h3>Sandbox</h3>
          {selectedSandbox && (
            <span className={`sandbox-status ${getStatusColor(selectedSandbox.status)}`}>
              {selectedSandbox.status}
            </span>
          )}
        </div>

        <div className="sandbox-actions">
          {!selectedSandboxId ? (
            <button
              className="sandbox-btn sandbox-btn-primary"
              onClick={handleCreateSandbox}
              disabled={isCreating || !sessionId}
            >
              {isCreating ? 'Creating...' : 'Create Sandbox'}
            </button>
          ) : (
            <>
              <button
                className="sandbox-btn sandbox-btn-danger"
                onClick={handleDestroySandbox}
                disabled={destroySandbox.isLoading}
              >
                Destroy
              </button>
            </>
          )}
        </div>
      </div>

      {/* Sandbox List */}
      {sandboxes.length > 0 && (
        <div className="sandbox-list">
          <label>Active Sandboxes:</label>
          <div className="sandbox-list-items">
            {sandboxes.map((sandbox: { id: string; sessionId: string; status: string }) => (
              <button
                key={sandbox.id}
                className={`sandbox-item ${selectedSandboxId === sandbox.id ? 'active' : ''}`}
                onClick={() => setSelectedSandboxId(sandbox.id)}
              >
                <span className={`sandbox-item-status ${getStatusColor(sandbox.status)}`} />
                <span className="sandbox-item-id">{sandbox.sessionId.slice(0, 8)}...</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Content */}
      {selectedSandboxId ? (
        <>
          {/* View Mode Tabs */}
          <div className="sandbox-tabs">
            <button
              className={`sandbox-tab ${viewMode === 'terminal' ? 'active' : ''}`}
              onClick={() => setViewMode('terminal')}
            >
              Terminal
            </button>
            <button
              className={`sandbox-tab ${viewMode === 'files' ? 'active' : ''}`}
              onClick={() => setViewMode('files')}
            >
              Files
            </button>
            <button
              className={`sandbox-tab ${viewMode === 'changes' ? 'active' : ''}`}
              onClick={() => setViewMode('changes')}
            >
              Changes
            </button>
            <button
              className={`sandbox-tab ${viewMode === 'preview' ? 'active' : ''}`}
              onClick={() => setViewMode('preview')}
              disabled={!selectedFile}
            >
              Preview
            </button>
          </div>

          {/* Content Area */}
          <div className="sandbox-content">
            {viewMode === 'terminal' && (
              <SandboxTerminal sandboxId={selectedSandboxId} />
            )}
            {viewMode === 'files' && (
              <SandboxFileTree
                sandboxId={selectedSandboxId}
                onFileSelect={handleFileSelect}
              />
            )}
            {viewMode === 'changes' && (
              <SandboxChanges sandboxId={selectedSandboxId} />
            )}
            {viewMode === 'preview' && selectedFile && (
              <SandboxPreview
                sandboxId={selectedSandboxId}
                filePath={selectedFile}
              />
            )}
            {viewMode === 'preview' && !selectedFile && (
              <div className="sandbox-empty">
                <p>Select a file to preview</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="sandbox-empty">
          <div className="sandbox-empty-icon">🏖️</div>
          <h4>No Sandbox Active</h4>
          <p>Create a sandbox to work in an isolated environment</p>
          {!sessionId && (
            <p className="sandbox-warning">Session ID required to create sandbox</p>
          )}
        </div>
      )}
    </div>
  );
};

export default SandboxPanel;
