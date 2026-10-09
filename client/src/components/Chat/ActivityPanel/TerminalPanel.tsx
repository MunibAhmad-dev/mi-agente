/**
 * TerminalPanel - Visualización de terminal en tiempo real
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Terminal,
  Trash2,
  Copy,
  Check,
  ChevronUp,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { useTaskMonitor } from '~/hooks/useTaskMonitor';
import { cn } from '~/utils';

interface TerminalPanelProps {
  className?: string;
  maxHeight?: string;
}

/**
 * Formatear timestamp
 */
function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * TerminalPanel - Muestra salida de terminal en tiempo real
 */
export const TerminalPanel: React.FC<TerminalPanelProps> = ({ 
  className,
  maxHeight = '100%',
}) => {
  const {
    terminalEntries,
    terminalClear,
    terminalInput,
    terminalSetExecuting,
  } = useTaskMonitor();

  const [input, setInput] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al final
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalEntries, autoScroll]);

  // Detectar scroll manual
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      terminalInput(input);
      setInput('');
    }
  };

  const handleCopy = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Terminal
          </span>
          {terminalEntries.some(e => e.type === 'input') && (
            <span className="text-xs text-gray-400">
              ~/workspace
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Indicador de ejecución */}
          {terminalEntries.some(e => e.type === 'input') && 
           !terminalEntries.slice(-1)[0]?.content.startsWith('$') && (
            <Loader2 size={14} className="animate-spin text-green-500" />
          )}

          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn(
              'p-1.5 rounded transition-colors',
              autoScroll
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-500'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500'
            )}
            title="Auto-scroll"
          >
            {autoScroll ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>

          {/* Copiar todo */}
          <button
            onClick={() => handleCopy(
              terminalEntries.map(e => e.content).join('\n'),
              'all'
            )}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="Copiar todo"
          >
            {copied === 'all' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>

          {/* Limpiar */}
          <button
            onClick={terminalClear}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="Limpiar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Contenido */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-gray-900 font-mono text-sm"
        style={{ maxHeight }}
      >
        {terminalEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <Terminal size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Terminal vacía</p>
              <p className="text-xs mt-1">Los comandos aparecerán aquí</p>
            </div>
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {terminalEntries.map((entry) => (
              <div key={entry.id} className="flex group">
                {/* Timestamp */}
                <span className="flex-shrink-0 w-20 text-gray-500 text-xs pr-2 select-none">
                  {formatTime(entry.timestamp)}
                </span>

                {/* Contenido */}
                <div className={cn(
                  'flex-1 break-all whitespace-pre-wrap',
                  entry.type === 'input' && 'text-green-400',
                  entry.type === 'output' && 'text-gray-300',
                  entry.type === 'error' && 'text-red-400',
                  entry.type === 'system' && 'text-yellow-400 italic',
                )}>
                  {entry.type === 'input' && '$ '}
                  {entry.content}
                </div>

                {/* Acciones */}
                <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleCopy(entry.content, entry.id)}
                    className="p-1 hover:bg-gray-800 rounded"
                    title="Copiar"
                  >
                    {copied === entry.id ? (
                      <Check size={12} className="text-green-500" />
                    ) : (
                      <Copy size={12} className="text-gray-500" />
                    )}
                  </button>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input (opcional - para simular) */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-t border-gray-700"
      >
        <span className="text-green-400 font-mono">$</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Comando..."
          className="flex-1 bg-transparent text-gray-300 font-mono text-sm focus:outline-none placeholder-gray-500"
        />
        <span className="text-xs text-gray-500">
          {terminalEntries.length} líneas
        </span>
      </form>
    </div>
  );
};

export default TerminalPanel;
