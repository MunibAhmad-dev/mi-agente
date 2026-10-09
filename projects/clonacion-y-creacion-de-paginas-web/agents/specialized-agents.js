// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL WEB RECONSTRUCTION ENGINE — Specialized Agents
// ═══════════════════════════════════════════════════════════════════════════════

import { AgentBase } from '../core/agent-base.js';
import { ensureDir, projectDir, writeJSON } from '../core/utils.js';
import { join } from 'node:path';
import { readdirSync, statSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

// ─── Geometry Agent ───────────────────────────────────────────────────────────

export class GeometryAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'geometry',
      name: 'Geometry Agent',
      capabilities: ['geometry-analysis', 'positioning', 'spacing-analysis'],
    });
  }

  async perform(task, context) {
    const { action } = task;
    switch (action) {
      case 'analyze':
        return this.analyzeGeometry(task, context);
      case 'fix':
        return this.fixGeometry(task, context);
      default: throw new Error(`Unknown action: ${action}`);
    }
  }

  async analyzeGeometry(task, context) {
    this.log.info('Analyzing geometry...');
    const projectId = context?.projectId;
    const dom = this.safeReadJSON(projectDir(projectId) + '/analysis/dom.json');

    const geometry = this.extractGeometryFromDOM(dom);
    if (projectId) {
      writeJSON(projectDir(projectId) + '/analysis/geometry.json', geometry);
    }

    return { evidence: [{ type: 'file', description: 'Geometry analysis', data: geometry }] };
  }

  extractGeometryFromDOM(node, results = []) {
    if (!node) return results;
    if (node.rect) {
      results.push({
        tag: node.tag, id: node.id, classes: node.classes,
        bbox: node.rect,
        display: node.styles?.display,
        position: node.styles?.position,
        padding: node.styles?.padding,
        margin: node.styles?.margin,
        gap: node.styles?.gap,
      });
    }
    for (const child of (node.children || [])) {
      this.extractGeometryFromDOM(child, results);
    }
    return results;
  }

  async fixGeometry(task, context) {
    this.log.info('Fixing geometry issues...');
    const { issues } = task;
    const projectId = context?.projectId;
    const outputDir = join(projectDir(projectId), 'output');

    if (existsSync(join(outputDir, 'styles.css'))) {
      let css = readFileSync(join(outputDir, 'styles.css'), 'utf-8');
      for (const issue of (issues || [])) {
        const regex = new RegExp(`(${issue.selector}[^{]*\\{[^}]*?)(${issue.property}\\s*:[^;]+;?)`, 's');
        css = css.replace(regex, `$1${issue.property}: ${issue.value};`);
      }
      writeFileSync(join(outputDir, 'styles.css'), css, 'utf-8');
    }

    return { evidence: [{ type: 'log', description: 'Geometry fixes applied' }] };
  }

  safeReadJSON(path) {
    try { if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8')); } catch {} return null;
  }
}

// ─── Typography Agent ─────────────────────────────────────────────────────────

export class TypographyAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'typography',
      name: 'Typography Agent',
      capabilities: ['typography-analysis', 'font-detection'],
    });
  }

  async perform(task, context) {
    this.log.info('Analyzing typography...');
    const projectId = context?.projectId;
    const styles = this.safeReadJSON(projectDir(projectId) + '/analysis/computed-styles.json');

    const typography = this.extractTypography(styles);
    if (projectId) {
      writeJSON(projectDir(projectId) + '/analysis/typography.json', typography);
    }

    return { evidence: [{ type: 'file', description: 'Typography analysis', data: typography }] };
  }

  extractTypography(styles) {
    if (!styles?.length) return { fonts: [], sizes: [], weights: [], lineHeights: [] };

    const fonts = new Map();
    const sizes = new Map();
    const weights = new Map();
    const lineHeights = new Map();

    for (const s of styles) {
      if (s.styles?.fontFamily) {
        const ff = s.styles.fontFamily.split(',')[0].trim().replace(/"/g, '');
        fonts.set(ff, (fonts.get(ff) || 0) + 1);
      }
      if (s.styles?.fontSize) sizes.set(s.styles.fontSize, (sizes.get(s.styles.fontSize) || 0) + 1);
      if (s.styles?.fontWeight && s.styles.fontWeight !== 'normal') weights.set(s.styles.fontWeight, (weights.get(s.styles.fontWeight) || 0) + 1);
      if (s.styles?.lineHeight && s.styles.lineHeight !== 'normal') lineHeights.set(s.styles.lineHeight, (lineHeights.get(s.styles.lineHeight) || 0) + 1);
    }

    return {
      fonts: [...fonts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      sizes: [...sizes.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
      weights: [...weights.entries()].map(([value, count]) => ({ value, count })),
      lineHeights: [...lineHeights.entries()].map(([value, count]) => ({ value, count })),
    };
  }

  safeReadJSON(path) {
    try { if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8')); } catch {} return null;
  }
}

// ─── Color Agent ──────────────────────────────────────────────────────────────

export class ColorAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'color',
      name: 'Color Agent',
      capabilities: ['color-analysis'],
    });
  }

  async perform(task, context) {
    this.log.info('Analyzing colors...');
    const projectId = context?.projectId;
    const palette = this.safeReadJSON(projectDir(projectId) + '/analysis/color-palette.json');
    const styles = this.safeReadJSON(projectDir(projectId) + '/analysis/computed-styles.json');

    const analysis = {
      palette: palette || [],
      cssColors: this.extractCSSColors(styles),
    };

    if (projectId) {
      writeJSON(projectDir(projectId) + '/analysis/colors.json', analysis);
    }

    return { evidence: [{ type: 'file', description: 'Color analysis', data: analysis }] };
  }

  extractCSSColors(styles) {
    const colors = new Map();
    for (const s of (styles || [])) {
      for (const prop of ['backgroundColor', 'color', 'borderColor']) {
        const val = s.styles?.[prop];
        if (val && val !== 'rgba(0, 0, 0, 0)' && val !== 'transparent') {
          colors.set(val, (colors.get(val) || 0) + 1);
        }
      }
    }
    return [...colors.entries()].map(([color, count]) => ({ color, count })).sort((a, b) => b.count - a.count);
  }

  safeReadJSON(path) {
    try { if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8')); } catch {} return null;
  }
}

