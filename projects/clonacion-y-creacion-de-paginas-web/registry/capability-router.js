// ═══════════════════════════════════════════════════════════════════════════════
// CAPABILITY ROUTER — Maps detected UI elements → best source → code template
// ═══════════════════════════════════════════════════════════════════════════════

import { UI_CAPABILITIES, CAPABILITY_MAP, searchCapabilities, getCapabilitiesForElement } from './ui-capabilities.js';
import { createLogger } from '../core/utils.js';

const log = createLogger('capability-router');

export class CapabilityRouter {

  constructor() {
    this.capabilities = UI_CAPABILITIES;
    this.capabilityMap = CAPABILITY_MAP;
    this.usageLog = [];
    this.stats = { routed: 0, found: 0, missing: 0, generated: 0 };
  }

  // ─── Route a detected visual element to the best capability ──────────────

  route(elementType, context = {}) {
    this.stats.routed++;

    // Direct lookup from CAPABILITY_MAP
    const capPaths = this.capabilityMap[elementType] || [];

    if (capPaths.length === 0) {
      // Fuzzy search
      const searchResults = searchCapabilities(elementType);
      if (searchResults.length > 0) {
        const best = searchResults[0];
        this.stats.found++;
        this.usageLog.push({ element: elementType, selected: best.name, score: 60, timestamp: Date.now() });
        return { found: true, element: elementType, capability: { ...best, score: 60, path: best.key }, alternatives: searchResults.slice(1, 3) };
      }
      this.stats.missing++;
      return { found: false, element: elementType, recommendations: this._suggestFallback(elementType) };
    }

    this.stats.found++;

    // Resolve each capability path into an object
    const resolved = capPaths.map(path => {
      const parts = path.split('.');
      let ref = this.capabilities;
      for (const p of parts) {
        // Check items sub-object first (category.items.name), then direct property
        if (ref && ref.items && ref.items[p]) ref = ref.items[p];
        else ref = ref?.[p];
        if (!ref && ref !== false) break;
      }
      return ref ? { ...ref, path, score: this._scoreCapability(ref, context) } : null;
    }).filter(Boolean);

    if (resolved.length === 0) {
      this.stats.missing++;
      return { found: false, element: elementType };
    }

    resolved.sort((a, b) => b.score - a.score);
    const best = resolved[0];

    this.usageLog.push({ element: elementType, selected: best.path || best.name, score: best.score, timestamp: Date.now() });
    log.info(`Routed ${elementType} → ${best.name || best.path} (score: ${best.score.toFixed(2)})`);
    return { found: true, element: elementType, capability: best, alternatives: resolved.slice(1, 4) };
  }

  // ─── Analyze a screenshot's detected elements and build a capability plan ─

  analyzeElements(detectedElements) {
    const plan = {
      elements: [],
      totalCapabilities: 0,
      coverage: 0,
      missing: [],
      recommendedLibraries: new Set(),
    };

    for (const elem of detectedElements) {
      const result = this.route(elem.type, elem.context || {});
      plan.elements.push({
        element: elem.type,
        ...result,
      });

      if (result.found) {
        plan.totalCapabilities++;
        if (result.capability?.sources) {
          result.capability.sources.forEach(s => plan.recommendedLibraries.add(s));
        }
      } else {
        plan.missing.push(elem.type);
      }
    }

    plan.coverage = detectedElements.length > 0
      ? Math.round(plan.totalCapabilities / detectedElements.length * 100)
      : 0;
    plan.recommendedLibraries = [...plan.recommendedLibraries];

    log.info(`Analysis: ${plan.coverage}% coverage, ${plan.missing.length} missing, ${plan.totalCapabilities} capabilities`);
    return plan;
  }

  // ─── Get code template for a capability ──────────────────────────────────

  getCodeTemplate(capabilityPath, framework = 'html') {
    const parts = capabilityPath.split('.');
    let cap = this.capabilities;
    for (const p of parts) {
      cap = cap?.[p];
    }

    if (!cap) return null;

    const templates = {
      html: this._htmlTemplate(cap, capabilityPath),
      react: this._reactTemplate(cap, capabilityPath),
      vue: this._vueTemplate(cap, capabilityPath),
    };

    this.stats.generated++;
    return templates[framework] || templates.html;
  }

  // ─── Get all dashboard templates for a given style ──────────────────────

