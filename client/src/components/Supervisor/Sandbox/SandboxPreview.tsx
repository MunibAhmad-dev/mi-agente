/**
 * SandboxPreview Component
 *
 * Preview de archivos en el sandbox
 */

import React, { useMemo } from 'react';
import { useReadFile } from '~/hooks/supervisor/useSandbox';
import './SandboxPreview.css';

interface SandboxPreviewProps {
  sandboxId: string;
  filePath: string;
}

const SandboxPreview: React.FC<SandboxPreviewProps> = ({ sandboxId, filePath }) => {
  const { data, isLoading, isError } = useReadFile(sandboxId, filePath);

  const file = data?.file;

  const language = useMemo(() => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
      cs: 'csharp',
      php: 'php',
      html: 'html',
      css: 'css',
      scss: 'scss',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      md: 'markdown',
      sql: 'sql',
      sh: 'bash',
      bash: 'bash',
      xml: 'xml',
      svg: 'xml',
    };
    return langMap[ext || ''] || 'plaintext';
  }, [filePath]);

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date?: string) => {
    if (!date) return '';
    return new Date(date).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="sandbox-preview">
        <div className="preview-loading">Loading file...</div>
      </div>
    );
  }

  if (isError || !file?.success) {
    return (
      <div className="sandbox-preview">
        <div className="preview-error">
          <p>Failed to load file</p>
          <p className="preview-error-detail">{file?.error || 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sandbox-preview">
      {/* Header */}
      <div className="preview-header">
        <div className="preview-file-info">
          <span className="preview-file-icon">📄</span>
          <span className="preview-file-name">{filePath.split('/').pop()}</span>
          <span className="preview-file-lang">{language}</span>
        </div>
        <div className="preview-meta">
          <span title="File size">{formatSize(file.size)}</span>
          {file.modified && (
            <span title="Last modified">{formatDate(file.modified)}</span>
          )}
        </div>
      </div>

      {/* Path */}
      <div className="preview-path">
        {filePath}
      </div>

      {/* Content */}
      <div className="preview-content">
        <pre className={`language-${language}`}>
          <code>{file.content}</code>
        </pre>
      </div>
    </div>
  );
};

export default SandboxPreview;
