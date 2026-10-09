'use strict';

/**
 * SuggestedActionsEngine - Intelligent Suggested Actions / Action Chips
 *
 * Analyzes LLM responses and generates contextual suggestions:
 * - Suggested Prompts (generates user message on click)
 * - Suggested Actions (executes function on click)
 * - Follow-up Suggestions (continues conversation)
 *
 * Architecture:
 *   LLM Response → Intent Analyzer → Action Generator → Ranking → Output
 */
class SuggestedActionsEngine {
  constructor(config = {}) {
    this.maxSuggestions = config.maxSuggestions || 6;
    this.minConfidence = config.minConfidence || 0.3;
    this.customActions = new Map();
    this.history = [];

    // Action types
    this.ACTION_TYPES = {
      SEARCH_WEB: 'search_web',
      DEEP_RESEARCH: 'deep_research',
      SEARCH_SOCIAL: 'search_social',
      CONTINUE_CONVERSATION: 'continue_conversation',
      COMPARE: 'compare',
      PRODUCT_SEARCH: 'product_search',
      LOCAL_SEARCH: 'local_search',
      EXECUTE_TOOL: 'execute_tool',
      GENERATE_PROMPT: 'generate_prompt',
      CREATE_REPORT: 'create_report',
      FILE_PROCESS: 'file_process',
      CODE_EXECUTION: 'code_execution',
    };

    // Intent patterns
    this.INTENT_PATTERNS = {
      search: {
        keywords: ['search', 'find', 'look up', 'google', 'look for', 'buscar', 'encontrar', 'investigar'],
        actions: [this.ACTION_TYPES.SEARCH_WEB, this.ACTION_TYPES.DEEP_RESEARCH],
      },
      research: {
        keywords: ['research', 'analyze', 'study', 'investigate', 'deep dive', 'análisis', 'investigar a fondo'],
        actions: [this.ACTION_TYPES.DEEP_RESEARCH, this.ACTION_TYPES.CREATE_REPORT],
      },
      compare: {
        keywords: ['compare', 'vs', 'versus', 'difference', 'better', 'best', 'comparar', 'mejor'],
        actions: [this.ACTION_TYPES.COMPARE, this.ACTION_TYPES.SEARCH_WEB],
      },
      product: {
        keywords: ['buy', 'price', 'cost', 'shop', 'product', 'comprar', 'precio', 'producto'],
        actions: [this.ACTION_TYPES.PRODUCT_SEARCH, this.ACTION_TYPES.SEARCH_WEB],
      },
      location: {
        keywords: ['near me', 'in', 'location', 'address', 'where', 'cerca', 'dirección'],
        actions: [this.ACTION_TYPES.LOCAL_SEARCH, this.ACTION_TYPES.SEARCH_WEB],
      },
      code: {
        keywords: ['code', 'program', 'implement', 'function', 'script', 'código', 'programar'],
        actions: [this.ACTION_TYPES.CODE_EXECUTION, this.ACTION_TYPES.EXECUTE_TOOL],
      },
      social: {
        keywords: ['tweet', 'post', 'reddit', 'social', 'twitter', 'facebook', 'tiktok'],
        actions: [this.ACTION_TYPES.SEARCH_SOCIAL, this.ACTION_TYPES.SEARCH_WEB],
      },
      document: {
        keywords: ['document', 'file', 'pdf', 'report', 'documento', 'informe'],
        actions: [this.ACTION_TYPES.CREATE_REPORT, this.ACTION_TYPES.FILE_PROCESS],
      },
    };
  }

  /**
   * Analyze an LLM response and generate suggested actions.
   */
  generateSuggestions(response, context = {}) {
    const text = (response.content || response.text || '').toLowerCase();
    const intents = this._analyzeIntents(text);
    const entities = this._extractEntities(text);
    const suggestions = [];

    // Generate suggestions based on intents
    for (const intent of intents) {
      const actionDefs = this.INTENT_PATTERNS[intent.type];
      if (!actionDefs) continue;

      for (const actionType of actionDefs.actions) {
        const suggestion = this._createSuggestion(actionType, intent, entities, context);
        if (suggestion && suggestion.confidence >= this.minConfidence) {
          suggestions.push(suggestion);
        }
      }
    }

    // Add context-aware suggestions
    if (context.previousTopics && context.previousTopics.length > 0) {
      suggestions.push(this._createFollowUpSuggestion(context.previousTopics, entities));
    }

    // Add conversation continuations
    if (entities.topics.length > 0) {
      for (const topic of entities.topics.slice(0, 2)) {
        suggestions.push(this._createDeepDiveSuggestion(topic));
      }
    }

    // Deduplicate and rank
    const ranked = this._rankSuggestions(suggestions).slice(0, this.maxSuggestions);

    // Record in history
    this.history.push({
      timestamp: new Date().toISOString(),
      responseLength: text.length,
      intents: intents.map(i => i.type),
      suggestionsCount: ranked.length,
    });

    return ranked;
  }

