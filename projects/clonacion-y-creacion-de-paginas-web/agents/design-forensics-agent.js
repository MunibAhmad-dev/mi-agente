// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL WEB RECONSTRUCTION ENGINE — Design Forensics Agent
// ═══════════════════════════════════════════════════════════════════════════════

import { AgentBase } from '../core/agent-base.js';
import { ensureDir, projectDir, writeJSON } from '../core/utils.js';
import { existsSync, readFileSync } from 'node:fs';

export class DesignForensicsAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'design-forensics',
      name: 'Design Forensics Agent',
      capabilities: ['design-forensics', 'design-token-extraction'],
    });
  }

  async perform(task, context) {
    const { action } = task;
    this.log.info(`Design Forensics action: ${action}`);

    switch (action) {
      case 'generate-report': return this.generateReport(task, context);
      case 'extract-design-dna': return this.extractDesignDNA(task, context);
      default: throw new Error(`Unknown action: ${action}`);
    }
  }

  async generateReport(task, context) {
    this.log.info('Generating Design Forensics Report...');
    const projectId = context?.projectId || task.projectId;

    // Combine all analysis data
    const projectPath = projectDir(projectId);
    const dom = this.safeReadJSON(`${projectPath}/analysis/dom.json`);
    const styles = this.safeReadJSON(`${projectPath}/analysis/computed-styles.json`);
    const colors = this.safeReadJSON(`${projectPath}/analysis/color-palette.json`);

    const report = {
      generatedAt: new Date().toISOString(),
      viewport: this.extractViewport(dom),
      layout: this.analyzeLayout(dom, styles),
      grid: this.analyzeGrid(styles),
      spacing: this.analyzeSpacing(styles),
      colors: this.analyzeColors(colors, styles),
      typography: this.analyzeTypography(styles),
      components: this.analyzeComponents(dom),
      shadows: this.analyzeShadows(styles),
      borders: this.analyzeBorders(styles),
      radii: this.analyzeRadii(styles),
      assets: this.analyzeAssets(dom),
      responsive: this.analyzeResponsive(),
      interactions: this.analyzeInteractions(dom),
      animations: this.analyzeAnimations(styles),
    };

    if (projectId) {
      ensureDir(`${projectPath}/analysis`);
      writeJSON(`${projectPath}/analysis/design-forensics-report.json`, report);
    }

    // Generate Design DNA from report
    const designDNA = this.reportToDesignDNA(report);
    if (projectId) {
      writeJSON(`${projectPath}/design-dna/design-dna.json`, designDNA);
    }

    this.log.info('Design Forensics Report generated');
    return {
      evidence: [
        { type: 'file', description: 'Design Forensics Report', path: `${projectPath}/analysis/design-forensics-report.json` },
        { type: 'file', description: 'Design DNA', path: `${projectPath}/design-dna/design-dna.json` },
        { type: 'log', description: 'Report summary', data: this.summarizeReport(report) },
      ],
    };
  }

  extractViewport(dom) {
    if (!dom?.rect) return { width: 1440, height: 900 };
    return { width: dom.rect.width, height: dom.rect.height };
  }

  analyzeLayout(dom, styles) {
    if (!dom) return { type: 'unknown' };

    const children = dom.children || [];
    const positions = children.map(c => c.styles?.position).filter(Boolean);
    const displays = children.map(c => c.styles?.display).filter(Boolean);

    return {
      hasFlex: displays.includes('flex'),
      hasGrid: displays.includes('grid'),
      hasAbsolute: positions.includes('absolute') || positions.includes('fixed'),
      primaryDisplay: this.mode(displays) || 'block',
      childCount: children.length,
    };
  }

  analyzeGrid(styles) {
    if (!styles?.length) return [];
    return styles
      .filter(s => s.styles?.display === 'grid')
      .map(s => ({
        selector: s.selector,
        display: 'grid',
        gap: s.styles.gap,
      }));
  }

  analyzeSpacing(styles) {
    if (!styles?.length) return { paddings: [], margins: [], gaps: [] };
    const paddings = [];
    const margins = [];
    const gaps = [];

    for (const s of styles) {
      if (s.styles?.padding && s.styles.padding !== '0px') paddings.push(s.styles.padding);
      if (s.styles?.margin && s.styles.margin !== '0px') margins.push(s.styles.margin);
      if (s.styles?.gap && s.styles.gap !== '0px') gaps.push(s.styles.gap);
    }

    return { paddings, margins, gaps };
  }

  analyzeColors(colorPalette, styles) {
    const palette = {
      primary: [],
      secondary: [],
      accent: [],
      background: [],
      text: [],
      border: [],
      gradients: [],
    };

    if (colorPalette?.length) {
      // Categorize top colors
      const top = colorPalette.slice(0, 15);
      for (const c of top) {
        if (c.percentage > 30) palette.background.push(c.hex);
        else if (c.percentage > 10) palette.text.push(c.hex);
        else palette.accent.push(c.hex);
      }
    }

    return palette;
  }

  analyzeTypography(styles) {
    if (!styles?.length) return { fontFamilies: [], fontSizes: [], fontWeights: [] };

    const fontFamilies = new Set();
    const fontSizes = new Map();
    const fontWeights = new Map();

    for (const s of styles) {
      const ff = s.styles?.fontFamily;
      if (ff) fontFamilies.add(ff.split(',')[0].trim().replace(/"/g, ''));

      const fs = s.styles?.fontSize;
      if (fs) fontSizes.set(fs, (fontSizes.get(fs) || 0) + 1);

      const fw = s.styles?.fontWeight;
      if (fw && fw !== 'normal') fontWeights.set(fw, (fontWeights.get(fw) || 0) + 1);
    }

    return {
      fontFamilies: [...fontFamilies],
      fontSizes: [...fontSizes.entries()].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])).map(([v, c]) => ({ value: v, count: c })),
      fontWeights: [...fontWeights.entries()].map(([v, c]) => ({ value: v, count: c })),
    };
  }

  analyzeComponents(dom) {
    if (!dom) return [];
    const components = [];

    function walk(node, depth = 0) {
      if (!node || depth > 15) return;
      if (node.children?.length > 2) {
        components.push({
          tag: node.tag,
          id: node.id,
          classes: node.classes,
          childCount: node.children.length,
          rect: node.rect,
          role: node.role,
        });
      }
      for (const child of (node.children || [])) walk(child, depth + 1);
    }

    walk(dom);
    return components;
  }

  analyzeShadows(styles) {
    if (!styles?.length) return [];
    return styles
      .filter(s => s.styles?.boxShadow && s.styles.boxShadow !== 'none')
      .map(s => ({
        selector: s.selector,
        shadow: s.styles.boxShadow,
      }))
      .slice(0, 30);
  }

  analyzeBorders(styles) {
    if (!styles?.length) return [];
    return styles
      .filter(s => s.styles?.border && s.styles.border !== 'none' && s.styles.border !== '0px none rgb(0, 0, 0)')
      .map(s => ({
        selector: s.selector,
        border: s.styles.border,
      }))
      .slice(0, 30);
  }

  analyzeRadii(styles) {
    if (!styles?.length) return [];
    return styles
      .filter(s => s.styles?.borderRadius && s.styles.borderRadius !== '0px')
      .map(s => ({
        selector: s.selector,
        radius: s.styles.borderRadius,
      }))
      .slice(0, 30);
  }

  analyzeAssets(dom) {
    return { imageCount: 0, svgCount: 0, fontCount: 0 };
  }

  analyzeResponsive() {
    return { breakpoints: [], mediaQueries: [] };
  }

  analyzeInteractions(dom) {
    return { buttons: 0, links: 0, forms: 0, dropdowns: 0, modals: 0 };
  }

  analyzeAnimations(styles) {
    if (!styles?.length) return [];
    return styles
      .filter(s => s.styles?.animation && s.styles.animation !== 'none')
      .map(s => ({ selector: s.selector, animation: s.styles.animation }))
      .slice(0, 20);
  }

  reportToDesignDNA(report) {
    return {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      viewport: report.viewport,
      colors: report.colors,
      typography: report.typography,
      spacing: report.spacing,
      layout: report.layout,
      components: report.components.map(c => ({
        id: c.id || `comp-${c.tag}`,
        tag: c.tag,
        classes: c.classes,
        rect: c.rect,
      })),
      shadows: report.shadows,
      borders: report.borders,
      radii: report.radii,
      assets: report.assets,
      animations: report.animations,
      responsive: report.responsive,
    };
  }

  summarizeReport(report) {
    return {
      hasFlex: report.layout?.hasFlex,
      hasGrid: report.layout?.hasGrid,
      fontFamilyCount: report.typography?.fontFamilies?.length || 0,
      fontSizeCount: report.typography?.fontSizes?.length || 0,
      shadowCount: report.shadows?.length || 0,
      borderCount: report.borders?.length || 0,
      componentCount: report.components?.length || 0,
      gradientCount: report.colors?.gradients?.length || 0,
    };
  }

  safeReadJSON(path) {
    try {
      if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {}
    return null;
  }
}
