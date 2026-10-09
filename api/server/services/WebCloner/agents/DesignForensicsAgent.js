'use strict';

/**
 * DesignForensicsAgent — Face 18: extract design tokens and visual fingerprint from HTML/CSS.
 * Port of the ES-module DesignForensicsAgent from the clonacion-y-creacion-de-paginas-web branch.
 *
 * Capabilities: design-forensics, design-token-extraction
 *
 * Usage:
 *   const agent = new DesignForensicsAgent();
 *   const report = agent.analyze(html, css);
 *   // => { colors, typography, spacing, borders, shadows, designDNA }
 */

'use strict';

const HEX_RE = /#([0-9A-Fa-f]{3,8})\b/g;
const RGB_RE = /rgba?\(([^)]+)\)/gi;
const FONT_FAMILY_RE = /font-family\s*:\s*([^;}"]+)/gi;
const FONT_SIZE_RE = /font-size\s*:\s*([\d.]+(?:px|rem|em|vw|pt|%)[^;}"]*)/gi;
const FONT_WEIGHT_RE = /font-weight\s*:\s*([\w]+)/gi;
const PADDING_RE = /padding\s*:\s*([\d.]+(?:px|rem|em)[^;}"]*)/gi;
const MARGIN_RE = /margin\s*:\s*([\d.]+(?:px|rem|em)[^;}"]*)/gi;
const BORDER_RADIUS_RE = /border-radius\s*:\s*([\d.]+(?:px|rem|em|%)[^;}"]*)/gi;
const SHADOW_RE = /box-shadow\s*:\s*([^;}"]+)/gi;
const GRID_RE = /grid-template-columns\s*:\s*([^;}"]+)/gi;
const FLEX_RE = /display\s*:\s*flex/gi;

function unique(arr) {
  return [...new Set(arr.map((v) => v.trim()).filter(Boolean))];
}

function extractColors(css) {
  const colors = new Set();
  let m;
  HEX_RE.lastIndex = 0;
  while ((m = HEX_RE.exec(css)) !== null) colors.add(m[0].toLowerCase());
  RGB_RE.lastIndex = 0;
  while ((m = RGB_RE.exec(css)) !== null) colors.add(m[0].toLowerCase());
  return unique([...colors]);
}

function extractTypography(css) {
  const families = [];
  const sizes = [];
  const weights = [];
  let m;
  FONT_FAMILY_RE.lastIndex = 0;
  while ((m = FONT_FAMILY_RE.exec(css)) !== null) families.push(m[1]);
  FONT_SIZE_RE.lastIndex = 0;
  while ((m = FONT_SIZE_RE.exec(css)) !== null) sizes.push(m[1]);
  FONT_WEIGHT_RE.lastIndex = 0;
  while ((m = FONT_WEIGHT_RE.exec(css)) !== null) weights.push(m[1]);
  return {
    families: unique(families),
    sizes: unique(sizes).slice(0, 12),
    weights: unique(weights),
  };
}

function extractSpacing(css) {
  const paddings = [];
  const margins = [];
  let m;
  PADDING_RE.lastIndex = 0;
  while ((m = PADDING_RE.exec(css)) !== null) paddings.push(m[1]);
  MARGIN_RE.lastIndex = 0;
  while ((m = MARGIN_RE.exec(css)) !== null) margins.push(m[1]);
  return {
    paddings: unique(paddings).slice(0, 10),
    margins: unique(margins).slice(0, 10),
  };
}

function extractBorders(css) {
  const radii = [];
  let m;
  BORDER_RADIUS_RE.lastIndex = 0;
  while ((m = BORDER_RADIUS_RE.exec(css)) !== null) radii.push(m[1]);
  const hasRounded = radii.some((r) => parseFloat(r) > 0);
  return { radii: unique(radii).slice(0, 8), hasRounded };
}

function extractShadows(css) {
  const shadows = [];
  let m;
  SHADOW_RE.lastIndex = 0;
  while ((m = SHADOW_RE.exec(css)) !== null) shadows.push(m[1].trim());
  return unique(shadows).slice(0, 6);
}

function extractLayout(css) {
  const grids = [];
  let m;
  GRID_RE.lastIndex = 0;
  while ((m = GRID_RE.exec(css)) !== null) grids.push(m[1].trim());
  const flexCount = (css.match(FLEX_RE) || []).length;
  return {
    grids: unique(grids).slice(0, 5),
    flexCount,
    isFlexBased: flexCount > 0,
    isGridBased: grids.length > 0,
  };
}

function extractFromHTML(html) {
  if (!html) return { inlineStyles: [], headingLevels: [], hasViewport: false };
  const inlineStyles = (html.match(/style="([^"]+)"/gi) || []).length;
  const headingLevels = (html.match(/<h[1-6]/gi) || []).map((h) => h.slice(1).toUpperCase());
  const hasViewport = /<meta[^>]+viewport/i.test(html);
  return { inlineStyles, headingLevels: unique(headingLevels), hasViewport };
}

class DesignForensicsAgent {
  constructor(config = {}) {
    this.config = config;
    this.type = 'design-forensics';
    this.name = 'Design Forensics Agent';
    this.capabilities = ['design-forensics', 'design-token-extraction'];
    this.stats = { analyses: 0 };
  }

  /**
   * Analyze HTML + CSS and return design tokens + forensics report.
   * @param {string} html - full HTML source
   * @param {string} [css] - combined CSS (inline styles extracted if not provided)
   * @returns {{ colors, typography, spacing, borders, shadows, layout, htmlMeta, designDNA }}
   */
  analyze(html, css) {
    this.stats.analyses++;
    const cssSource = css || (html || '');

    const colors = extractColors(cssSource);
    const typography = extractTypography(cssSource);
    const spacing = extractSpacing(cssSource);
    const borders = extractBorders(cssSource);
    const shadows = extractShadows(cssSource);
    const layout = extractLayout(cssSource);
    const htmlMeta = extractFromHTML(html);

    const designDNA = {
      primaryColors: colors.slice(0, 5),
      fontStack: typography.families.slice(0, 3),
      spacingScale: spacing.paddings.slice(0, 5),
      cornerRadius: borders.radii[0] || '0px',
      layoutMode: layout.isGridBased ? 'grid' : layout.isFlexBased ? 'flex' : 'block',
      shadowDepth: shadows.length > 0 ? 'elevated' : 'flat',
      headings: htmlMeta.headingLevels,
    };

    return { colors, typography, spacing, borders, shadows, layout, htmlMeta, designDNA };
  }

  /**
   * Summarize the design report as a concise text fingerprint.
   * @param {{ colors, typography, layout, designDNA }} report
   * @returns {string}
   */
  summarize(report) {
    if (!report) return 'No design report';
    const { designDNA: dna } = report;
    if (!dna) return 'No design DNA extracted';
    return [
      `Layout: ${dna.layoutMode}`,
      `Colors: ${dna.primaryColors.slice(0, 3).join(', ') || 'none'}`,
      `Fonts: ${dna.fontStack.slice(0, 2).join(', ') || 'default'}`,
      `Corners: ${dna.cornerRadius}`,
      `Shadows: ${dna.shadowDepth}`,
    ].join(' | ');
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getDesignForensicsAgent(config) {
  if (!_instance || config) _instance = new DesignForensicsAgent(config || {});
  return _instance;
}

module.exports = { DesignForensicsAgent, getDesignForensicsAgent };
