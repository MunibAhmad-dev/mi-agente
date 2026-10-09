'use strict';

/**
 * ToolSelectionEngine — Gen B runtime phase.
 * Intelligently selects the best tool for a given task using keyword matching
 * against tool capabilities and a scoring algorithm.
 *
 * Built-in tools:
 *   text_editor, web_search, code_executor, file_reader, calculator, image_analyzer
 */

const BUILTIN_TOOLS = [
  {
    name: 'text_editor',
    description: 'Read, write, and edit text files and documents',
    capabilities: ['edit', 'write', 'text', 'file', 'document', 'content', 'create', 'modify'],
    inputSchema: { type: 'object', properties: { action: { type: 'string' }, path: { type: 'string' }, content: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, content: { type: 'string' } } },
    score: 0.7,
  },
  {
    name: 'web_search',
    description: 'Search the internet for information, news, and data',
    capabilities: ['search', 'web', 'internet', 'find', 'lookup', 'query', 'news', 'information', 'data', 'research'],
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } } },
    outputSchema: { type: 'object', properties: { results: { type: 'array' } } },
    score: 0.8,
  },
  {
    name: 'code_executor',
    description: 'Execute code in various programming languages',
    capabilities: ['code', 'execute', 'run', 'script', 'program', 'python', 'javascript', 'node', 'compile', 'function'],
    inputSchema: { type: 'object', properties: { language: { type: 'string' }, code: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { stdout: { type: 'string' }, stderr: { type: 'string' }, exitCode: { type: 'number' } } },
    score: 0.9,
  },
  {
    name: 'file_reader',
    description: 'Read and parse files including PDFs, CSVs, and images',
    capabilities: ['read', 'file', 'pdf', 'csv', 'parse', 'extract', 'document', 'open', 'load'],
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, format: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { content: { type: 'string' }, metadata: { type: 'object' } } },
    score: 0.75,
  },
  {
    name: 'calculator',
    description: 'Perform mathematical calculations and formula evaluation',
    capabilities: ['calculate', 'math', 'compute', 'formula', 'equation', 'arithmetic', 'number', 'sum', 'average', 'statistics'],
    inputSchema: { type: 'object', properties: { expression: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { result: { type: 'number' } } },
    score: 0.95,
  },
  {
    name: 'image_analyzer',
    description: 'Analyze images for objects, text, faces, and visual content',
    capabilities: ['image', 'photo', 'picture', 'visual', 'analyze', 'detect', 'ocr', 'vision', 'recognize', 'describe'],
    inputSchema: { type: 'object', properties: { imageUrl: { type: 'string' }, task: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { description: { type: 'string' }, labels: { type: 'array' } } },
    score: 0.85,
  },
];

function normalizeText(text) {
  return (text || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(text) {
  return normalizeText(text).split(/\s+/).filter(Boolean);
}

function scoreTool(task, tool) {
  const taskTokens = new Set(tokenize(task));
  const capTokens = new Set(tool.capabilities.map((c) => c.toLowerCase()));
  const descTokens = tokenize(tool.description);

  let matches = 0;
  let total = taskTokens.size;

  for (const token of taskTokens) {
    if (capTokens.has(token)) {
      matches += 2; // capability match is stronger
    } else if (descTokens.includes(token)) {
      matches += 1;
    }
  }

  const baseScore = total > 0 ? matches / (total * 2) : 0;
  return Math.min(1, baseScore + (tool.score || 0) * 0.1);
}

class ToolSelectionEngine {
  constructor() {
    this.stats = { selections: 0, registrations: 0 };
    this._tools = new Map();
    // Pre-load built-in tools
    for (const tool of BUILTIN_TOOLS) {
      this._tools.set(tool.name, { ...tool });
    }
  }

  /**
   * Register a tool.
   * @param {{ name, description, capabilities, inputSchema?, outputSchema?, score? }} tool
   */
  registerTool(tool) {
    try {
      if (!tool || !tool.name) return;
      this._tools.set(tool.name, {
        name: tool.name,
        description: tool.description || '',
        capabilities: Array.isArray(tool.capabilities) ? tool.capabilities : [],
        inputSchema: tool.inputSchema || {},
        outputSchema: tool.outputSchema || {},
        score: typeof tool.score === 'number' ? tool.score : 0.5,
      });
      this.stats.registrations++;
    } catch (_) {
      // non-throwing
    }
  }

  /**
   * Select the best tool for a task.
   * @param {string} task
   * @param {string[]} [availableTools] - optional filter by tool names
   * @param {object} [context]
   * @returns {{ tool: object, confidence: number, reasoning: string, alternatives: object[] }}
   */
  select(task, availableTools, context = {}) {
    try {
      this.stats.selections++;
      let pool = [...this._tools.values()];
      if (Array.isArray(availableTools) && availableTools.length > 0) {
        const allowed = new Set(availableTools);
        pool = pool.filter((t) => allowed.has(t.name));
      }
      if (pool.length === 0) {
        return { tool: null, confidence: 0, reasoning: 'No tools available', alternatives: [] };
      }

      const ranked = this.rankTools(task, pool);
      const best = ranked[0];
      const bestScore = scoreTool(task, best);
      const alternatives = ranked.slice(1, 4);
      const confidence = Math.min(1, Math.max(0, bestScore));

      const topCaps = best.capabilities.filter((c) => tokenize(task).includes(c.toLowerCase())).slice(0, 3);
      const reasoning = `Selected '${best.name}' (score ${confidence.toFixed(2)}) because task keywords match capabilities: [${topCaps.join(', ') || best.capabilities.slice(0, 3).join(', ')}]`;

      return { tool: best, confidence: Math.round(confidence * 100) / 100, reasoning, alternatives };
    } catch (err) {
      return { tool: null, confidence: 0, reasoning: err.message, alternatives: [] };
    }
  }

  /**
   * Rank tools by relevance to the task.
   * @param {string} task
   * @param {object[]} [tools]
   * @returns {object[]}
   */
  rankTools(task, tools) {
    try {
      const pool = tools || [...this._tools.values()];
      return [...pool].sort((a, b) => scoreTool(task, b) - scoreTool(task, a));
    } catch (_) {
      return tools || [];
    }
  }

  /**
   * Return all registered tools.
   * @returns {object[]}
   */
  getRegistered() {
    try {
      return [...this._tools.values()];
    } catch (_) {
      return [];
    }
  }

  getStats() {
    return { ...this.stats, registeredTools: this._tools.size };
  }
}

let _instance = null;
function getToolSelectionEngine() {
  if (!_instance) _instance = new ToolSelectionEngine();
  return _instance;
}

module.exports = { ToolSelectionEngine, getToolSelectionEngine };
