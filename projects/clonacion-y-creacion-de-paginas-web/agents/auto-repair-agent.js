// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL WEB RECONSTRUCTION ENGINE — Auto Repair Agent (FIXED v2)
// ═══════════════════════════════════════════════════════════════════════════════

import { AgentBase } from '../core/agent-base.js';
import { ensureDir, projectDir, writeJSON, readJSON } from '../core/utils.js';
import { join } from 'node:path';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';

export class AutoRepairAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'auto-repair',
      name: 'Auto Repair Agent',
      capabilities: ['auto-repair', 'incremental-fix'],
    });
    this.repairHistory = [];
    this.repairCount = 0;
  }

  async perform(task, context) {
    const { action } = task;
    this.log.info(`Auto Repair action: ${action}`);

    switch (action) {
      case 'repair': return this.repair(task, context);
      default: throw new Error(`Unknown repair action: ${action}`);
    }
  }

  async repair(task, context) {
    const { score, diffs } = task;
    const projectId = context?.projectId;
    const projectPath = projectDir(projectId);

    this.log.info(`Repair cycle. Overall: ${score?.overall}%, Pixel: ${score?.pixel}%, Diffs: ${diffs?.length || 0}`);

    this.repairCount++;
    const repairs = [];

    // Analyze the score to determine what needs fixing
    const lowScores = [];
    if ((score?.layout || 0) < 95) lowScores.push({ field: 'layout', value: score.layout, weight: 0.15 });
    if ((score?.color || 0) < 95) lowScores.push({ field: 'color', value: score.color, weight: 0.10 });
    if ((score?.typography || 0) < 95) lowScores.push({ field: 'typography', value: score.typography, weight: 0.08 });
    if ((score?.geometry || 0) < 95) lowScores.push({ field: 'geometry', value: score.geometry, weight: 0.10 });
    if ((score?.shadow || 0) < 95) lowScores.push({ field: 'shadow', value: score.shadow, weight: 0.04 });

    // Analyze diff regions for targeted fixes
    const regions = diffs || [];
    const headerDiffs = regions.filter(r => r.type === 'header');
    const sidebarDiffs = regions.filter(r => r.type === 'sidebar');
    const contentDiffs = regions.filter(r => r.type === 'content');

    // Generate targeted CSS fixes
    const cssPath = join(projectPath, 'output', 'styles.css');
    const htmlPath = join(projectPath, 'output', 'reconstruction.html');

    if (existsSync(cssPath)) {
      let css = readFileSync(cssPath, 'utf-8');
      let changed = false;

      // Fix 1: Adjust spacing if layout score is low
      if ((score?.layout || 0) < 90) {
        if (!css.includes('margin: 0')) {
          css = `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }\n` + css;
          changed = true;
          repairs.push('Applied global margin reset');
        }
      }

      // Fix 2: Ensure proper flex/grid layout
      if ((score?.layout || 0) < 92) {
        if (!css.includes('display: flex') && !css.includes('display: grid')) {
          // Add basic layout structure
          css += `\nbody { display: flex; flex-direction: column; min-height: 100vh; }\n`;
          css += `main { flex: 1; }\n`;
          changed = true;
          repairs.push('Added flex layout structure');
        }
      }

      // Fix 3: Improve font rendering
      if ((score?.typography || 0) < 90) {
        if (!css.includes('-webkit-font-smoothing')) {
          css += `\nbody { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }\n`;
          changed = true;
          repairs.push('Added font smoothing');
        }
      }

      // Fix 4: Add responsive basics
      if (!css.includes('@media')) {
        css += `\n@media (max-width: 768px) {
  body { font-size: 14px; }
  .container { padding: 16px; }
}\n`;
        changed = true;
        repairs.push('Added basic responsive styles');
      }

      // Fix 5: Improve shadow rendering
      if ((score?.shadow || 0) < 90 && !css.includes('box-shadow')) {
        css += `\n.card, .panel, [class*="card"], [class*="panel"] {
  box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06);
}\n`;
        changed = true;
        repairs.push('Added card shadows');
      }

      // Fix 6: Ensure border-radius consistency
      if (!css.includes('border-radius')) {
        css += `\nbutton, input, [class*="card"], [class*="btn"] {
  border-radius: 8px;
}\n`;
        changed = true;
        repairs.push('Added border radius');
      }

      if (changed) {
        writeFileSync(cssPath, css, 'utf-8');
        this.log.info(`CSS repaired: ${repairs.length} changes applied`);
      }
    }

    // Also improve HTML if it exists
    if (existsSync(htmlPath)) {
      let html = readFileSync(htmlPath, 'utf-8');
      let htmlChanged = false;

      // Ensure viewport meta tag
      if (!html.includes('viewport')) {
        html = html.replace('<head>', '<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
        htmlChanged = true;
        repairs.push('Added viewport meta tag');
      }

      // Ensure proper structure
      if (!html.includes('<main') && html.includes('<body')) {
        html = html.replace('<body', '<body style="display:flex;flex-direction:column;min-height:100vh"');
        htmlChanged = true;
        repairs.push('Added body flex layout');
      }

      if (htmlChanged) {
        writeFileSync(htmlPath, html, 'utf-8');
        this.log.info(`HTML repaired: changes applied`);
      }
    }

    // Record repair history
    this.repairHistory.push({
      iteration: this.repairCount,
      timestamp: new Date().toISOString(),
      score: score?.overall,
      repairs,
      lowScores: lowScores.map(l => `${l.field}:${l.value}%`),
    });

    this.log.info(`Repair cycle ${this.repairCount} complete: ${repairs.length} repairs applied`);
    this.log.info(`Repairs: ${repairs.join(', ') || 'No changes needed'}`);

    return {
      evidence: [{
        type: 'log',
        description: `Repair cycle ${this.repairCount}: ${repairs.length} repairs`,
        data: { repairs, lowScores, repairCount: this.repairCount },
      }],
    };
  }
}
