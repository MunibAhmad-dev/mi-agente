'use strict';

/**
 * SuggestedRepliesEngine - Generates 2-4 follow-up suggestions after each response.
 *
 * These are NOT actions (they don't execute anything).
 * They are conversational prompts that become the next user message when clicked.
 *
 * Example flow:
 *   User: "¿Cuánto cuesta una RTX 3090?"
 *   LLM:  "Una RTX 3090 cuesta aproximadamente $1500..."
 *   Suggestions:
 *     🔍 Investigar precios reales en Huaqiangbei
 *     💰 Comparar RTX 3090 vs A6000 vs MI210
 *     🧩 Buscar talleres BGA en Shenzhen
 *     📋 Crear BOM completo de la GPU
 *
 *   User clicks "💰 Comparar RTX 3090 vs A6000 vs MI210"
 *   → Automatically sends that as the next user message
 */
class SuggestedRepliesEngine {
  constructor(config = {}) {
    this.config = config;
    this.maxSuggestions = config.maxSuggestions || 4;
    this.history = [];

    // Template patterns for generating suggestions
    this.TEMPLATES = {
      search: {
        es: ['🔍 Investigar {topic} en la web', '🔍 Buscar más información sobre {topic}', '🔍 Hacer búsqueda profunda de {topic}'],
        en: ['🔍 Search for {topic} online', '🔍 Deep research on {topic}', '🔍 Find more about {topic}'],
      },
      compare: {
        es: ['⚖️ Comparar {topic} con alternativas', '⚖️ Ver diferencias entre opciones', '⚖️ Analizar pros y contras'],
        en: ['⚖️ Compare {topic} with alternatives', '⚖️ See differences between options', '⚖️ Analyze pros and cons'],
      },
      detail: {
        es: ['📋 Explicar en más detalle', '📋 Dar ejemplos concretos', '📋 Mostrar código de ejemplo'],
        en: ['📋 Explain in more detail', '📋 Give concrete examples', '📋 Show example code'],
      },
      social: {
        es: ['📱 Buscar en redes sociales', '📱 Ver opiniones en Reddit', '📱 Buscar reviews de usuarios'],
        en: ['📱 Search on social media', '📱 Check Reddit opinions', '📱 Find user reviews'],
      },
      price: {
        es: ['💰 Comparar precios', '💰 Buscar ofertas', '💰 Ver precio histórico'],
        en: ['💰 Compare prices', '💰 Find deals', '💰 Check price history'],
      },
      code: {
        es: ['💻 Ver código de ejemplo', '💻 Implementar esto', '💻 Crear script automatizado'],
        en: ['💻 See example code', '💻 Implement this', '💻 Create automated script'],
      },
      continue: {
        es: ['➡️ Continuar con esto', '➡️ Explorar más a fondo', '➡️ Siguiente paso'],
        en: ['➡️ Continue with this', '➡️ Explore deeper', '➡️ Next step'],
      },
    };
  }

  /**
   * Generate suggestions based on LLM response and context.
   * Returns an array of { id, text, prompt } objects.
   */
  generate(response, context = {}) {
    const text = (response.content || response.text || '').toLowerCase();
    const lang = context.language || 'es';
    const topic = context.topic || this._extractTopic(text);

    const suggestions = [];

    // Detect what kind of response this is
    const types = this._detectResponseTypes(text);

    // Generate suggestions based on detected types
    for (const type of types) {
      const templates = this.TEMPLATES[type]?.[lang] || this.TEMPLATES[type]?.['en'] || [];
      for (const template of templates.slice(0, 1)) {
        const suggestionText = template.replace('{topic}', topic);
        suggestions.push({
          id: `sug_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          text: suggestionText,
          prompt: this._generatePrompt(type, topic, text, context),
          type: 'conversational', // vs 'action' for SuggestedActions
          confidence: 0.8,
        });
      }
    }

    // Always add a generic follow-up if we have fewer than 2
    if (suggestions.length < 2) {
      const genericFollowUps = lang === 'es'
        ? ['➡️ ¿Hay algo más que quieras saber?', '💡 ¿Quieres que profundice en algún punto?']
        : ['➡️ Is there anything else you\'d like to know?', '💡 Want me to dive deeper on any point?'];

      for (const fu of genericFollowUps) {
        if (suggestions.length < this.maxSuggestions) {
          suggestions.push({
            id: `sug_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            text: fu,
            prompt: fu.replace(/^[➡️💡🔄🔍]\s*/, ''),
            type: 'conversational',
            confidence: 0.5,
          });
        }
      }
    }

    const final = suggestions.slice(0, this.maxSuggestions);

    // Record in history
    this.history.push({
      timestamp: Date.now(),
      responseLength: text.length,
      suggestionsCount: final.length,
      types,
    });

    return final;
  }

  /**
   * Format suggestions for API response.
   */
  formatForAPI(suggestions) {
    return {
      type: 'suggested_replies',
      suggestions: suggestions.map(s => ({
        id: s.id,
        text: s.text,
        prompt: s.prompt,
        type: s.type,
      })),
    };
  }

  /**
   * Format suggestions for SSE streaming.
   */
  formatForSSE(suggestions) {
    return JSON.stringify({
      type: 'suggestions',
      suggestions: suggestions.map(s => ({
        id: s.id,
        text: s.text,
        prompt: s.prompt,
      })),
    });
  }

  getStats() {
    return {
      totalGenerated: this.history.reduce((s, h) => s + h.suggestionsCount, 0),
      historySize: this.history.length,
    };
  }

  // ===================== INTERNAL =====================

  _detectResponseTypes(text) {
    const types = [];

    if (/\b(buscar|search|encontrar|find|investigar|research)\b/.test(text)) types.push('search');
    if (/\b(comparar|compare|vs|versus|diferencia|difference)\b/.test(text)) types.push('compare');
    if (/\b(precio|price|cost|cuánto|how much|costar)\b/.test(text)) types.push('price');
    if (/\b(código|code|implementar|implement|script|función|function)\b/.test(text)) types.push('code');
    if (/\b(redes|social|twitter|reddit|facebook|opiniones|reviews)\b/.test(text)) types.push('social');
    if (types.length === 0) types.push('continue', 'detail');

    return types;
  }

  _extractTopic(text) {
    // Extract the main topic from the response
    const words = text.split(/\s+/).filter(w => w.length > 4);
    const significant = words.filter(w => !/^(que|como|para|pero|este|esta|tiene|puede|desde|sobre|todo|otro|más|muy|por|una|uno|con|sin|son|fue|ser|está|hay|los|las|del|las)$/.test(w));
    return significant.slice(0, 3).join(' ') || 'esto';
  }

  _generatePrompt(type, topic, responseText, context) {
    const lang = context.language || 'es';
    const templates = {
      search: lang === 'es' ? `Investiga más sobre ${topic}` : `Research more about ${topic}`,
      compare: lang === 'es' ? `Compara ${topic} con alternativas` : `Compare ${topic} with alternatives`,
      price: lang === 'es' ? `Busca precios actuales de ${topic}` : `Find current prices for ${topic}`,
      code: lang === 'es' ? `Muéstrame código de ejemplo para esto` : `Show me example code for this`,
      social: lang === 'es' ? `Busca opiniones en redes sociales sobre ${topic}` : `Search social media opinions about ${topic}`,
      detail: lang === 'es' ? `Explica esto con más detalle` : `Explain this in more detail`,
      continue: lang === 'es' ? `Continúa con esto` : `Continue with this`,
    };
    return templates[type] || templates.continue;
  }
}

module.exports = { SuggestedRepliesEngine };
