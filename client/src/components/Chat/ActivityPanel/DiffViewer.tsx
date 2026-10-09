/**
 * DiffViewer - Componente para mostrar diferencias entre archivos
 * 
 * Muestra: antes, después, líneas añadidas/eliminadas
 */

import React, { useMemo } from 'react';
import {
  Plus,
  Minus,
  Equal,
  FileText,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '~/utils';
import type { FileChange, ChangeType } from '~/store/changeInspectorStore';

/**
 * Props del DiffViewer
 */
interface DiffViewerProps {
  change: FileChange;
  mode?: 'split' | 'unified';
  showLineNumbers?: boolean;
  maxHeight?: string;
  className?: string;
}

/**
 * Tipo de línea en el diff
 */
type DiffLineType = 'add' | 'delete' | 'unchanged' | 'header';

/**
 * Línea del diff
 */
interface DiffLine {
  type: DiffLineType;
  content: string;
  lineNumber?: number;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * Analizador simple de diff
 */
function computeDiff(original: string | undefined, newContent: string | undefined): DiffLine[] {
  const result: DiffLine[] = [];
  
  const oldLines = (original || '').split('\n');
  const newLines = (newContent || '').split('\n');
  
  // Usar algoritmo LCS (Longest Common Subsequence) simplificado
  const lcs = computeLCS(oldLines, newLines);
  
  let oldIndex = 0;
  let newIndex = 0;
  let lcsIndex = 0;
  
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (lcsIndex < lcs.length) {
      // Mostrar eliminaciones hasta el siguiente match
      while (oldIndex < oldLines.length && oldLines[oldIndex] !== lcs[lcsIndex]) {
        result.push({
          type: 'delete',
          content: oldLines[oldIndex],
          oldLineNumber: oldIndex + 1,
        });
        oldIndex++;
      }
      
      // Mostrar adiciones hasta el siguiente match
      while (newIndex < newLines.length && newLines[newIndex] !== lcs[lcsIndex]) {
        result.push({
          type: 'add',
          content: newLines[newIndex],
          newLineNumber: newIndex + 1,
        });
        newIndex++;
      }
      
      // Mostrar línea sin cambios
      if (oldIndex < oldLines.length && newIndex < newLines.length) {
        result.push({
          type: 'unchanged',
          content: oldLines[oldIndex],
          oldLineNumber: oldIndex + 1,
          newLineNumber: newIndex + 1,
        });
        oldIndex++;
        newIndex++;
        lcsIndex++;
      }
    } else {
      // Ya no hay más matches en LCS
      // Mostrar lo que queda
      while (oldIndex < oldLines.length) {
        result.push({
          type: 'delete',
          content: oldLines[oldIndex],
          oldLineNumber: oldIndex + 1,
        });
        oldIndex++;
      }
      
      while (newIndex < newLines.length) {
        result.push({
          type: 'add',
          content: newLines[newIndex],
          newLineNumber: newIndex + 1,
        });
        newIndex++;
      }
    }
  }
  
  return result;
}

/**
 * Calcular LCS entre dos arrays
 */
function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  
  // Matriz de DP
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  // Reconstruir LCS
  const lcs: string[] = [];
  let i = m, j = n;
  
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  
  return lcs;
}

/**
 * Vista de línea individual del diff
 */
const DiffLine: React.FC<{
  line: DiffLine;
  showOldNumbers?: boolean;
  showNewNumbers?: boolean;
}> = ({ line, showOldNumbers, showNewNumbers }) => {
  const getPrefix = () => {
    switch (line.type) {
      case 'add': return '+';
      case 'delete': return '-';
      case 'unchanged': return ' ';
      default: return '';
    }
  };

  const getBgColor = () => {
    switch (line.type) {
      case 'add': return 'bg-green-50 dark:bg-green-900/20';
      case 'delete': return 'bg-red-50 dark:bg-red-900/20';
      default: return '';
    }
  };

  const getTextColor = () => {
    switch (line.type) {
      case 'add': return 'text-green-700 dark:text-green-400';
      case 'delete': return 'text-red-700 dark:text-red-400';
      default: return 'text-gray-700 dark:text-gray-300';
    }
  };

  const prefixColor = line.type === 'add' 
    ? 'text-green-500' 
    : line.type === 'delete' 
      ? 'text-red-500' 
      : 'text-gray-400';

  return (
    <div className={cn('flex font-mono text-sm leading-6', getBgColor(), getTextColor())}>
      {/* Números de línea old */}
      {showOldNumbers && (
        <div className="flex-shrink-0 w-12 text-right pr-4 text-gray-400 select-none border-r border-gray-200 dark:border-gray-700">
          {line.oldLineNumber || ''}
        </div>
      )}
      
      {/* Números de línea new */}
      {showNewNumbers && (
        <div className="flex-shrink-0 w-12 text-right pr-4 text-gray-400 select-none border-r border-gray-200 dark:border-gray-700">
          {line.newLineNumber || ''}
        </div>
      )}
      
      {/* Prefijo */}
      <div className={cn('flex-shrink-0 w-6 text-center', prefixColor)}>
        {getPrefix()}
      </div>
      
      {/* Contenido */}
      <div className="flex-1 px-2 whitespace-pre-wrap break-all">
        {line.content || ' '}
      </div>
    </div>
  );
};

