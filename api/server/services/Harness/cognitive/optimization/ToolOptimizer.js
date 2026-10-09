'use strict';

/**
 * ToolOptimizer - Selects only relevant tools and compresses
 * tool schemas and outputs to minimize tokens.
 */
class ToolOptimizer {
  constructor(config = {}) {
    this.config = {
      maxTools: config.maxTools || 10,
      maxOutputTokens: config.maxOutputTokens || 500,
      relevanceThreshold: config.relevanceThreshold || 0.2,
      ...config,
    };
    this.stats = { toolsSelected: 0, toolsSkipped: 0, outputTokensSaved: 0 };
  }

  /**
   * Score tool relevance to the current task.
   */
  _scoreRelevance(tool, query) {
    const name = (tool.function?.name || tool.name || '').toLowerCase();
    const desc = (tool.function?.description || tool.description || '').toLowerCase();
    const combined = name + ' ' + desc;

    const queryTerms = String(query).toLowerCase().split(/\s+/).filter(w => w.length > 2);
    let score = 0;

    for (const term of queryTerms) {
      if (name.includes(term)) score += 0.5;
      if (desc.includes(term)) score += 0.3;
    }

    // Boost commonly used tools
    const alwaysInclude = ['search_web', 'read_file', 'write_file', 'terminal', 'social_search'];
    if (alwaysInclude.some(t => name.includes(t))) score += 0.5;

    return Math.min(1.0, score);
  }

  /**
   * Select only relevant tools for the current query.
   */
  selectTools(tools, query) {
    if (!tools || tools.length === 0) return [];
    if (tools.length <= this.config.maxTools) return tools;

    const scored = tools.map(tool => ({
      tool,
      score: this._scoreRelevance(tool, query),
    })).sort((a, b) => b.score - a.score);

    const selected = scored
      .filter(s => s.score >= this.config.relevanceThreshold || scored.indexOf(s) < 5)
      .slice(0, this.config.maxTools)
      .map(s => s.tool);

    this.stats.toolsSelected += selected.length;
    this.stats.toolsSkipped += (tools.length - selected.length);

    return selected;
  }

  /**
   * Compress tool schema (shorten descriptions, remove optional fields).
   */
  compressSchema(tool) {
    const compressed = JSON.parse(JSON.stringify(tool));

    if (compressed.function) {
      // Shorten description
      if (compressed.function.description) {
        compressed.function.description = compressed.function.description.slice(0, 200);
      }

      // Simplify parameters
      if (compressed.function.parameters?.properties) {
        const props = compressed.function.parameters.properties;
        for (const [key, prop] of Object.entries(props)) {
          if (prop.description) {
            prop.description = prop.description.slice(0, 100);
          }
          // Remove examples (saves tokens)
          delete prop.examples;
          delete prop.enum;
        }
      }
    }

    return compressed;
  }

  /**
   * Compress tool output/result.
   */
  compressOutput(output, maxTokens) {
    const maxChars = (maxTokens || this.config.maxOutputTokens) * 4; // ~4 chars per token
    const text = typeof output === 'string' ? output : JSON.stringify(output);

    if (text.length <= maxChars) return output;

    // Try to extract meaningful parts
    const lines = text.split('\n');
    const important = [];
    let totalLen = 0;

    for (const line of lines) {
      // Always keep error lines
      if (/error|Error|ERROR|failed|exception/i.test(line)) {
        important.push(line);
        totalLen += line.length;
        continue;
      }

      // Keep lines with numbers/data
      if (/\d+|true|false|null|undefined/i.test(line) && totalLen < maxChars * 0.6) {
        important.push(line);
        totalLen += line.length;
        continue;
      }

      // Keep short lines (likely key info)
      if (line.length < 100 && totalLen < maxChars * 0.8) {
        important.push(line);
        totalLen += line.length;
      }
    }

    if (important.length > 0) {
      this.stats.outputTokensSaved += Math.ceil((text.length - totalLen) / 4);
      return important.join('\n').slice(0, maxChars);
    }

    // Fallback: truncate
    this.stats.outputTokensSaved += Math.ceil((text.length - maxChars) / 4);
    return text.slice(0, maxChars) + '\n[truncated]';
  }

  getStats() {
    return { ...this.stats };
  }
}

module.exports = { ToolOptimizer };
