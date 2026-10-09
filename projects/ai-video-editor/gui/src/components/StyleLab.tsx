/**
 * Style Lab - Analyze, compare, and learn visual styles from reference videos.
 */

import React, { useState } from "react";

export function StyleLab() {
  const [videoPath, setVideoPath] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [learnResult, setLearnResult] = useState<any>(null);
  const [styleA, setStyleA] = useState<any>(null);
  const [styleB, setStyleB] = useState<any>(null);
  const [comparison, setComparison] = useState<any>(null);

  const handleSelectVideo = async () => {
    const path = await window.api.dialog.openFile({
      filters: [{ name: "Video", extensions: ["mp4", "mov", "avi", "mkv", "webm"] }],
    });
    if (path) setVideoPath(path);
  };

  const handleAnalyze = async () => {
    if (!videoPath) return;
    setAnalyzing(true);
    try {
      const dna = await window.api.style.learn(videoPath);
      setLearnResult(dna);
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCompare = async () => {
    if (!styleA || !styleB) return;
    try {
      const result = await window.api.style.compare(styleA, styleB);
      setComparison(result);
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerateStyleA = async () => {
    const dna = await window.api.style.analyze({ averageShotLength: 1.5, cutFrequency: 0.8, contrast: 0.7 });
    setStyleA(dna);
  };

  const handleGenerateStyleB = async () => {
    const dna = await window.api.style.analyze({ averageShotLength: 4.0, cutFrequency: 0.3, contrast: 0.4 });
    setStyleB(dna);
  };

  return (
    <div className="screen style-lab">
      <header className="screen-header">
        <h2>🎨 Style Lab</h2>
        <p className="subtitle">Learn visual styles from reference videos, compare and mix creative DNA.</p>
      </header>

      {/* Video Analysis */}
      <div className="card">
        <h3>📹 Learn Style from Video</h3>
        <div className="input-row">
          <input
            className="text-input"
            value={videoPath}
            onChange={(e) => setVideoPath(e.target.value)}
            placeholder="Select a reference video..."
            readOnly
          />
          <button className="btn btn-secondary" onClick={handleSelectVideo}>Browse</button>
          <button className="btn btn-primary" onClick={handleAnalyze} disabled={analyzing || !videoPath}>
            {analyzing ? "⏳ Analyzing..." : "🔍 Analyze Style"}
          </button>
        </div>

        {learnResult && (
          <div className="style-result">
            <div className="dna-grid">
              <div className="dna-item">
                <label>Caption Style</label>
                <span>{learnResult.animation?.type ?? "unknown"}</span>
              </div>
              <div className="dna-item">
                <label>Font</label>
                <span>{learnResult.fontFamily ?? "system"}</span>
              </div>
              <div className="dna-item">
                <label>Position</label>
                <span>{learnResult.positioning?.vertical ?? "bottom"}/{learnResult.positioning?.horizontal ?? "center"}</span>
              </div>
              <div className="dna-item">
                <label>Confidence</label>
                <span>{((learnResult.confidence ?? 0) * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Style Comparison */}
      <div className="card">
        <h3>⚖️ Compare Styles</h3>
        <div className="style-compare-row">
          <div className="style-box">
            <h4>Style A</h4>
            {styleA ? (
              <div className="dna-preview">
                <p>Shot Length: {styleA.editing?.averageShotLength?.toFixed(1)}s</p>
                <p>Cut Frequency: {(styleA.editing?.cutFrequency * 100)?.toFixed(0)}%</p>
                <p>Contrast: {(styleA.color?.averageContrast * 100)?.toFixed(0)}%</p>
              </div>
            ) : (
              <button className="btn btn-secondary" onClick={handleGenerateStyleA}>Generate Fast Style</button>
            )}
          </div>

          <button className="btn btn-primary compare-btn" onClick={handleCompare} disabled={!styleA || !styleB}>
            Compare
          </button>

          <div className="style-box">
            <h4>Style B</h4>
            {styleB ? (
              <div className="dna-preview">
                <p>Shot Length: {styleB.editing?.averageShotLength?.toFixed(1)}s</p>
                <p>Cut Frequency: {(styleB.editing?.cutFrequency * 100)?.toFixed(0)}%</p>
                <p>Contrast: {(styleB.color?.averageContrast * 100)?.toFixed(0)}%</p>
              </div>
            ) : (
              <button className="btn btn-secondary" onClick={handleGenerateStyleB}>Generate Slow Style</button>
            )}
          </div>
        </div>

        {comparison && (
          <div className="comparison-result">
            <h4>Results</h4>
            <div className="score-bars">
              <ScoreBar label="Overall" score={comparison.overallScore} />
              <ScoreBar label="Pacing" score={comparison.pacingScore} />
              <ScoreBar label="Editing" score={comparison.editingScore} />
              <ScoreBar label="Color" score={comparison.colorScore} />
              <ScoreBar label="Motion" score={comparison.motionScore} />
              <ScoreBar label="Typography" score={comparison.typographyScore} />
              <ScoreBar label="Audio" score={comparison.audioScore} />
              <ScoreBar label="Narrative" score={comparison.narrativeScore} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="score-bar">
      <label>{label}</label>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${score}%` }} />
      </div>
      <span className="score-value">{score}/100</span>
    </div>
  );
}