/**
 * Vista de archivo completo (para created/deleted)
 */
const FullFileView: React.FC<{
  content: string;
  type: 'create' | 'delete';
  showLineNumbers?: boolean;
}> = ({ content, type, showLineNumbers }) => {
  const lines = content.split('\n');
  
  return (
    <div className="overflow-x-auto">
      {lines.map((line, index) => (
        <DiffLine
          key={index}
          line={{
            type: type === 'create' ? 'add' : 'delete',
            content: line,
            oldLineNumber: type === 'delete' ? index + 1 : undefined,
            newLineNumber: type === 'create' ? index + 1 : undefined,
          }}
          showOldNumbers={showLineNumbers && type === 'delete'}
          showNewNumbers={showLineNumbers && type === 'create'}
        />
      ))}
    </div>
  );
};

/**
 * DiffViewer - Componente principal
 */
export const DiffViewer: React.FC<DiffViewerProps> = ({
  change,
  mode = 'unified',
  showLineNumbers = true,
  maxHeight = '400px',
  className,
}) => {
  const [copied, setCopied] = React.useState(false);

  // Calcular diff
  const diffLines = useMemo(() => {
    if (change.type === 'create') {
      return null; // Usar FullFileView
    }
    if (change.type === 'delete') {
      return null; // Usar FullFileView
    }
    return computeDiff(change.originalContent, change.newContent);
  }, [change]);

  // Copiar al portapapeles
  const handleCopy = async () => {
    const content = change.newContent || change.originalContent || '';
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Resumen de cambios
  const summary = useMemo(() => {
    if (change.type === 'create') {
      const lines = (change.newContent || '').split('\n').length;
      return `${lines} líneas`;
    }
    if (change.type === 'delete') {
      const lines = (change.originalContent || '').split('\n').length;
      return `${lines} líneas eliminadas`;
    }
    return `+${change.additions || 0} -${change.deletions || 0}`;
  }, [change]);

  // Render para archivos nuevos
  if (change.type === 'create') {
    return (
      <div className={cn('border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden', className)}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Plus size={14} className="text-green-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Nuevo archivo
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{summary}</span>
            <button
              onClick={handleCopy}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              title="Copiar contenido"
            >
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
        
        {/* Contenido */}
        <div className="overflow-auto" style={{ maxHeight }}>
          <FullFileView
            content={change.newContent || ''}
            type="create"
            showLineNumbers={showLineNumbers}
          />
        </div>
      </div>
    );
  }

  // Render para archivos eliminados
  if (change.type === 'delete') {
    return (
      <div className={cn('border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden', className)}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Minus size={14} className="text-red-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Archivo eliminado
            </span>
          </div>
          <span className="text-xs text-gray-500">{summary}</span>
        </div>
        
        {/* Contenido */}
        <div className="overflow-auto bg-red-50/50 dark:bg-red-900/10" style={{ maxHeight }}>
          <FullFileView
            content={change.originalContent || ''}
            type="delete"
            showLineNumbers={showLineNumbers}
          />
        </div>
      </div>
    );
  }

  // Render para archivos modificados (con diff)
  return (
    <div className={cn('border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-blue-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {change.path.split('/').pop()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs">
            <span className="text-green-600 dark:text-green-400">+{change.additions || 0}</span>
            <span className="mx-1">/</span>
            <span className="text-red-600 dark:text-red-400">-{change.deletions || 0}</span>
          </span>
          <button
            onClick={handleCopy}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            title="Copiar nuevo contenido"
          >
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      
      {/* Contenido */}
      <div className="overflow-auto" style={{ maxHeight }}>
        {diffLines && diffLines.map((line, index) => (
          <DiffLine
            key={index}
            line={line}
            showOldNumbers={showLineNumbers}
            showNewNumbers={showLineNumbers}
          />
        ))}
      </div>
    </div>
  );
};

export default DiffViewer;
