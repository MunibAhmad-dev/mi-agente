/**
 * Creative Studio - The main production screen.
 * Intent → Parse → Preview Specification → Execute Production.
 */

import React, { useState } from "react";

interface IntentResult {
  specification?: any;
  analysis?: any;
}

interface ProductionResult {
  status: string;
  specification?: any;
  plan?: any;
  errors: string[];
}

export function CreativeStudio() {
  const [intent, setIntent] = useState("");
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [intentResult, setIntentResult] = useState<IntentResult | null>(null);
  const [productionResult, setProductionResult] = useState<ProductionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleParse = async () => {
    if (!intent.trim()) return;
    setParsing(true);
    setError(null);
    try {
      const result = await window.api.creative.parse(intent);
      setIntentResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setParsing(false);
    }
  };

  const handleGenerate = async () => {
    if (!intent.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await window.api.creative.process(intent);
      setProductionResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="screen creative-studio">
      <header className="screen-header">
        <h2>🎬 Creative Studio</h2>
        <p className="subtitle">Describe what you want to create. The system will plan, generate, and produce it.</p>
      </header>

      {/* Intent Input */}
      <div className="intent-section">
        <div className="input-group">
          <textarea
            className="intent-input"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="Example: Make a 30-second TikTok Short, fast pacing, cinematic style, with animated captions and a hook in the first 2 seconds..."
            rows={4}
          />
          <div className="input-actions">
            <button className="btn btn-secondary" onClick={handleParse} disabled={parsing || !intent.trim()}>
              {parsing ? "⏳ Parsing..." : "🔍 Parse Intent"}
            </button>
            <button className="btn btn-primary" onClick={handleGenerate} disabled={generating || !intent.trim()}>
              {generating ? "⏳ Generating..." : "🚀 Generate Production"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          ❌ {error}
        </div>
      )}

      {/* Intent Analysis */}
      {intentResult?.analysis && (
        <div className="card analysis-card">
          <h3>📊 Intent Analysis</h3>
          <div className="analysis-grid">
            <div className="analysis-item">
              <label>Platform</label>
              <span className="value">{intentResult.analysis.detectedPlatform}</span>
            </div>
            <div className="analysis-item">
              <label>Duration</label>
              <span className="value">{intentResult.analysis.detectedDuration / 1000}s</span>
            </div>
            <div className="analysis-item">
              <label>Pacing</label>
              <span className="value">{intentResult.analysis.detectedPacing}</span>
            </div>
            <div className="analysis-item">
              <label>Style</label>
              <span className="value">{intentResult.analysis.detectedStyle}</span>
            </div>
            <div className="analysis-item">
              <label>Confidence</label>
              <span className="value">{intentResult.analysis.confidence}%</span>
            </div>
            {intentResult.analysis.keywords?.length > 0 && (
              <div className="analysis-item full-width">
                <label>Keywords</label>
                <div className="tags">
                  {intentResult.analysis.keywords.slice(0, 8).map((kw: string, i: number) => (
                    <span key={i} className="tag">{kw}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Specification Preview */}
      {intentResult?.specification && (
        <div className="card spec-card">
          <h3>📋 Creative Specification</h3>
          <div className="spec-grid">
            <div className="spec-item">
              <label>Resolution</label>
              <span>{intentResult.specification.resolution.width}×{intentResult.specification.resolution.height}</span>
            </div>
            <div className="spec-item">
              <label>Aspect Ratio</label>
              <span>{intentResult.specification.aspectRatio}</span>
            </div>
            <div className="spec-item">
              <label>FPS</label>
              <span>{intentResult.specification.fps}</span>
            </div>
            <div className="spec-item">
              <label>Scenes</label>
              <span>{intentResult.specification.storyStructure.scenes.length}</span>
            </div>
            <div className="spec-item">
              <label>Effects</label>
              <span>{intentResult.specification.effects.join(", ") || "none"}</span>
            </div>
            <div className="spec-item">
              <label>Quality</label>
              <span>{intentResult.specification.qualityTarget}</span>
            </div>
          </div>
        </div>
      )}

      {/* Production Result */}
      {productionResult && (
        <div className="card production-card">
          <h3>✅ Production Result</h3>
          <div className="production-info">
            <div className="status-badge">{productionResult.status}</div>
            {productionResult.plan && (
              <>
                <p>Nodes: {productionResult.plan.graph.nodes.length}</p>
                <p>Estimated Duration: {(productionResult.plan.estimatedDuration / 1000).toFixed(1)}s</p>
                <p>Parallel Groups: {productionResult.plan.parallelizableGroups.length}</p>
                <div className="production-graph">
                  <h4>Production Graph</h4>
                  <div className="graph-nodes">
                    {productionResult.plan.graph.nodes.map((node: any, i: number) => (
                      <div key={node.id} className="graph-node">
                        <span className="node-index">{i + 1}</span>
                        <span className="node-name">{node.name}</span>
                        <span className="node-status">{node.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            {productionResult.errors.length > 0 && (
              <div className="errors-list">
                {productionResult.errors.map((err, i) => (
                  <div key={i} className="error-item">⚠️ {err}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
