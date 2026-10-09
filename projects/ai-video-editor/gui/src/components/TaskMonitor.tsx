/**
 * Task Monitor - Track queued, running, paused, completed, and failed tasks.
 */

import React, { useState, useEffect } from "react";

export function TaskMonitor() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const t = await window.api.tasks.list();
      setTasks(t);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, []);

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed": return "✅";
      case "running": return "▶️";
      case "failed": return "❌";
      case "queued": return "⏳";
      case "paused": return "⏸️";
      case "recovering": return "🔄";
      case "cancelled": return "🚫";
      default: return "❓";
    }
  };

  if (loading) return <div className="loading">Loading tasks...</div>;

  return (
    <div className="screen task-monitor">
      <header className="screen-header">
        <h2>📋 Task Monitor</h2>
        <p className="subtitle">{tasks.length} total tasks</p>
        <button className="btn btn-secondary" onClick={refresh}>🔄 Refresh</button>
      </header>

      {tasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <h3>No Tasks</h3>
          <p>Tasks will appear here when you generate productions.</p>
        </div>
      ) : (
        <div className="task-list">
          {tasks.map((task) => (
            <div key={task.id} className={`task-card ${task.status}`}>
              <div className="task-header">
                <span className="task-icon">{statusIcon(task.status)}</span>
                <h4>{task.name}</h4>
                <span className={`status-badge ${task.status}`}>{task.status}</span>
              </div>
              <div className="task-info">
                <span>Type: {task.type}</span>
                {task.provider && <span>Provider: {task.provider}</span>}
                <span>Priority: {task.priority}</span>
              </div>
              {task.status === "running" && (
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${task.progress}%` }} />
                  <span className="progress-text">{task.progress}%</span>
                </div>
              )}
              {task.error && <p className="task-error">⚠️ {task.error}</p>}
              <div className="task-meta">
                <span>Retries: {task.retries}/{task.maxRetries}</span>
                {task.vramUsed && <span>VRAM: {Math.round(task.vramUsed / (1024 ** 3))}GB</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
