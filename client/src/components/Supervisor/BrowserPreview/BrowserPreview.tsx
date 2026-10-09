/**
 * BrowserPreview Component
 *
 * Componente para previsualizar páginas web que el agente está usando
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import './BrowserPreview.css';

interface BrowserPreviewProps {
  sessionId?: string;
  agentId?: string;
  initialUrl?: string;
  onNavigate?: (url: string) => void;
  onScreenshot?: (screenshot: string) => void;
}

interface HistoryEntry {
  url: string;
  title: string;
  timestamp: Date;
}

interface BrowserState {
  url: string;
  title: string;
  loading: boolean;
  error: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
}

const BrowserPreview: React.FC<BrowserPreviewProps> = ({
  sessionId,
  agentId,
  initialUrl = 'about:blank',
  onNavigate,
  onScreenshot,
}) => {
  const [state, setState] = useState<BrowserState>({
    url: initialUrl,
    title: 'New Tab',
    loading: false,
    error: null,
    canGoBack: false,
    canGoForward: false,
  });

  const [history, setHistory] = useState<HistoryEntry[]>([
    { url: initialUrl, title: 'New Tab', timestamp: new Date() },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [activeTab, setActiveTab] = useState<'preview' | 'console'>('preview');
  const [consoleLogs, setConsoleLogs] = useState<Array<{ type: string; message: string; timestamp: Date }>>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [urlInput, setUrlInput] = useState(initialUrl);

  // Normalizar URL (agregar https:// si no tiene protocolo)
  const normalizeUrl = useCallback((url: string): string => {
    url = url.trim();
    if (!url) return 'about:blank';
    if (!url.includes('://') && !url.startsWith('about:')) {
      url = 'https://' + url;
    }
    return url;
  }, []);

  // Navegar a una URL
  const navigate = useCallback((url: string) => {
    const normalizedUrl = normalizeUrl(url);
    setState(prev => ({ ...prev, url: normalizedUrl, loading: true, error: null }));
    setUrlInput(normalizedUrl);

    // Agregar a historial
    const newEntry: HistoryEntry = {
      url: normalizedUrl,
      title: normalizedUrl,
      timestamp: new Date(),
    };
    setHistory(prev => [...prev.slice(0, historyIndex + 1), newEntry]);
    setHistoryIndex(prev => prev + 1);

    onNavigate?.(normalizedUrl);
  }, [normalizeUrl, historyIndex, onNavigate]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    navigate(urlInput);
  }, [urlInput, navigate]);

  // Ir atrás
  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const entry = history[newIndex];
      setState(prev => ({
        ...prev,
        url: entry.url,
        title: entry.title,
        canGoBack: newIndex > 0,
        canGoForward: newIndex < history.length - 1,
      }));
      setUrlInput(entry.url);
    }
  }, [historyIndex, history]);

  // Ir adelante
  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const entry = history[newIndex];
      setState(prev => ({
        ...prev,
        url: entry.url,
        title: entry.title,
        canGoBack: newIndex > 0,
        canGoForward: newIndex < history.length - 1,
      }));
      setUrlInput(entry.url);
    }
  }, [historyIndex, history]);

  // Recargar
  const reload = useCallback(() => {
    setState(prev => ({ ...prev, loading: true }));
    // Simular recarga
    setTimeout(() => {
      setState(prev => ({ ...prev, loading: false }));
    }, 1000);
  }, []);

  // Tomar screenshot
  const takeScreenshot = useCallback(() => {
    // En un browser real, esto capturaría la página
    // Por ahora simulamos
    const screenshot = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...`;
    onScreenshot?.(screenshot);
    alert('Screenshot captured!');
  }, [onScreenshot]);

  // Zoom
  const zoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 25, 200));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 25, 50));
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(100);
  }, []);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  // Agregar log de consola
  const addConsoleLog = useCallback((type: string, message: string) => {
    setConsoleLogs(prev => [
      ...prev,
      { type, message, timestamp: new Date() }
    ].slice(-100)); // Mantener últimos 100
  }, []);

  // Simular estado de carga
  useEffect(() => {
    if (state.loading) {
      const timer = setTimeout(() => {
        setState(prev => ({ ...prev, loading: false }));
        addConsoleLog('info', `Page loaded: ${state.url}`);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [state.loading, state.url, addConsoleLog]);

  return (
    <div className={`browser-preview ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* Toolbar */}
      <div className="browser-toolbar">
        <div className="toolbar-nav">
          <button
            className="nav-btn"
            onClick={goBack}
            disabled={!state.canGoBack}
            title="Back"
          >
            ←
          </button>
          <button
            className="nav-btn"
            onClick={goForward}
            disabled={!state.canGoForward}
            title="Forward"
          >
            →
          </button>
          <button
            className="nav-btn"
            onClick={reload}
            title="Reload"
          >
            ↻
          </button>
        </div>

        <form className="toolbar-url" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Enter URL..."
            className="url-input"
          />
          {state.loading && <div className="loading-indicator" />}
        </form>

        <div className="toolbar-actions">
          <button
            className="action-btn"
            onClick={() => setShowHistory(!showHistory)}
            title="History"
          >
            ⏱
          </button>
          <button
            className="action-btn"
            onClick={takeScreenshot}
            title="Screenshot"
          >
            📷
          </button>
          <button
            className="action-btn"
            onClick={toggleFullscreen}
            title="Fullscreen"
          >
            {isFullscreen ? '⛶' : '⤢'}
          </button>
        </div>
      </div>

      {/* Secondary Toolbar */}
      <div className="browser-toolbar-secondary">
        <div className="toolbar-tabs">
          <button
            className={`tab-btn ${activeTab === 'preview' ? 'active' : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            Preview
          </button>
          <button
            className={`tab-btn ${activeTab === 'console' ? 'active' : ''}`}
            onClick={() => setActiveTab('console')}
          >
            Console ({consoleLogs.length})
          </button>
        </div>

        <div className="toolbar-zoom">
          <button onClick={zoomOut}>−</button>
          <span onClick={resetZoom}>{zoom}%</span>
          <button onClick={zoomIn}>+</button>
        </div>
      </div>

      {/* Content */}
      <div className="browser-content">
        {activeTab === 'preview' ? (
          <div
            className="preview-frame"
            ref={contentRef}
            style={{ transform: `scale(${zoom / 100})` }}
          >
            {state.error ? (
              <div className="preview-error">
                <span className="error-icon">⚠️</span>
                <h4>Unable to load page</h4>
                <p>{state.error}</p>
                <button onClick={() => navigate(state.url)}>Try Again</button>
              </div>
            ) : state.loading ? (
              <div className="preview-loading">
                <div className="spinner" />
                <span>Loading...</span>
              </div>
            ) : (
              <iframe
                src={state.url}
                className="preview-iframe"
                title={state.title}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                onLoad={() => setState(prev => ({ ...prev, loading: false }))}
                onError={() => {
                  setState(prev => ({
                    ...prev,
                    loading: false,
                    error: 'Failed to load this page. The content may be blocked or the page may not exist.'
                  }));
                  addConsoleLog('error', `Failed to load: ${state.url}`);
                }}
              />
            )}
          </div>
        ) : (
          <div className="console-view">
            <div className="console-header">
              <span>Console</span>
              <button onClick={() => setConsoleLogs([])}>Clear</button>
            </div>
            <div className="console-logs">
              {consoleLogs.length === 0 ? (
                <div className="console-empty">No logs yet</div>
              ) : (
                consoleLogs.map((log, index) => (
                  <div key={index} className={`console-log log-${log.type}`}>
                    <span className="log-time">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                    <span className="log-message">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="browser-status">
        <span className="status-url">{state.url}</span>
        <span className="status-secure">
          {state.url.startsWith('https') ? '🔒 Secure' : '⚠️ Not secure'}
        </span>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="history-panel">
          <div className="history-header">
            <h4>History</h4>
            <button onClick={() => setShowHistory(false)}>✕</button>
          </div>
          <div className="history-list">
            {history.map((entry, index) => (
              <div
                key={index}
                className={`history-item ${index === historyIndex ? 'active' : ''}`}
                onClick={() => {
                  setHistoryIndex(index);
                  setState(prev => ({
                    ...prev,
                    url: entry.url,
                    title: entry.title,
                    canGoBack: index > 0,
                    canGoForward: index < history.length - 1,
                  }));
                  setUrlInput(entry.url);
                  setShowHistory(false);
                }}
              >
                <span className="history-time">
                  {entry.timestamp.toLocaleTimeString()}
                </span>
                <span className="history-url">{entry.url}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BrowserPreview;