  /**
   * Register a custom action.
   */
  registerAction(id, action) {
    this.customActions.set(id, {
      id,
      ...action,
      registeredAt: new Date().toISOString(),
    });
  }

  /**
   * Execute a suggested action.
   */
  async executeAction(suggestion) {
    const { action_type, params } = suggestion;

    // Check for custom actions first
    const custom = this.customActions.get(action_type);
    if (custom && custom.handler) {
      return await custom.handler(params);
    }

    // Built-in action handlers
    switch (action_type) {
      case this.ACTION_TYPES.SEARCH_WEB:
        return { type: 'web_search', query: params.query };
      case this.ACTION_TYPES.DEEP_RESEARCH:
        return { type: 'deep_research', query: params.query };
      case this.ACTION_TYPES.SEARCH_SOCIAL:
        return { type: 'social_search', query: params.query, platform: params.platform };
      case this.ACTION_TYPES.GENERATE_PROMPT:
        return { type: 'prompt', text: params.prompt };
      default:
        return { type: action_type, params };
    }
  }

  getStats() {
    return {
      totalGenerated: this.history.reduce((s, h) => s + h.suggestionsCount, 0),
      customActions: this.customActions.size,
      historySize: this.history.length,
      actionTypes: Object.values(this.ACTION_TYPES),
    };
  }

  // ===================== INTERNAL: Intent Analysis =====================

  _analyzeIntents(text) {
    const intents = [];
    for (const [type, pattern] of Object.entries(this.INTENT_PATTERNS)) {
      let score = 0;
      for (const keyword of pattern.keywords) {
        if (text.includes(keyword)) score++;
      }
      if (score > 0) {
        intents.push({ type, score, confidence: Math.min(score / 3, 1) });
      }
    }
    return intents.sort((a, b) => b.confidence - a.confidence);
  }

  _extractEntities(text) {
    const topics = [];
    const names = [];
    const numbers = [];
    const urls = [];

    // Extract potential topics (capitalized phrases, technical terms)
    const topicMatches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    const unique = [...new Set(topicMatches)].filter(t => t.length > 3);
    topics.push(...unique.slice(0, 5));

    // Extract URLs
    const urlMatches = text.match(/https?:\/\/[^\s]+/g) || [];
    urls.push(...urlMatches);

    // Extract numbers (prices, quantities)
    const numMatches = text.match(/\$[\d,]+\.?\d*|\d+(?:\.\d+)?(?:\s*(?:k|m|b|million|billion))/gi) || [];
    numbers.push(...numMatches);

    return { topics, names, numbers, urls };
  }