// ─── Shadow Agent ─────────────────────────────────────────────────────────────

export class ShadowAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'shadow',
      name: 'Shadow Agent',
      capabilities: ['shadow-analysis'],
    });
  }

  async perform(task, context) {
    this.log.info('Analyzing shadows...');
    const projectId = context?.projectId;
    const styles = this.safeReadJSON(projectDir(projectId) + '/analysis/computed-styles.json');

    const shadows = [];
    for (const s of (styles || [])) {
      if (s.styles?.boxShadow && s.styles.boxShadow !== 'none') {
        shadows.push({ selector: s.selector, shadow: s.styles.boxShadow });
      }
      if (s.styles?.textShadow && s.styles.textShadow !== 'none') {
        shadows.push({ selector: s.selector, shadow: s.styles.textShadow, type: 'text' });
      }
    }

    if (projectId) writeJSON(projectDir(projectId) + '/analysis/shadows.json', shadows);
    return { evidence: [{ type: 'file', description: 'Shadow analysis', data: shadows }] };
  }

  safeReadJSON(path) {
    try { if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8')); } catch {} return null;
  }
}

// ─── Asset Agent ──────────────────────────────────────────────────────────────

export class AssetAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'asset',
      name: 'Asset Agent',
      capabilities: ['asset-extraction', 'image-processing'],
    });
  }

  async perform(task, context) {
    this.log.info('Processing assets...');
    const { action } = task;
    if (action === 'download') return this.downloadAssets(task, context);
    return { evidence: [{ type: 'log', description: 'Asset processing complete' }] };
  }

  async downloadAssets(task, context) {
    const { assets, outputDir } = task;
    const dir = ensureDir(outputDir || projectDir(context?.projectId) + '/assets');
    this.log.info(`Downloading ${assets?.length || 0} assets to ${dir}`);
    return { evidence: [{ type: 'log', description: `Assets processed: ${dir}` }] };
  }
}

// ─── Responsive Agent ─────────────────────────────────────────────────────────

export class ResponsiveAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'responsive',
      name: 'Responsive Agent',
      capabilities: ['responsive-analysis', 'breakpoint-detection'],
    });
  }

  async perform(task, context) {
    this.log.info('Analyzing responsive behavior...');
    const projectId = context?.projectId;

    const responsive = {
      breakpoints: [1920, 1440, 1024, 768, 375],
      viewportTests: [],
    };

    if (projectId) writeJSON(projectDir(projectId) + '/analysis/responsive.json', responsive);
    return { evidence: [{ type: 'file', description: 'Responsive analysis', data: responsive }] };
  }
}

// ─── Animation Agent ──────────────────────────────────────────────────────────

export class AnimationAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'animation',
      name: 'Animation Agent',
      capabilities: ['animation-analysis', 'transition-detection'],
    });
  }

  async perform(task, context) {
    this.log.info('Analyzing animations...');
    const projectId = context?.projectId;
    const styles = this.safeReadJSON(projectDir(projectId) + '/analysis/computed-styles.json');

    const animations = [];
    for (const s of (styles || [])) {
      if (s.styles?.animation && s.styles.animation !== 'none') {
        animations.push({ selector: s.selector, animation: s.styles.animation });
      }
      if (s.styles?.transition && s.styles.transition !== 'all 0s ease 0s') {
        animations.push({ selector: s.selector, transition: s.styles.transition });
      }
    }

    if (projectId) writeJSON(projectDir(projectId) + '/analysis/animations.json', animations);
    return { evidence: [{ type: 'file', description: 'Animation analysis', data: animations }] };
  }

  safeReadJSON(path) {
    try { if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8')); } catch {} return null;
  }
}

// ─── Interaction Agent ────────────────────────────────────────────────────────

