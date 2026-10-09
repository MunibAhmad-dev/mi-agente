'use strict';

/**
 * QueryExpander - Expands search queries for better retrieval.
 *
 * Strategies:
 * - Synonym expansion
 * - Related term expansion
 * - Knowledge graph expansion
 * - Multi-query generation
 */
class QueryExpander {
  constructor(config = {}) {
    this.config = config;
    this.expansionCache = new Map();

    // Synonym maps (expandable)
    this.synonyms = {
      'gpu': ['tarjeta grafica', 'graphics card', 'video card'],
      'cpu': ['procesador', 'processor', 'chip'],
      'ram': ['memoria', 'memory'],
      'ai': ['inteligencia artificial', 'machine learning', 'ml', 'deep learning'],
      'precio': ['costo', 'cost', 'price', 'valor'],
      'comprar': ['adquirir', 'buy', 'purchase', 'obtener'],
      'buscar': ['encontrar', 'search', 'find', 'investigar'],
      'comparar': ['vs', 'compare', 'diferencia', 'difference'],
      'error': ['fallo', 'bug', 'issue', 'problema'],
      'solucionar': ['fix', 'resolver', 'arreglar', 'patch'],
    };
  }

  /**
   * Expand a query into multiple related queries.
   */
  expand(query, options = {}) {
    const expanded = [query]; // Original always first
    const q = (query || '').toLowerCase();

    // 1. Synonym expansion
    const withSynonyms = this._expandSynonyms(q);
    expanded.push(...withSynonyms);

    // 2. Related terms
    const related = this._expandRelated(q);
    expanded.push(...related);

    // 3. Multi-query generation
    const multiQuery = this._generateMultiQuery(q);
    expanded.push(...multiQuery);

    // Deduplicate and limit
    const unique = [...new Set(expanded)].slice(0, options.maxQueries || 5);
    return unique;
  }

  /**
   * Generate a more detailed query from a short one.
   */
  elaborate(query) {
    const q = (query || '').toLowerCase();
    const elaborations = [];

    if (q.split(/\s+/).length <= 3) {
      elaborations.push(`${query} información detallada`);
      elaborations.push(`${query} opciones y comparaciones`);
      elaborations.push(`${query} precio y disponibilidad`);
    }

    return elaborations.length > 0 ? elaborations : [query];
  }

  getStats() {
    return { synonyms: Object.keys(this.synonyms).length };
  }

  _expandSynonyms(query) {
    const words = query.split(/\s+/);
    const expanded = [];

    for (const word of words) {
      const syns = this.synonyms[word];
      if (syns) {
        for (const syn of syns.slice(0, 2)) {
          expanded.push(query.replace(word, syn));
        }
      }
    }
    return expanded;
  }

  _expandRelated(query) {
    const related = [];
    if (query.includes('gpu') || query.includes('tarjeta')) {
      related.push(query + ' benchmark rendimiento');
    }
    if (query.includes('precio') || query.includes('costo')) {
      related.push(query + ' comparar opciones');
    }
    if (query.includes('error') || query.includes('bug')) {
      related.push(query + ' solución fix');
    }
    return related;
  }

  _generateMultiQuery(query) {
    const templates = [
      `¿Qué es ${query}?`,
      `¿Cómo funciona ${query}?`,
      `${query} ejemplos prácticos`,
    ];
    return templates.filter(t => !t.includes('  ')).slice(0, 2);
  }
}

module.exports = { QueryExpander };
