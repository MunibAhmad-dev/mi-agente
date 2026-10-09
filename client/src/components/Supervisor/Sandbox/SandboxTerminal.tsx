/**
 * SandboxTerminal Component
 *
 * Terminal integrada para ejecutar comandos en el sandbox
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useExecuteInSandbox, useGetTerminalHistory } from '~/hooks/supervisor/useSandbox';
import './SandboxTerminal.css';

interface SandboxTerminalProps {
  sandboxId: string;
}

interface TerminalEntry {
  id: string;
  command: string;
  result: {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    duration: number;
  };
  timestamp: Date;
}

const SandboxTerminal: React.FC<SandboxTerminalProps> = ({ sandboxId }) => {
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  const executeCommand = useExecuteInSandbox();
  const { data: historyData } = useGetTerminalHistory(sandboxId);

  const history: TerminalEntry[] = historyData?.history || [];

  const scrollToBottom = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [history, scrollToBottom]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isRunning) return;

    setIsRunning(true);
    try {
      await executeCommand.mutateAsync({
        sandboxId,
        command: input.trim(),
      });
      setInput('');
    } catch (error) {
      console.error('Error executing command:', error);
    } finally {
      setIsRunning(false);
    }
  }, [input, isRunning, sandboxId, executeCommand]);

  const handleClear = useCallback(() => {
    // Note: Actual clearing would need backend support
    console.log('Clear terminal');
  }, []);

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="sandbox-terminal">
      <div className="terminal-header">
        <span className="terminal-title">Terminal</span>
        <button className="terminal-btn" onClick={handleClear}>
          Clear
        </button>
      </div>

      <div className="terminal-output" ref={terminalRef}>
        {history.length === 0 && (
          <div className="terminal-empty">
            <p>Terminal ready. Type a command to execute.</p>
          </div>
        )}

        {history.map((entry) => (
          <div key={entry.id} className="terminal-entry">
            <div className="terminal-command">
              <span className="terminal-prompt">$</span>
              <span className="terminal-cmd">{entry.command}</span>
            </div>

            {entry.result.stdout && (
              <pre className="terminal-stdout">{entry.result.stdout}</pre>
            )}

            {entry.result.stderr && (
              <pre className="terminal-stderr">{entry.result.stderr}</pre>
            )}

            <div className={`terminal-exit ${entry.result.success ? 'success' : 'error'}`}>
              <span>Exit: {entry.result.exitCode}</span>
              <span>{formatDuration(entry.result.duration)}</span>
            </div>
          </div>
        ))}
      </div>

      <form className="terminal-input-form" onSubmit={handleSubmit}>
        <span className="terminal-prompt">$</span>
        <input
          type="text"
          className="terminal-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter command..."
          disabled={isRunning}
          autoFocus
        />
        <button
          type="submit"
          className="terminal-submit"
          disabled={isRunning || !input.trim()}
        >
          {isRunning ? '...' : 'Run'}
        </button>
      </form>
    </div>
  );
};

export default SandboxTerminal;
