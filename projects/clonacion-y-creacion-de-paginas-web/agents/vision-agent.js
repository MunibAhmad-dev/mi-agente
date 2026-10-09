// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL WEB RECONSTRUCTION ENGINE — Vision Agent
// ═══════════════════════════════════════════════════════════════════════════════

import { AgentBase } from '../core/agent-base.js';
import { ensureDir, projectDir, writeJSON } from '../core/utils.js';

let sharp;
try { sharp = (await import('sharp')).default; } catch { sharp = null; }

export class VisionAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'vision',
      name: 'Vision Agent',
      capabilities: [
        'computer-vision', 'ocr', 'component-detection',
        'geometry-analysis', 'color-analysis', 'typography-analysis',
      ],
    });
  }

  async perform(task, context) {
    const { action } = task;
    this.log.info(`Vision action: ${action}`);

    switch (action) {
      case 'analyze-screenshot': return this.analyzeScreenshot(task, context);
      case 'detect-components': return this.detectComponents(task, context);
      case 'extract-colors': return this.extractColors(task, context);
      case 'analyze-layout': return this.analyzeLayout(task, context);
      default: throw new Error(`Unknown vision action: ${action}`);
    }
  }

  async analyzeScreenshot(task, context) {
    const { imagePath } = task;
    if (!sharp) {
      this.log.warn('Sharp not available, using basic analysis');
      return { evidence: [{ type: 'log', description: 'Sharp not available', data: { imagePath } }] };
    }

    this.log.info(`Analyzing screenshot: ${imagePath}`);
    const metadata = await sharp(imagePath).metadata();
    const stats = await sharp(imagePath).stats();

    const analysis = {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      channels: metadata.channels,
      density: metadata.density,
      hasAlpha: metadata.hasAlpha,
      dominantColor: stats.dominant,
      channelsStats: stats.channels.map(ch => ({
        mean: Math.round(ch.mean),
        stdev: Math.round(ch.stdev),
        min: ch.min,
        max: ch.max,
      })),
    };

    return {
      evidence: [{ type: 'log', description: 'Screenshot analyzed', data: analysis }],
    };
  }

  async detectComponents(task, context) {
    const { imagePath } = task;
    if (!sharp) return { evidence: [{ type: 'log', description: 'Sharp not available' }] };

    this.log.info('Detecting visual components via edge detection...');

    // Use Sharp to detect regions with contrast (potential components)
    const { info, data } = await sharp(imagePath)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;

    // Simple horizontal/vertical line detection for layout
    const horizontalEdges = new Float32Array(height);
    const verticalEdges = new Float32Array(width);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const diffX = Math.abs(data[idx] - data[idx - 1]);
        const diffY = Math.abs(data[idx] - data[idx - width]);
        if (diffX > 30) horizontalEdges[y]++;
        if (diffY > 30) verticalEdges[x]++;
      }
    }

    // Find potential component boundaries (high edge density rows/columns)
    const threshold = width * 0.3;
    const horizontalBreaks = [];
    const verticalBreaks = [];

    for (let y = 0; y < height; y++) {
      if (horizontalEdges[y] > threshold) horizontalBreaks.push(y);
    }
    for (let x = 0; x < width; x++) {
      if (verticalEdges[x] > threshold) verticalBreaks.push(x);
    }

    return {
      evidence: [{
        type: 'log',
        description: 'Component detection complete',
        data: { horizontalBreaks: horizontalBreaks.length, verticalBreaks: verticalBreaks.length, width, height },
      }],
    };
  }

  async extractColors(task, context) {
    const { imagePath } = task;
    if (!sharp) return { evidence: [{ type: 'log', description: 'Sharp not available' }] };

    this.log.info('Extracting color palette...');
    const { info, data } = await sharp(imagePath)
      .resize(200, 200, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Simple k-means-like color quantization
    const colorMap = new Map();
    for (let i = 0; i < data.length; i += info.channels) {
      const r = Math.round(data[i] / 32) * 32;
      const g = Math.round(data[i + 1] / 32) * 32;
      const b = Math.round(data[i + 2] / 32) * 32;
      const key = `${r},${g},${b}`;
      colorMap.set(key, (colorMap.get(key) || 0) + 1);
    }

    const totalPixels = (info.width * info.height);
    const palette = [...colorMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([color, count]) => {
        const [r, g, b] = color.split(',').map(Number);
        return {
          r, g, b,
          hex: `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`,
          percentage: Math.round((count / totalPixels) * 100 * 100) / 100,
        };
      });

    const projectId = context?.projectId;
    if (projectId) {
      writeJSON(projectDir(projectId) + '/analysis/color-palette.json', palette);
    }

    return {
      evidence: [{ type: 'log', description: 'Color palette extracted', data: palette }],
    };
  }

  async analyzeLayout(task, context) {
    const { imagePath } = task;
    if (!sharp) return { evidence: [{ type: 'log', description: 'Sharp not available' }] };

    this.log.info('Analyzing layout regions...');

    // Divide screenshot into a grid and analyze each cell
    const metadata = await sharp(imagePath).metadata();
    const cellWidth = Math.floor(metadata.width / 12);
    const cellHeight = Math.floor(metadata.height / 8);
    const regions = [];

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 12; col++) {
        const cell = await sharp(imagePath)
          .extract({ left: col * cellWidth, top: row * cellHeight, width: cellWidth, height: cellHeight })
          .greyscale()
          .stats();

        const isLight = cell.mean > 200;
        const isDark = cell.mean < 50;
        const hasHighContrast = cell.stdev > 40;

        regions.push({
          row, col,
          x: col * cellWidth, y: row * cellHeight,
          width: cellWidth, height: cellHeight,
          brightness: Math.round(cell.mean),
          contrast: Math.round(cell.stdev),
          type: isDark ? 'dark-bg' : isLight ? 'light-bg' : hasHighContrast ? 'content' : 'empty',
        });
      }
    }

    return {
      evidence: [{ type: 'log', description: 'Layout analysis complete', data: { regions: regions.length, grid: '12x8' } }],
    };
  }
}
