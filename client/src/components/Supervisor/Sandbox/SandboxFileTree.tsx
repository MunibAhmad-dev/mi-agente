/**
 * SandboxFileTree Component
 *
 * Árbol de archivos del sandbox
 */

import React, { useMemo } from 'react';
import { useGetModifiedFiles } from '~/hooks/supervisor/useSandbox';
import './SandboxFileTree.css';

interface SandboxFileTreeProps {
  sandboxId: string;
  onFileSelect: (filePath: string) => void;
}

interface FileInfo {
  path: string;
  type: 'modified' | 'added' | 'deleted';
  oldSize?: number;
  newSize?: number;
  modifiedAt: Date;
  staged?: boolean;
}

const SandboxFileTree: React.FC<SandboxFileTreeProps> = ({ sandboxId, onFileSelect }) => {
  const { data: filesData, isLoading } = useGetModifiedFiles(sandboxId);

  const files: FileInfo[] = filesData?.files || [];

  // Group files by directory
  const groupedFiles = useMemo(() => {
    const groups: Record<string, FileInfo[]> = {};

    files.forEach((file) => {
      const parts = file.path.split('/');
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '/';

      if (!groups[dir]) {
        groups[dir] = [];
      }
      groups[dir].push(file);
    });

    return groups;
  }, [files]);

  const getFileIcon = (type: string) => {
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

  const getStatusBadge = (file: FileInfo) => {
    if (file.staged) {
      return <span className="file-badge staged">Staged</span>;
    }
    return null;
  };

  const formatSize = (size?: number) => {
    if (!size) return '';
    if (size < 1024) return `${size}B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
    return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  };

  if (isLoading) {
    return (
      <div className="sandbox-file-tree">
        <div className="file-tree-loading">Loading files...</div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="sandbox-file-tree">
        <div className="file-tree-empty">
          <p>No modified files</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sandbox-file-tree">
      <div className="file-tree-header">
        <span className="file-tree-title">Modified Files</span>
        <span className="file-tree-count">{files.length} files</span>
      </div>

      <div className="file-tree-content">
        {Object.entries(groupedFiles).map(([dir, dirFiles]) => (
          <div key={dir} className="file-tree-group">
            <div className="file-tree-dir">
              📁 {dir || 'root'}
            </div>
            {dirFiles.map((file) => (
              <div
                key={file.path}
                className={`file-tree-item ${file.type}`}
                onClick={() => onFileSelect(file.path)}
              >
                <span className="file-icon">{getFileIcon(file.type)}</span>
                <span className="file-name">{file.path.split('/').pop()}</span>
                <span className="file-path">{file.path}</span>
                <div className="file-meta">
                  <span className={`file-type-badge ${file.type}`}>
                    {file.type === 'modified' ? 'M' : file.type === 'added' ? 'A' : 'D'}
                  </span>
                  {file.newSize !== undefined && (
                    <span className="file-size">
                      {formatSize(file.newSize)}
                    </span>
                  )}
                  {getStatusBadge(file)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SandboxFileTree;
