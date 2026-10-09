/**
 * SearchPlanEngine — Orchestrates multi-source search
 * ====================================================
 * Takes a search plan and executes it across connectors.
 */

const { getConnectorRegistry } = require('../connectors/base/ConnectorRegistry');
const { createLogger } = require('../logger');

const logger = createLogger('SearchPlanEngine');

class SearchPlanEngine {
  constructor(normalizationEngine, dedupEngine, signalEngine, evidenceEngine) {
    this._normalization = normalizationEngine;
    this._dedup = dedupEngine;
    this._signals = signalEngine;
    this._evidence = evidenceEngine;
  }

  /**
   * Execute a search plan.
   * @param {object} plan - Search plan from IntentParser
   * @returns {object} Search results with normalization, dedup, signals
   */
  async executeSearchPlan(plan) {
    const startTime = Date.now();
    const registry = getConnectorRegistry();
    const results = { contents: [], signals: [], evidence: [], sources: {}, errors: [] };

    logger.info('Executing search plan', {
      objective: plan.objective,
      queries: plan.queries.length,
      sources: plan.sources,
    });

    for (const sourceId of plan.sources) {
      const connector = registry.get(sourceId);
      if (!connector || connector.status !== 'healthy') {
        results.errors.push({ source: sourceId, error: 'connector_unavailable' });
        results.sources[sourceId] = { status: 'unavailable' };
        continue;
      }

      try {
        const queries = plan.queries || [plan.objective];
        const sourceContents = [];

        for (const query of queries.slice(0, 3)) {
          try {
            const raw = await connector.search(query, {
              maxResults: Math.floor((plan.maxResults || 50) / queries.length),
              timeRange: plan.timeRange,
            });
            sourceContents.push(...(Array.isArray(raw) ? raw : []));
          } catch (err) {
            logger.warn('Query failed', { source: sourceId, query, error: err.message });
          }
        }

        // Normalize
        const normalized = sourceContents
          .map((raw) => this._normalization.normalizeContent(raw, sourceId))
          .filter(Boolean);

        // Dedup
        const { unique, stats } = this._dedup.deduplicateBatch(normalized);

        // Create evidence
        const evidenceBatch = unique.map((c) => this._evidence.createEvidenceFromContent(c));

        // Extract signals
        const signals = this._signals.analyzeBatch(unique);

        results.contents.push(...unique);
        results.signals.push(...signals);
        results.evidence.push(...evidenceBatch);
        results.sources[sourceId] = {
          status: 'ok',
          fetched: sourceContents.length,
          normalized: normalized.length,
          unique: unique.length,
          signals: signals.length,
        };
      } catch (err) {
        results.errors.push({ source: sourceId, error: err.message });
        results.sources[sourceId] = { status: 'error', error: err.message };
      }
    }

    results.stats = {
      totalContents: results.contents.length,
      totalSignals: results.signals.length,
      totalEvidence: results.evidence.length,
      sourcesSearched: Object.keys(results.sources).length,
      sourcesAvailable: Object.values(results.sources).filter((s) => s.status === 'ok').length,
      duration: Date.now() - startTime,
    };

    return results;
  }

  /**
   * Simple search (without full plan).
   */
  async search(query, options = {}) {
    const plan = {
      objective: query,
      queries: [query],
      sources: options.sources || ['reddit', 'bluesky', 'hackernews'],
      timeRange: options.timeRange || '30d',
      maxResults: options.maxResults || 50,
    };
    return this.executeSearchPlan(plan);
  }
}

module.exports = SearchPlanEngine;