  _createSuggestion(actionType, intent, entities, context) {
    const query = entities.topics.length > 0
      ? entities.topics.join(' ')
      : context.originalQuery || '';

    const label = this._getActionLabel(actionType, entities);
    const icon = this._getActionIcon(actionType);

    return {
      id: `sug_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      action_type: actionType,
      label,
      icon,
      description: this._getActionDescription(actionType, entities),
      params: { query, platform: entities.topics[0] || '' },
      confidence: intent.confidence,
      type: actionType === this.ACTION_TYPES.GENERATE_PROMPT ? 'prompt' : 'action',
    };
  }

  _createFollowUpSuggestion(previousTopics, entities) {
    const lastTopic = previousTopics[previousTopics.length - 1] || '';
    return {
      id: `followup_${Date.now()}`,
      action_type: this.ACTION_TYPES.CONTINUE_CONVERSATION,
      label: `Profundizar en ${lastTopic}`,
      icon: '🧠',
      description: `Continuar investigando sobre ${lastTopic}`,
      params: { prompt: `Tell me more about ${lastTopic}` },
      confidence: 0.7,
      type: 'prompt',
    };
  }

  _createDeepDiveSuggestion(topic) {
    return {
      id: `deep_${Date.now()}_${topic.replace(/\s/g, '_')}`,
      action_type: this.ACTION_TYPES.DEEP_RESEARCH,
      label: `Investigar ${topic}`,
      icon: '🔬',
      description: `Búsqueda profunda sobre ${topic}`,
      params: { query: `Deep research on ${topic}` },
      confidence: 0.5,
      type: 'action',
    };
  }

  _getActionLabel(actionType, entities) {
    const topic = entities.topics[0] || '';
    const labels = {
      [this.ACTION_TYPES.SEARCH_WEB]: `🔍 Buscar ${topic} en la web`,
      [this.ACTION_TYPES.DEEP_RESEARCH]: `🔬 Investigar ${topic} a fondo`,
      [this.ACTION_TYPES.SEARCH_SOCIAL]: `📱 Buscar ${topic} en redes sociales`,
      [this.ACTION_TYPES.COMPARE]: `⚖️ Comparar ${topic}`,
      [this.ACTION_TYPES.PRODUCT_SEARCH]: `🛒 Buscar productos de ${topic}`,
      [this.ACTION_TYPES.LOCAL_SEARCH]: `📍 Buscar ${topic} cerca`,
      [this.ACTION_TYPES.CREATE_REPORT]: `📄 Generar reporte de ${topic}`,
      [this.ACTION_TYPES.CODE_EXECUTION]: `💻 Ejecutar código relacionado`,
      [this.ACTION_TYPES.GENERATE_PROMPT]: `💬 Continuar conversación`,
      [this.ACTION_TYPES.FILE_PROCESS]: `📁 Procesar archivos`,
      [this.ACTION_TYPES.EXECUTE_TOOL]: `⚡ Ejecutar herramienta`,
    };
    return labels[actionType] || `⚡ Acción: ${actionType}`;
  }

  _getActionIcon(actionType) {
    const icons = {
      [this.ACTION_TYPES.SEARCH_WEB]: '🔍',
      [this.ACTION_TYPES.DEEP_RESEARCH]: '🔬',
      [this.ACTION_TYPES.SEARCH_SOCIAL]: '📱',
      [this.ACTION_TYPES.COMPARE]: '⚖️',
      [this.ACTION_TYPES.PRODUCT_SEARCH]: '🛒',
      [this.ACTION_TYPES.LOCAL_SEARCH]: '📍',
      [this.ACTION_TYPES.CREATE_REPORT]: '📄',
      [this.ACTION_TYPES.CODE_EXECUTION]: '💻',
      [this.ACTION_TYPES.GENERATE_PROMPT]: '💬',
      [this.ACTION_TYPES.FILE_PROCESS]: '📁',
      [this.ACTION_TYPES.EXECUTE_TOOL]: '⚡',
    };
    return icons[actionType] || '⚡';
  }

  _getActionDescription(actionType, entities) {
    const topic = entities.topics[0] || '';
    const descriptions = {
      [this.ACTION_TYPES.SEARCH_WEB]: `Buscar información actualizada sobre ${topic}`,
      [this.ACTION_TYPES.DEEP_RESEARCH]: `Investigar ${topic} en profundidad con múltiples fuentes`,
      [this.ACTION_TYPES.SEARCH_SOCIAL]: `Buscar publicaciones sobre ${topic} en redes sociales`,
      [this.ACTION_TYPES.COMPARE]: `Comparar opciones de ${topic}`,
      [this.ACTION_TYPES.PRODUCT_SEARCH]: `Buscar productos y precios de ${topic}`,
      [this.ACTION_TYPES.LOCAL_SEARCH]: `Encontrar ${topic} en tu zona`,
      [this.ACTION_TYPES.CREATE_REPORT]: `Generar un reporte detallado sobre ${topic}`,
      [this.ACTION_TYPES.CODE_EXECUTION]: `Ejecutar código para analizar ${topic}`,
      [this.ACTION_TYPES.GENERATE_PROMPT]: `Continuar la conversación sobre ${topic}`,
      [this.ACTION_TYPES.FILE_PROCESS]: `Procesar archivos relacionados con ${topic}`,
      [this.ACTION_TYPES.EXECUTE_TOOL]: `Ejecutar una herramienta para ${topic}`,
    };
    return descriptions[actionType] || '';
  }

  _rankSuggestions(suggestions) {
    return suggestions
      .filter(s => s && s.confidence >= this.minConfidence)
      .sort((a, b) => b.confidence - a.confidence)
      .filter((s, i, arr) => arr.findIndex(x => x.action_type === s.action_type) === i);
  }
}

module.exports = SuggestedActionsEngine;
