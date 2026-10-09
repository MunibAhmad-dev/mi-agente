'use strict';

/**
 * AutoRepairAgent — Face 18: detect and fix common issues in cloned HTML pages.
 * Port of the ES-module AutoRepairAgent from the clonacion-y-creacion-de-paginas-web branch.
 *
 * Capabilities: auto-repair, html-repair, css-repair, asset-repair
 *
 * Usage:
 *   const agent = new AutoRepairAgent();
 *   const result = agent.repair(html, { baseUrl: 'https://original.com' });
 *   // => { repairedHtml, repairs, score }
 */

'use strict';

const REPAIR_RULES = [
  {
    id: 'viewport',
    detect: (html) => !/<meta[^>]+viewport/i.test(html),
    fix: (html) => html.replace(/<head([^>]*)>/i, '<head$1>\n  <meta name="viewport" content="width=device-width, initial-scale=1">'),
    description: 'Add missing viewport meta tag',
    impact: 'medium',
  },
  {
    id: 'charset',
    detect: (html) => !/<meta[^>]+charset/i.test(html),
    fix: (html) => html.replace(/<head([^>]*)>/i, '<head$1>\n  <meta charset="UTF-8">'),
    description: 'Add missing charset meta tag',
    impact: 'low',
  },
  {
    id: 'relative_links',
    detect: (html, opts) => opts?.baseUrl && /href=["']\/(?!\/)/i.test(html),
    fix: (html, opts) => {
      if (!opts?.baseUrl) return html;
      const base = opts.baseUrl.replace(/\/$/, '');
      return html.replace(/href=["'](\/(?!\/)[^"']*)/g, `href="${base}$1`);
    },
    description: 'Resolve relative href links to absolute URLs',
    impact: 'high',
  },
  {
    id: 'relative_src',
    detect: (html, opts) => opts?.baseUrl && /src=["']\/(?!\/)/i.test(html),
    fix: (html, opts) => {
      if (!opts?.baseUrl) return html;
      const base = opts.baseUrl.replace(/\/$/, '');
      return html.replace(/src=["'](\/(?!\/)[^"']*)/g, `src="${base}$1`);
    },
    description: 'Resolve relative src attributes to absolute URLs',
    impact: 'high',
  },
  {
    id: 'remove_scripts',
    detect: (html) => /<script[^>]*src=["'][^"']*analytics[^"']*["']/i.test(html),
    fix: (html) => html.replace(/<script[^>]*src=["'][^"']*analytics[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, ''),
    description: 'Remove third-party analytics scripts',
    impact: 'low',
  },
  {
    id: 'broken_images',
    detect: (html) => /<img[^>]*(?<!alt=)[^>]*>/i.test(html),
    fix: (html) => html.replace(/<img([^>]*)(?!\balt\b)([^>]*)>/gi, (_, pre, post) => {
      if (/alt=/i.test(pre + post)) return `<img${pre}${post}>`;
      return `<img${pre} alt=""${post}>`;
    }),
    description: 'Add missing alt attributes to images',
    impact: 'low',
  },
  {
    id: 'doctype',
    detect: (html) => !/^\s*<!DOCTYPE/i.test(html),
    fix: (html) => `<!DOCTYPE html>\n${html}`,
    description: 'Add missing DOCTYPE declaration',
    impact: 'low',
  },
];

const IMPACT_SCORE = { high: 20, medium: 10, low: 5 };

class AutoRepairAgent {
  constructor(config = {}) {
    this.config = config;
    this.type = 'auto-repair';
    this.name = 'Auto Repair Agent';
    this.capabilities = ['auto-repair', 'html-repair', 'css-repair', 'asset-repair'];
    this.stats = { repairs: 0, totalIssues: 0 };
  }

  /**
   * Detect issues in HTML without fixing them.
   * @param {string} html
   * @param {{ baseUrl?: string }} opts
   * @returns {{ issues: Array<{ id, description, impact }> }}
   */
  detect(html, opts = {}) {
    if (!html) return { issues: [] };
    const issues = REPAIR_RULES
      .filter((rule) => {
        try { return rule.detect(html, opts); } catch { return false; }
      })
      .map(({ id, description, impact }) => ({ id, description, impact }));
    return { issues };
  }

  /**
   * Apply all applicable repairs to HTML.
   * @param {string} html
   * @param {{ baseUrl?: string }} opts
   * @returns {{ repairedHtml: string, repairs: string[], score: number, issuesFixed: number }}
   */
  repair(html, opts = {}) {
    if (!html) return { repairedHtml: '', repairs: [], score: 100, issuesFixed: 0 };

    const { issues } = this.detect(html, opts);
    const repairs = [];
    let repairedHtml = html;
    let penaltyFixed = 0;

    for (const rule of REPAIR_RULES) {
      if (!issues.find((i) => i.id === rule.id)) continue;
      try {
        const fixed = rule.fix(repairedHtml, opts);
        if (fixed !== repairedHtml) {
          repairedHtml = fixed;
          repairs.push(rule.description);
          penaltyFixed += IMPACT_SCORE[rule.impact] || 5;
        }
      } catch { /* skip failing rules */ }
    }

    const totalPenalty = issues.reduce((s, i) => s + (IMPACT_SCORE[i.impact] || 5), 0);
    const score = Math.min(100, Math.max(0, 100 - totalPenalty + penaltyFixed));

    this.stats.repairs += repairs.length;
    this.stats.totalIssues += issues.length;

    return { repairedHtml, repairs, score, issuesFixed: repairs.length };
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getAutoRepairAgent(config) {
  if (!_instance || config) _instance = new AutoRepairAgent(config || {});
  return _instance;
}

module.exports = { AutoRepairAgent, getAutoRepairAgent };
