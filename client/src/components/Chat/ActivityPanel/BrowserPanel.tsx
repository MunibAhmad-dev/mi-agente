/**
 * BrowserPanel - Visualización del navegador en tiempo real
 */

import React, { useEffect, useRef } from 'react';
import {
  Globe,
  Loader2,
  X,
  RefreshCw,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { useTaskMonitor } from '~/hooks/useTaskMonitor';
import { cn } from '~/utils';

interface BrowserPanelProps {
  className?: string;
}

/**
 * BrowserPanel - Muestra estado del navegador
 */
export const BrowserPanel: React.FC<BrowserPanelProps> = ({ className }) => {
  const {
    browser,
    browserNavigate,
    browserClose,
    browserOpen,
  } = useTaskMonitor();

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus en input de URL
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputRef.current?.value) {
      browserNavigate(inputRef.current.value);
    }
  };

  if (!browser.isOpen && !browser.url) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full text-gray-400', className)}>
        <Globe size={48} className="mb-4 opacity-50" />
        <p className="text-sm mb-4">Navegador cerrado</p>
        <button
          onClick={browserOpen}
          className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Abrir navegador
        </button>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Barra de URL */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <Globe size={16} className="text-gray-500 flex-shrink-0" />
        
        <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            defaultValue={browser.url}
            placeholder="Ingresa URL..."
            className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded text-sm transition-colors"
          >
            Ir
          </button>
        </form>

        {browser.loading && (
          <Loader2 size={16} className="animate-spin text-indigo-500" />
        )}

        <button
          onClick={() => browserNavigate(browser.url)}
          className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          title="Recargar"
        >
          <RefreshCw size={14} />
        </button>

        <button
          onClick={browserClose}
          className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          title="Cerrar"
        >
          <X size={14} />
        </button>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-auto">
        {browser.loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 size={32} className="animate-spin text-indigo-500 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Cargando...</p>
            </div>
          </div>
        ) : browser.screenshot ? (
          <img
            src={browser.screenshot}
            alt={browser.title || 'Página'}
            className="w-full h-auto"
          />
        ) : browser.url ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Globe size={48} className="mb-4 opacity-50" />
            <p className="text-sm mb-1">{browser.title || browser.url}</p>
            <a
              href={browser.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-600"
            >
              Abrir en nueva pestaña
              <ExternalLink size={12} />
            </a>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Globe size={48} className="mb-4 opacity-50" />
            <p className="text-sm">Ingresa una URL para comenzar</p>
          </div>
        )}
      </div>

      {/* Errores */}
      {browser.errors.length > 0 && (
        <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs">
            <AlertCircle size={14} />
            <span>{browser.errors[browser.errors.length - 1]}</span>
          </div>
        </div>
      )}

      {/* Historial */}
      {browser.history.length > 0 && (
        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-400 mb-1">Historial:</p>
          <div className="flex flex-wrap gap-1">
            {browser.history.slice(-5).map((url, i) => (
              <button
                key={i}
                onClick={() => browserNavigate(url)}
                className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-xs text-gray-600 dark:text-gray-400 truncate max-w-32"
              >
                {new URL(url).hostname}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BrowserPanel;
