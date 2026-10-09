/**
 * Project Browser - List, create, and manage projects.
 */

import React, { useState, useEffect } from "react";

export function ProjectBrowser() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    try {
      const p = await window.api.projects.list();
      setProjects(p);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await window.api.projects.create(newName);
      setNewName("");
      await refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "completed": return "#10b981";
      case "in_progress": return "#3b82f6";
      case "rendering": return "#f59e0b";
      case "failed": return "#ef4444";
      case "archived": return "#6b7280";
      default: return "#8b5cf6";
    }
  };

  if (loading) return <div className="loading">Loading projects...</div>;

  return (
    <div className="screen project-browser">
      <header className="screen-header">
        <h2>📁 Projects</h2>
        <p className="subtitle">{projects.length} projects</p>
      </header>

      {/* Create Project */}
      <div className="card create-project">
        <h3>Create New Project</h3>
        <div className="input-row">
          <input
            className="text-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name..."
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !newName.trim()}>
            {creating ? "⏳ Creating..." : "➕ Create"}
          </button>
        </div>
      </div>

      {/* Project List */}
      {projects.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📁</div>
          <h3>No Projects Yet</h3>
          <p>Create your first project above, or use the Creative Studio to generate one.</p>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((project) => (
            <div key={project.id} className="project-card">
              <div className="project-header">
                <h4>{project.name}</h4>
                <span className="status-dot" style={{ backgroundColor: statusColor(project.status) }} />
              </div>
              <div className="project-info">
                <span>Status: {project.status}</span>
                <span>Version: v{project.version}</span>
              </div>
              {project.sequences?.length > 0 && (
                <div className="project-sequences">
                  <span>{project.sequences.length} sequence(s)</span>
                </div>
              )}
              <div className="project-meta">
                <span>Created: {new Date(project.createdAt).toLocaleDateString()}</span>
                <span>Updated: {new Date(project.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
