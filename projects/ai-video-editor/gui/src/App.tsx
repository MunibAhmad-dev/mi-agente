/**
 * AI Creative OS - Main App Component
 */

import React, { useState, useEffect, useCallback } from "react";
import type { TabId, SystemStatus } from "./types";
import { CreativeStudio } from "./components/CreativeStudio";
import { StyleLab } from "./components/StyleLab";
import { ProviderManager } from "./components/ProviderManager";
import { HardwareDashboard } from "./components/HardwareDashboard";
import { TaskMonitor } from "./components/TaskMonitor";
import { ProjectBrowser } from "./components/ProjectBrowser";
import "./styles/app.css";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "studio", label: "Creative Studio", icon: "🎬" },
  { id: "style", label: "Style Lab", icon: "🎨" },
  { id: "providers", label: "Providers", icon: "🔧" },
  { id: "hardware", label: "Hardware", icon: "💻" },
  { id: "tasks", label: "Tasks", icon: "📋" },
  { id: "projects", label: "Projects", icon: "📁" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("studio");
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        await window.api.system.initialize();
        const s = await window.api.system.status();
        setStatus(s);
      } catch (err) {
        console.error("Init failed:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const renderScreen = useCallback(() => {
    switch (activeTab) {
      case "studio": return <CreativeStudio />;
      case "style": return <StyleLab />;
      case "providers": return <ProviderManager />;
      case "hardware": return <HardwareDashboard />;
      case "tasks": return <TaskMonitor />;
      case "projects": return <ProjectBrowser />;
      default: return <CreativeStudio />;
    }
  }, [activeTab]);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <h2>AI Creative OS</h2>
        <p>Initializing system...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-header">
          <div className="logo">⚡</div>
          <h1>AI Creative OS</h1>
        </div>

        <div className="sidebar-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`sidebar-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          {status && (
            <div className="status-bar">
              <div className="status-item">
                <span className="status-dot green" />
                {status.capabilities} capabilities
              </div>
              <div className="status-item">
                <span className="status-dot blue" />
                {status.installedAdapters}/{status.adapters} adapters
              </div>
              <div className="status-item">
                <span className="status-dot purple" />
                {status.providers} providers
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-content">
        {renderScreen()}
      </main>
    </div>
  );
}
