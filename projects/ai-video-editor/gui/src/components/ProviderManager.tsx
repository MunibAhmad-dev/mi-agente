/**
 * Provider Manager - Detect, list, and manage providers, adapters, and models.
 */

import React, { useState, useEffect } from "react";

export function ProviderManager() {
  const [adapters, setAdapters] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [a, m, c] = await Promise.all([
          window.api.adapters.detect(),
          window.api.models.list(),
          window.api.catalog.list(),
        ]);
        setAdapters(a);
        setModels(m);
        setCatalog(c);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="loading">Loading providers...</div>;

  return (
    <div className="screen provider-manager">
      <header className="screen-header">
        <h2>🔧 Providers & Adapters</h2>
        <p className="subtitle">Detected tools, registered models, and workflow catalog.</p>
      </header>

      {/* Adapters */}
      <div className="card">
        <h3>🔌 Detected Adapters ({adapters.filter(a => a.detected).length}/{adapters.length})</h3>
        <div className="adapter-grid">
          {adapters.map((adapter) => (
            <div key={adapter.name} className={`adapter-card ${adapter.detected ? "active" : "inactive"}`}>
              <div className="adapter-header">
                <span className="adapter-icon">{adapter.detected ? "✅" : "❌"}</span>
                <h4>{adapter.name}</h4>
                {adapter.version && <span className="version">v{adapter.version}</span>}
              </div>
              {adapter.capabilities && (
                <div className="adapter-caps">
                  {adapter.capabilities.slice(0, 3).map((cap: any, i: number) => (
                    <span key={i} className="cap-tag">{cap.name}</span>
                  ))}
                </div>
              )}
              {adapter.error && <p className="adapter-error">{adapter.error}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Models */}
      <div className="card">
        <h3>🤖 Registered Models ({models.length})</h3>
        <div className="model-grid">
          {models.map((model) => (
            <div key={model.id} className={`model-card ${model.status}`}>
              <div className="model-header">
                <h4>{model.name}</h4>
                <span className={`status-badge ${model.status}`}>{model.status}</span>
              </div>
              <div className="model-info">
                <span>Family: {model.family}</span>
                <span>VRAM: {Math.round(model.vramRequired / (1024 ** 3))}GB</span>
                <span>License: {model.license}</span>
              </div>
              <div className="model-quants">
                {model.quantizations.map((q: string) => (
                  <span key={q} className="quant-tag">{q}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Workflow Catalog */}
      <div className="card">
        <h3>📦 Workflow Catalog ({catalog.length})</h3>
        <div className="catalog-grid">
          {catalog.map((wf) => (
            <div key={wf.id} className="catalog-card">
              <h4>{wf.name}</h4>
              <div className="catalog-info">
                <span>{wf.family}/{wf.mode}</span>
                <span>{wf.variant}</span>
                <span>VRAM: {Math.round(wf.minVRAM / (1024 ** 3))}GB min</span>
              </div>
              <p className="catalog-desc">{wf.description}</p>
              <div className="catalog-meta">
                <span>{wf.sourceLicense}</span>
                <span>{wf.modelLicense}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