  getDashboardTemplates(style = 'modern-dark') {
    const dashboards = this.capabilities.dashboard?.items || {};
    const templates = [];

    for (const [key, d] of Object.entries(dashboards)) {
      if (d.score >= 9.0) {
        templates.push({
          id: key,
          name: d.name,
          stack: d.stack,
          features: d.features,
          score: d.score,
          source: d.source,
        });
      }
    }

    return templates.sort((a, b) => b.score - a.score);
  }

  // ─── Get animation for a detected interaction ────────────────────────────

  getAnimationForInteraction(interactionType) {
    const anims = this.capabilities.animation;
    if (!anims) return null;

    const mapping = {
      'page-load': anims.entrance?.slice(0, 5) || [],
      'hover-button': anims.hover?.slice(0, 4) || [],
      'scroll-reveal': anims.scroll?.slice(0, 3) || [],
      'text-reveal': anims.text?.slice(0, 3) || [],
      'background-effect': anims.background?.slice(0, 3) || [],
      'modal-open': ['scale-in', 'fade-in', 'blur-in'],
      'page-transition': ['fade-up', 'slide-left', 'blur-in'],
    };

    return mapping[interactionType] || anims.entrance?.slice(0, 3) || [];
  }

  // ─── Stats ───────────────────────────────────────────────────────────────

  getStats() {
    const allCaps = [];
    for (const cat of Object.values(this.capabilities)) {
      if (cat.items) allCaps.push(...Object.keys(cat.items));
    }

    return {
      totalCapabilities: allCaps.length,
      categories: Object.keys(this.capabilities).length,
      ...this.stats,
      topUsed: this._topUsed(),
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  _scoreCapability(cap, context) {
    let score = 50; // base

    // License bonus (prefer MIT)
    if (cap.license === 'MIT') score += 15;
    else if (cap.license === 'ISC') score += 12;
    else if (cap.license === 'Apache-2.0') score += 10;

    // Usage priority
    if (cap.usage === 'primary') score += 10;
    else if (cap.usage === 'components') score += 8;
    else if (cap.usage === 'react-primary') score += 8;

    // Framework match
    if (context.framework === 'react' && cap.type === 'library') score += 5;
    if (context.framework === 'next' && cap.source?.includes('next')) score += 5;

    // Feature count bonus
    if (cap.features) score += Math.min(cap.features.length * 2, 10);

    // Stars/popularity bonus
    if (cap.stars && cap.stars > 10000) score += 5;
    if (cap.count && cap.count > 100) score += 3;

    return score;
  }

  _suggestFallback(elementType) {
    const suggestions = searchCapabilities(elementType.split('-')[0]);
    return suggestions.slice(0, 3).map(s => ({
      name: s.name,
      category: s.category,
      reason: `Partial match for "${elementType}"`,
    }));
  }

  _topUsed() {
    const counts = {};
    for (const entry of this.usageLog) {
      counts[entry.selected] = (counts[entry.selected] || 0) + 1;
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
  }

  _htmlTemplate(cap, path) {
    return `<!-- ${cap.name || path} - Generated by Capability Router -->
<!-- Variants: ${(cap.variants || []).join(', ')} -->
<!-- Features: ${(cap.features || []).join(', ')} -->
<div class="component-${path.replace(/\./g, '-')}" data-capability="${path}">
  <!-- Implementation placeholder -->
  <span>${cap.name || path}</span>
</div>`;
  }

  _reactTemplate(cap, path) {
    const name = (cap.name || path).replace(/[^a-zA-Z0-9]/g, '');
    return `// ${name} — Generated by Capability Router
// Variants: ${(cap.variants || []).join(', ')}
// Features: ${(cap.features || []).join(', ')}
import React from 'react';

export function ${name}({ variant = 'default', ...props }) {
  return (
    <div className="component-${path.replace(/\./g, '-')}" {...props}>
      {/* ${name} implementation */}
    </div>
  );
}`;
  }

  _vueTemplate(cap, path) {
    const name = (cap.name || path).replace(/[^a-zA-Z0-9]/g, '');
    return `<!-- ${name} — Generated by Capability Router -->
<template>
  <div class="component-${path.replace(/\./g, '-')}">
    <!-- ${name} implementation -->
  </div>
</template>

<script setup>
// ${name} — Variants: ${(cap.variants || []).join(', ')}
</script>`;
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance = null;
export function getCapabilityRouter() {
  if (!instance) instance = new CapabilityRouter();
  return instance;
}
