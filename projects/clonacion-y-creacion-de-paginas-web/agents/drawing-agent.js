// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL WEB RECONSTRUCTION ENGINE — Drawing/Annotation Agent
// ═══════════════════════════════════════════════════════════════════════════════

import { AgentBase } from '../core/agent-base.js';
import { ensureDir, projectDir } from '../core/utils.js';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export class DrawingAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'drawing',
      name: 'Drawing/Annotation Agent',
      capabilities: ['visual-annotation', 'pencil-tool', 'region-selection', 'visual-editing'],
    });
  }

  async perform(task, context) {
    const { action } = task;
    this.log.info(`Drawing action: ${action}`);

    switch (action) {
      case 'annotate': return this.annotateScreenshot(task, context);
      case 'highlight-region': return this.highlightRegion(task, context);
      case 'add-pencil-overlay': return this.addPencilOverlay(task, context);
      case 'generate-annotation-ui': return this.generateAnnotationUI(task, context);
      case 'process-annotations': return this.processAnnotations(task, context);
      default: throw new Error(`Unknown action: ${action}`);
    }
  }

  // ─── Annotate Screenshot ─────────────────────────────────────────────────

  async annotateScreenshot(task, context) {
    const { screenshotPath, annotations = [] } = task;
    const projectId = context?.projectId;
    const outputDir = ensureDir(projectDir(projectId) + '/annotations');

    this.log.info(`Annotating screenshot with ${annotations.length} annotations`);

    // Generate annotation overlay HTML
    const overlayHTML = this.generateAnnotationOverlay(screenshotPath, annotations);
    const overlayPath = join(outputDir, 'annotated.html');
    writeFileSync(overlayPath, overlayHTML, 'utf-8');

    return { evidence: [{ type: 'file', description: 'Annotation overlay generated', path: overlayPath }] };
  }

  // ─── Highlight Region ────────────────────────────────────────────────────

  async highlightRegion(task, context) {
    const { x, y, width, height, color = '#ff4444', label = '' } = task;
    const projectId = context?.projectId;

    this.log.info(`Highlighting region: (${x},${y}) ${width}x${height}`);

    // Add highlight to the HTML output
    const htmlPath = join(projectDir(projectId) + '/output/reconstruction.html');
    if (!existsSync(htmlPath)) return { evidence: [{ type: 'log', description: 'No HTML to annotate' }] };

    let html = readFileSync(htmlPath, 'utf-8');

    const highlightCSS = `
.annotation-highlight {
  position: absolute;
  border: 3px solid ${color};
  background: ${color}22;
  border-radius: 4px;
  pointer-events: none;
  z-index: 9999;
}
.annotation-label {
  position: absolute;
  background: ${color};
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  z-index: 10000;
}
`;

    if (!html.includes('.annotation-highlight')) {
      html = html.replace('</style>', `\n${highlightCSS}\n</style>`);
    }

    // Add the highlight element
    const highlight = `<div class="annotation-highlight" style="left:${x}px;top:${y}px;width:${width}px;height:${height}px"></div>\n${label ? `<div class="annotation-label" style="left:${x}px;top:${y - 24}px">${label}</div>` : ''}`;

    html = html.replace('</body>', `${highlight}\n</body>`);
    writeFileSync(htmlPath, html, 'utf-8');

    return { evidence: [{ type: 'file', description: `Region highlighted: ${label || 'unnamed'}` }] };
  }

  // ─── Add Pencil Overlay ──────────────────────────────────────────────────

  async addPencilOverlay(task, context) {
    const projectId = context?.projectId;
    const outputDir = projectDir(projectId) + '/output';

    this.log.info('Adding pencil/annotation overlay to reconstruction...');

    const htmlPath = join(outputDir, 'reconstruction.html');
    if (!existsSync(htmlPath)) {
      return { evidence: [{ type: 'log', description: 'No HTML file for overlay' }] };
    }

    let html = readFileSync(htmlPath, 'utf-8');

    // Add the pencil overlay UI
    const pencilUI = this.generatePencilUI();

    // Add CSS
    html = html.replace('</style>', `\n${this.getPencilCSS()}\n</style>`);

    // Add HTML and JS before closing body
    html = html.replace('</body>', `\n${pencilUI}\n${this.getPencilJS()}\n</body>`);

    writeFileSync(htmlPath, html, 'utf-8');
    this.log.info('Pencil overlay added successfully');

    return { evidence: [{ type: 'file', description: 'Pencil annotation overlay added to reconstruction' }] };
  }

  // ─── Generate Annotation UI ──────────────────────────────────────────────

  async generateAnnotationUI(task, context) {
    const projectId = context?.projectId;
    const outputDir = ensureDir(projectDir(projectId) + '/output');

    const annotationHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Annotation Tool</title>
  <style>
${this.getPencilCSS()}
  </style>
</head>
<body style="margin:0;padding:0;background:#1a1a2e">
  <div id="annotation-container" style="position:relative;width:100vw;height:100vh;overflow:auto">
    <img id="target-image" src="screenshots/viewport.png" style="max-width:100%" crossorigin="anonymous" />
    <canvas id="drawing-canvas" style="position:absolute;top:0;left:0;cursor:crosshair"></canvas>
  </div>
  ${this.generatePencilUI()}
  <script>
${this.getPencilJS()}
// Initialize canvas
const canvas = document.getElementById('drawing-canvas');
const img = document.getElementById('target-image');
const container = document.getElementById('annotation-container');

img.onload = () => {
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.style.width = img.clientWidth + 'px';
  canvas.style.height = img.clientHeight + 'px';
};
  </script>
</body>
</html>`;

    const uiPath = join(outputDir, 'annotation-tool.html');
    writeFileSync(uiPath, annotationHTML, 'utf-8');

    return { evidence: [{ type: 'file', description: 'Annotation tool UI generated', path: uiPath }] };
  }

  // ─── Process Annotations ─────────────────────────────────────────────────

  async processAnnotations(task, context) {
    const { annotations = [] } = task;
    const projectId = context?.projectId;

    this.log.info(`Processing ${annotations.length} annotations...`);

    const repairs = [];
    for (const ann of annotations) {
      const { type, region, instruction } = ann;

      switch (type) {
        case 'modify-color':
          repairs.push({ action: 'css-property', selector: region.selector, property: 'color', value: instruction.newColor });
          break;
        case 'modify-size':
          repairs.push({ action: 'css-property', selector: region.selector, property: 'width', value: instruction.newSize });
          break;
        case 'modify-text':
          repairs.push({ action: 'text-replace', selector: region.selector, oldText: instruction.oldText, newText: instruction.newText });
          break;
        case 'hide':
          repairs.push({ action: 'css-property', selector: region.selector, property: 'display', value: 'none' });
          break;
        case 'move':
          repairs.push({ action: 'css-property', selector: region.selector, property: 'transform', value: `translate(${instruction.dx}px, ${instruction.dy}px)` });
          break;
      }
    }

    return { evidence: [{ type: 'log', description: `Processed ${repairs.length} annotation repairs`, data: repairs }] };
  }

  // ─── Pencil UI ───────────────────────────────────────────────────────────

  generatePencilUI() {
    return `
<!-- Pencil/Annotation Overlay -->
<div id="pencil-toolbar" class="pencil-toolbar">
  <div class="pencil-tools">
    <button class="pencil-btn active" data-tool="select" title="Select/Move">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
      </svg>
    </button>
    <button class="pencil-btn" data-tool="pencil" title="Draw/Pencil">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
      </svg>
    </button>
    <button class="pencil-btn" data-tool="highlight" title="Highlight Region">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke-dasharray="5 3"/>
      </svg>
    </button>
    <button class="pencil-btn" data-tool="arrow" title="Arrow/Point">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
      </svg>
    </button>
    <button class="pencil-btn" data-tool="text" title="Add Text Note">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>
      </svg>
    </button>
    <button class="pencil-btn" data-tool="eraser" title="Eraser">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L14.8 1.4c.8-.8 2-.8 2.8 0L21 4.8c.8.8.8 2 0 2.8L12 16"/>
      </svg>
    </button>
    <div class="pencil-divider"></div>
    <input type="color" id="pencil-color" value="#ff4444" class="pencil-color" title="Color">
    <input type="range" id="pencil-size" min="1" max="20" value="3" class="pencil-size" title="Brush size">
    <button class="pencil-btn" id="pencil-clear" title="Clear All">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
    </button>
    <button class="pencil-btn" id="pencil-save" title="Save Annotations" style="background:rgba(91,110,245,0.3)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
      </svg>
    </button>
  </div>
</div>
<div id="pencil-note-input" class="pencil-note-input" style="display:none">
  <input type="text" placeholder="Type your annotation note..." id="note-text" />
  <button onclick="addTextNote()">Add</button>
</div>
`;
  }

  getPencilCSS() {
    return `
/* Pencil/Annotation Tool CSS */
.pencil-toolbar {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10001;
  background: rgba(15, 20, 40, 0.95);
  border: 1px solid rgba(91, 110, 245, 0.3);
  border-radius: 12px;
  padding: 6px 10px;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
.pencil-tools {
  display: flex;
  align-items: center;
  gap: 4px;
}
.pencil-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: #8892a8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.pencil-btn:hover { background: rgba(91, 110, 245, 0.1); color: #e8eaf2; }
.pencil-btn.active { background: rgba(91, 110, 245, 0.2); color: #5b6ef5; border-color: rgba(91, 110, 245, 0.3); }
.pencil-divider { width: 1px; height: 24px; background: rgba(255,255,255,0.1); margin: 0 4px; }
.pencil-color { width: 28px; height: 28px; border: none; border-radius: 6px; cursor: pointer; padding: 0; }
.pencil-size { width: 60px; accent-color: #5b6ef5; }
.pencil-note-input {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10001;
  display: flex;
  gap: 8px;
  background: rgba(15, 20, 40, 0.95);
  border: 1px solid rgba(91, 110, 245, 0.3);
  border-radius: 8px;
  padding: 8px;
}
.pencil-note-input input {
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  padding: 6px 12px;
  color: #e8eaf2;
  font-size: 12px;
  width: 300px;
  outline: none;
}
.pencil-note-input button {
  background: #5b6ef5;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.annotation-note {
  position: absolute;
  background: rgba(255, 68, 68, 0.9);
  color: white;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  pointer-events: auto;
  cursor: move;
  z-index: 10002;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.annotation-region {
  position: absolute;
  border: 2px dashed #ff4444;
  background: rgba(255, 68, 68, 0.1);
  border-radius: 4px;
  z-index: 10001;
}
`;
  }

  getPencilJS() {
    return `
// Pencil/Annotation Tool JavaScript
(function() {
  const canvas = document.getElementById('drawing-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let currentTool = 'select';
  let isDrawing = false;
  let lastX, lastY;
  let annotations = [];

  // Tool selection
  document.querySelectorAll('.pencil-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pencil-btn[data-tool]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTool = btn.dataset.tool;
      canvas.style.cursor = currentTool === 'select' ? 'default' : 'crosshair';
    });
  });

  // Color & size
  const colorPicker = document.getElementById('pencil-color');
  const sizePicker = document.getElementById('pencil-size');

  // Drawing
  canvas.addEventListener('mousedown', (e) => {
    if (currentTool === 'select') return;
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    lastX = (e.clientX - rect.left) * scaleX;
    lastY = (e.clientY - rect.top) * scaleY;

    if (currentTool === 'text') {
      document.getElementById('pencil-note-input').style.display = 'flex';
      document.getElementById('note-text').focus();
      window._noteX = lastX;
      window._noteY = lastY;
      isDrawing = false;
      return;
    }

    if (currentTool === 'highlight') {
      window._highlightStart = { x: lastX, y: lastY };
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (currentTool === 'pencil') {
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = colorPicker.value;
      ctx.lineWidth = sizePicker.value;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      lastX = x;
      lastY = y;
    } else if (currentTool === 'highlight' && window._highlightStart) {
      // Preview highlight rectangle
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = colorPicker.value;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(
        window._highlightStart.x,
        window._highlightStart.y,
        x - window._highlightStart.x,
        y - window._highlightStart.y
      );
      ctx.setLineDash([]);
    } else if (currentTool === 'arrow' && window._highlightStart) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath();
      ctx.moveTo(window._highlightStart.x, window._highlightStart.y);
      ctx.lineTo(x, y);
      ctx.strokeStyle = colorPicker.value;
      ctx.lineWidth = sizePicker.value;
      ctx.stroke();
      // Arrowhead
      const angle = Math.atan2(y - window._highlightStart.y, x - window._highlightStart.x);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 10 * Math.cos(angle - 0.4), y - 10 * Math.sin(angle - 0.4));
      ctx.moveTo(x, y);
      ctx.lineTo(x - 10 * Math.cos(angle + 0.4), y - 10 * Math.sin(angle + 0.4));
      ctx.stroke();
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;

    if (currentTool === 'highlight' && window._highlightStart) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      annotations.push({
        type: 'highlight',
        x: window._highlightStart.x,
        y: window._highlightStart.y,
        width: x - window._highlightStart.x,
        height: y - window._highlightStart.y,
        color: colorPicker.value,
      });
      window._highlightStart = null;
    }
  });

  // Clear
  document.getElementById('pencil-clear')?.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    annotations = [];
    document.querySelectorAll('.annotation-note').forEach(n => n.remove());
    document.querySelectorAll('.annotation-region').forEach(n => n.remove());
  });

  // Save
  document.getElementById('pencil-save')?.addEventListener('click', () => {
    const data = { annotations, timestamp: Date.now() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'annotations.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Text notes
  window.addTextNote = function() {
    const text = document.getElementById('note-text').value;
    if (!text) return;
    const note = document.createElement('div');
    note.className = 'annotation-note';
    note.style.left = (window._noteX || 100) + 'px';
    note.style.top = (window._noteY || 100) + 'px';
    note.textContent = text;
    note.draggable = true;
    document.body.appendChild(note);
    annotations.push({ type: 'note', x: window._noteX, y: window._noteY, text });
    document.getElementById('note-text').value = '';
    document.getElementById('pencil-note-input').style.display = 'none';
  };
})();
`;
  }

  generateAnnotationOverlay(screenshotPath, annotations) {
    return `<!DOCTYPE html>
<html>
<head><title>Annotations</title>
<style>body{margin:0;background:#111;display:flex;justify-content:center;padding:20px}
img{max-width:100%;position:relative}</style>
</head>
<body>
<img src="${screenshotPath}" />
<div style="position:absolute;top:20px;right:20px;background:rgba(0,0,0,0.8);padding:16px;border-radius:8px;color:white;font-size:12px">
<h3>Annotations</h3>
${annotations.map((a, i) => `<div style="margin:8px 0;padding:8px;background:rgba(255,255,255,0.1);border-radius:4px">
<strong>#${i + 1}</strong> ${a.type}: ${a.instruction?.description || 'No description'}
<br><small style="color:#aaa">Region: (${a.region?.x || 0}, ${a.region?.y || 0})</small>
</div>`).join('')}
</div>
</body>
</html>`;
  }
}