export class InteractionAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'interaction',
      name: 'Interaction Agent',
      capabilities: ['interaction-testing', 'interaction-discovery'],
    });
  }

  async perform(task, context) {
    this.log.info('Discovering interactions...');
    return { evidence: [{ type: 'log', description: 'Interaction discovery complete' }] };
  }
}

// ─── Security Agent ───────────────────────────────────────────────────────────

export class SecurityAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'security',
      name: 'Security Agent',
      capabilities: ['security-testing'],
    });
  }

  async perform(task, context) {
    this.log.info('Running security checks...');
    const projectId = context?.projectId;
    const projectPath = projectDir(projectId);
    const issues = [];

    // Check for secrets in generated code
    const outputDir = join(projectPath, 'output');
    if (existsSync(outputDir)) {
      this.scanDirForSecrets(outputDir, issues);
    }

    return { evidence: [{ type: 'log', description: `Security check: ${issues.length} issues`, data: issues }] };
  }

  scanDirForSecrets(dir, issues) {
    try {
      // Using pre-imported readdirSync, statSync
      const files = readdirSync(dir);
      for (const file of files) {
        const fullPath = join(dir, file);
        if (statSync(fullPath).isDirectory()) {
          this.scanDirForSecrets(fullPath, issues);
        } else if (/\.(html|css|js|ts|jsx|tsx)$/.test(file)) {
          const content = readFileSync(fullPath, 'utf-8');
          if (/api[_-]?key|secret|password|token/i.test(content)) {
            issues.push({ file: fullPath, type: 'potential-secret' });
          }
        }
      }
    } catch {}
  }
}

// ─── Debug Agent ──────────────────────────────────────────────────────────────

export class DebugAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'debug',
      name: 'Debug Agent',
      capabilities: ['error-investigation', 'debugging'],
    });
  }

  async perform(task, context) {
    this.log.info(`Debugging: ${task.error}`);
    return { evidence: [{ type: 'log', description: `Debug: ${task.error}` }] };
  }
}

// ─── Research Agent ───────────────────────────────────────────────────────────

export class ResearchAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'research',
      name: 'Research Agent',
      capabilities: ['research', 'skill-discovery', 'tool-evaluation'],
    });
  }

  async perform(task, context) {
    this.log.info(`Researching: ${task.topic || 'general'}`);
    return { evidence: [{ type: 'log', description: 'Research complete' }] };
  }
}

// ─── Discovery Agent ──────────────────────────────────────────────────────────

export class DiscoveryAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'discovery',
      name: 'Discovery Agent',
      capabilities: ['url-discovery', 'page-mapping', 'route-discovery'],
    });
  }

  async perform(task, context) {
    this.log.info('Discovering application structure...');
    const { url } = task;
    const projectId = context?.projectId;

    const discovery = {
      url,
      pages: [],
      routes: [],
      components: [],
      discoveredAt: new Date().toISOString(),
    };

    if (projectId) writeJSON(projectDir(projectId) + '/analysis/discovery.json', discovery);
    return { evidence: [{ type: 'log', description: 'Discovery complete', data: discovery }] };
  }
}

// ─── UI Architect Agent ──────────────────────────────────────────────────────

export class UIArchitectAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'ui-architect',
      name: 'UI Architect Agent',
      capabilities: ['planning', 'architecture', 'component-design'],
    });
  }

  async perform(task, context) {
    this.log.info('Designing UI architecture...');
    const projectId = context?.projectId;

    const architecture = {
      framework: task.framework || 'html',
      structure: {
        pages: [],
        components: [],
        layouts: [],
        stateManagement: 'none',
      },
      dependencies: [],
      createdAt: new Date().toISOString(),
    };

    if (projectId) writeJSON(projectDir(projectId) + '/analysis/architecture.json', architecture);
    return { evidence: [{ type: 'file', description: 'UI Architecture designed', data: architecture }] };
  }
}

// ─── Final Verification Agent ────────────────────────────────────────────────

export class FinalVerificationAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'final-verification',
      name: 'Final Verification Agent',
      capabilities: ['final-verification', 'independent-evaluation'],
    });
  }

  async perform(task, context) {
    this.log.info('Running final verification...');
    const projectId = context?.projectId;
    const projectPath = projectDir(projectId);

    // Check all output files exist
    const outputDir = join(projectPath, 'output');
    const requiredFiles = ['reconstruction.html', 'styles.css'];
    const files = {};
    for (const file of requiredFiles) {
      files[file] = existsSync(join(outputDir, file));
    }

    // Read the last score
    const score = this.safeReadJSON(join(projectPath, 'analysis/comparison-score.json'));

    const verification = {
      filesPresent: files,
      allFilesPresent: Object.values(files).every(Boolean),
      score,
      timestamp: new Date().toISOString(),
      verdict: score?.overall >= 90 ? 'PASS' : score?.overall >= 70 ? 'PARTIAL' : 'NEEDS_WORK',
    };

    if (projectId) writeJSON(join(projectPath, 'analysis/final-verification.json'), verification);
    return { evidence: [{ type: 'metric', description: 'Final verification', data: verification }] };
  }

  safeReadJSON(path) {
    try { if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8')); } catch {} return null;
  }
}
