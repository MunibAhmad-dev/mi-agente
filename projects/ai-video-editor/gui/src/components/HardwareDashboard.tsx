/**
 * Hardware Dashboard - System hardware detection and resource monitoring.
 */

import React, { useState, useEffect } from "react";

export function HardwareDashboard() {
  const [hardware, setHardware] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const h = await window.api.hardware.detect();
        setHardware(h);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="loading">Detecting hardware...</div>;
  if (!hardware) return <div className="error">Failed to detect hardware</div>;

  const vramUsed = hardware.gpus.reduce((sum: number, g: any) => sum + g.vram, 0);
  const ramGB = Math.round(hardware.totalRAM / (1024 ** 3));
  const availGB = Math.round(hardware.availableRAM / (1024 ** 3));
  const diskGB = Math.round(hardware.diskSpace.total / (1024 ** 3));
  const diskAvailGB = Math.round(hardware.diskSpace.available / (1024 ** 3));

  return (
    <div className="screen hardware-dashboard">
      <header className="screen-header">
        <h2>💻 Hardware Dashboard</h2>
        <p className="subtitle">Detected hardware, scores, and recommended configurations.</p>
      </header>

      {/* Score Cards */}
      <div className="score-cards">
        <ScoreCard label="AI Score" value={hardware.aiScore} max={100} color="#10b981" />
        <ScoreCard label="Compute" value={hardware.computeScore} max={100} color="#3b82f6" />
        <ScoreCard label="Memory" value={hardware.memoryScore} max={100} color="#8b5cf6" />
        <ScoreCard label="Video" value={hardware.videoScore} max={100} color="#f59e0b" />
      </div>

      {/* CPU */}
      <div className="card">
        <h3>🖥️ CPU</h3>
        <div className="hw-detail">
          <span className="hw-label">Model:</span>
          <span className="hw-value">{hardware.cpu.model}</span>
        </div>
        <div className="hw-detail">
          <span className="hw-label">Cores:</span>
          <span className="hw-value">{hardware.cpu.cores} cores / {hardware.cpu.threads} threads</span>
        </div>
        <div className="hw-detail">
          <span className="hw-label">Speed:</span>
          <span className="hw-value">{hardware.cpu.speed} MHz</span>
        </div>
        <div className="hw-detail">
          <span className="hw-label">Architecture:</span>
          <span className="hw-value">{hardware.cpu.architecture}</span>
        </div>
      </div>

      {/* GPU(s) */}
      {hardware.gpus.map((gpu: any, i: number) => (
        <div key={i} className="card">
          <h3>🎮 GPU {i + 1}</h3>
          <div className="hw-detail">
            <span className="hw-label">Name:</span>
            <span className="hw-value">{gpu.name}</span>
          </div>
          <div className="hw-detail">
            <span className="hw-label">Vendor:</span>
            <span className="hw-value">{gpu.vendor}</span>
          </div>
          <div className="hw-detail">
            <span className="hw-label">VRAM:</span>
            <span className="hw-value">{Math.round(gpu.vram / (1024 ** 3))} GB</span>
          </div>
          {gpu.cudaCores && (
            <div className="hw-detail">
              <span className="hw-label">CUDA Cores:</span>
              <span className="hw-value">{gpu.cudaCores}</span>
            </div>
          )}
          {gpu.computeCapability && (
            <div className="hw-detail">
              <span className="hw-label">Compute:</span>
              <span className="hw-value">{gpu.computeCapability}</span>
            </div>
          )}
        </div>
      ))}

      {/* RAM & Disk */}
      <div className="hw-row">
        <div className="card half">
          <h3>🧠 RAM</h3>
          <div className="resource-bar">
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${((ramGB - availGB) / ramGB) * 100}%` }} />
            </div>
            <span>{availGB} GB free / {ramGB} GB total</span>
          </div>
        </div>
        <div className="card half">
          <h3>💾 Disk</h3>
          <div className="resource-bar">
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${((diskGB - diskAvailGB) / diskGB) * 100}%` }} />
            </div>
            <span>{diskAvailGB} GB free / {diskGB} GB total</span>
          </div>
        </div>
      </div>

      {/* System Info */}
      <div className="card">
        <h3>ℹ️ System</h3>
        <div className="hw-detail">
          <span className="hw-label">OS:</span>
          <span className="hw-value">{hardware.os} {hardware.osVersion}</span>
        </div>
        <div className="hw-detail">
          <span className="hw-label">Platform:</span>
          <span className="hw-value">{hardware.platform} ({hardware.arch})</span>
        </div>
        <div className="hw-detail">
          <span className="hw-label">CUDA:</span>
          <span className="hw-value">{hardware.cudaAvailable ? "✅ Available" : "❌ Not available"}</span>
        </div>
        <div className="hw-detail">
          <span className="hw-label">ROCm:</span>
          <span className="hw-value">{hardware.rocmAvailable ? "✅ Available" : "❌ Not available"}</span>
        </div>
      </div>

      {/* Recommendations */}
      {(hardware.recommendedModels.length > 0 || hardware.recommendedWorkflows.length > 0) && (
        <div className="card">
          <h3>💡 Recommendations</h3>
          {hardware.recommendedModels.length > 0 && (
            <div className="rec-section">
              <h4>Recommended Models:</h4>
              {hardware.recommendedModels.map((m: string, i: number) => (
                <span key={i} className="rec-tag">{m}</span>
              ))}
            </div>
          )}
          {hardware.recommendedWorkflows.length > 0 && (
            <div className="rec-section">
              <h4>Recommended Workflows:</h4>
              {hardware.recommendedWorkflows.map((w: string, i: number) => (
                <span key={i} className="rec-tag">{w}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreCard({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="score-card">
      <div className="score-circle" style={{ borderColor: color }}>
        <span className="score-num">{value}</span>
      </div>
      <label>{label}</label>
    </div>
  );
}
