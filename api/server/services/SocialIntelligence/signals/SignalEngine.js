/**
 * SignalEngine — Detects intent and behavioral signals from content
 * =================================================================
 * Analyzes normalized content to extract purchase intent, questions,
 * complaints, recommendations, trends, and engagement patterns.
 */

const { SignalType } = require('../types');
const { createLogger } = require('../logger');

const logger = createLogger('SignalEngine');

// ─── SIGNAL DETECTION RULES (Deterministic first, LLM last) ───

const INTENT_PATTERNS = {
  [SignalType.PURCHASE_INTENT]: {
    keywords: ['buy', 'purchase', 'order', 'get', 'acquire', 'invest in', 'pricing', 'cost', 'how much', 'quote', 'discount', 'deal', 'offer', 'subscribe', 'plan', 'comprar', 'adquirir', 'inversión', 'presupuesto', 'cotización', 'descuento', 'oferta'],
    patterns: [/want to (buy|get|purchase)/i, /looking for (a|an|the)? ?(best|top|good|cheap)/i, /where can i (buy|get|find)/i, /best (deal|price|offer)/i, /planning to (buy|get|start)/i],
    weight: 1.0,
  },
  [SignalType.QUESTION]: {
    keywords: ['how to', 'how do', 'what is', 'what are', 'why', 'where', 'when', 'which', 'can someone', 'anyone know', 'help', 'advice', 'suggestion', 'recommend', 'cómo', 'qué', 'por qué', 'dónde', 'cuándo', 'cuál', 'ayuda', 'consejo'],
    patterns: [/\?/g, /how (do|can|to)/i, /what('s| is| are)/i, /any (suggestions|advice|tips)/i, /looking for (advice|help|suggestions)/i],
    weight: 0.8,
  },
  [SignalType.COMPARISON]: {
    keywords: ['vs', 'versus', 'compared to', 'better than', 'alternative', 'instead of', 'replace', 'upgrade', 'switch', 'comparar', 'mejor que', 'alternativa', 'reemplazar'],
    patterns: [/(\w+)\s+vs\s+(\w+)/i, /(\w+)\s+or\s+(\w+)/i, /which is (better|best|faster|cheaper)/i, /pros and cons/i],
    weight: 0.9,
  },
  [SignalType.COMPLAINT]: {
    keywords: ['problem', 'issue', 'bug', 'error', 'broken', 'doesn\'t work', 'frustrated', 'terrible', 'awful', 'worst', 'hate', 'scam', 'waste', 'disappointed', 'broken', 'defecto', 'error', 'no funciona', 'frustrante', 'terrible', 'estafa'],
    patterns: [/doesn'?t work/i, /waste of/i, /total(ly)? (scam|broken|useless)/i, /regret (buying|using|getting)/i, /stay away/i, /avoid/i],
    weight: 1.0,
  },
  [SignalType.RECOMMENDATION_REQUEST]: {
    keywords: ['recommend', 'suggestion', 'best', 'top', 'favorite', 'preferred', 'which one', 'what do you use', 'what works', 'recomendar', 'mejor', 'favorito', 'cuál usas'],
    patterns: [/what (do you|does everyone) use/i, /best (way|tool|method|approach)/i, /anyone (using|tried)/i, /what would you (recommend|suggest)/i],
    weight: 0.9,
  },
  [SignalType.PAIN_POINT]: {
    keywords: ['difficult', 'hard', 'complicated', 'struggle', 'challenge', 'pain', 'annoying', 'slow', 'expensive', 'overpriced', 'complicado', 'difícil', 'lento', 'caro', 'difícil', 'molesto'],
    patterns: [/struggling with/i, /having (a|trouble|issues) (with|using)/i, /too (slow|expensive|complicated)/i, /wish (there|it|i) (was|were|could)/i],
    weight: 0.85,
  },
  [SignalType.ALTERNATIVE_SEEKING]: {
    keywords: ['alternative', 'replacement', 'similar to', 'like but', 'other options', 'open source', 'free', 'cheaper', 'alternativa', 'reemplazo', 'similar', 'opciones', 'gratuito'],
    patterns: [/looking for (an? )?alternative/i, /something like .+ but/i, /open source (alternative|version|fork)/i, /free (alternative|option)/i],
    weight: 0.85,
  },
  [SignalType.BUDGET_SIGNAL]: {
    keywords: ['budget', 'afford', 'price', 'cost', 'cheap', 'expensive', 'free', 'trial', 'demo', 'presupuesto', 'costo', 'barato', 'caro', 'gratuito', 'prueba'],
    patterns: [/can'?t (afford|justify)/i, /too (expensive|pricey)/i, /is there (a|an) (cheaper|free|budget)/i, /under \$?\d+/i],
    weight: 0.7,
  },
  [SignalType.URGENCY]: {
    keywords: ['urgent', 'asap', 'deadline', 'need now', 'immediately', 'time sensitive', 'urgente', 'ahora', 'ya', 'inmediatamente'],
    patterns: [/need (this|it) (by|before|asap)/i, /deadline/i, /running out of time/i, /urgent/i],
    weight: 0.8,
  },
};

const SENTIMENT_WORDS = {
  positive: ['great', 'awesome', 'love', 'excellent', 'amazing', 'fantastic', 'perfect', 'best', 'brilliant', 'wonderful', 'good', 'nice', 'helpful', 'useful', 'awesome', 'excelente', 'genial', 'perfecto', 'mejor', 'útil'],
  negative: ['bad', 'terrible', 'hate', 'awful', 'worst', 'horrible', 'poor', 'broken', 'useless', 'disappointing', 'slow', 'buggy', 'frustrating', 'malo', 'terrible', 'peor', 'horrible', 'roto', 'lento', 'inútil'],
};

class SignalEngine {
  constructor(evidenceEngine) {
    this._evidenceEngine = evidenceEngine;
    this._signalCache = new Map(); // signalId → signal
  }

  /**
   * Analyze content and extract signals.
   * @param {object} content - Normalized content
   * @returns {object[]} Array of signals found
   */
  analyzeContent(content) {
    if (!content || !content.body) return [];

    const text = `${content.title || ''} ${content.body}`.toLowerCase();
    const signals = [];

    // Detect intent signals (deterministic rules)
    for (const [signalType, rules] of Object.entries(INTENT_PATTERNS)) {
      const result = this._detectPattern(text, rules);
      if (result.detected) {
        // Create evidence
        const evidence = this._evidenceEngine.createEvidenceFromContent(content);

        const signal = {
          id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: signalType,
          source: content.source,
          evidence: [evidence.id],
          confidence: result.confidence,
          strength: result.strength,
          content: {
            id: content.id,
            title: content.title,
            url: content.url,
            source: content.source,
          },
          account: content.author || null,
          topics: content.topics || [],
          keywords: result.matchedKeywords,
          sentiment: this._analyzeSentiment(text),
          detectedAt: Date.now(),
          metadata: {
            matchCount: result.matchCount,
            totalKeywords: rules.keywords.length,
          },
        };

        this._signalCache.set(signal.id, signal);
        signals.push(signal);
      }
    }

    // Limit signals per content
    const sorted = signals.sort((a, b) => b.confidence - a.confidence);
    return sorted.slice(0, 5);
  }

  /**
   * Analyze batch of content.
   * @param {object[]} contents
   * @returns {object[]} All signals found
   */
  analyzeBatch(contents) {
    const allSignals = [];
    for (const content of contents) {
      const signals = this.analyzeContent(content);
      allSignals.push(...signals);
    }
    return allSignals;
  }

  /**
   * Get signal by ID.
   */
  getSignal(id) {
    return this._signalCache.get(id) || null;
  }

  /**
   * Get all signals.
   */
  getAllSignals() {
    return Array.from(this._signalCache.values());
  }

  /**
   * Get signals filtered by type.
   */
  getSignalsByType(type) {
    return this.getAllSignals().filter((s) => s.type === type);
  }

  /**
   * Get signal summary statistics.
   */
  getSignalSummary() {
    const signals = this.getAllSignals();
    const byType = {};
    const bySource = {};
    let totalConfidence = 0;

    for (const signal of signals) {
      byType[signal.type] = (byType[signal.type] || 0) + 1;
      bySource[signal.source] = (bySource[signal.source] || 0) + 1;
      totalConfidence += signal.confidence;
    }

    return {
      totalSignals: signals.length,
      byType,
      bySource,
      avgConfidence: signals.length > 0 ? Math.round((totalConfidence / signals.length) * 100) / 100 : 0,
      topTypes: Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }

  // ─── PATTERN DETECTION ───────────────────────────────────────

  _detectPattern(text, rules) {
    let matchCount = 0;
    const matchedKeywords = [];

    // Keyword matching
    for (const keyword of rules.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        matchCount++;
        matchedKeywords.push(keyword);
      }
    }

    // Pattern matching
    let patternMatches = 0;
    for (const pattern of rules.patterns) {
      const matches = text.match(pattern);
      if (matches) {
        patternMatches += matches.length;
      }
    }

    const totalMatches = matchCount + patternMatches;
    if (totalMatches === 0) return { detected: false, confidence: 0, strength: 0, matchCount: 0, matchedKeywords: [] };

    // Calculate confidence
    const keywordScore = matchCount / rules.keywords.length;
    const patternScore = patternMatches / rules.patterns.length;
    const confidence = Math.min(
      keywordScore * 0.4 + patternScore * 0.4 + Math.min(totalMatches / 5, 1) * 0.2,
      1,
    );

    // Calculate strength (signal intensity)
    const strength = Math.min(totalMatches * rules.weight * 0.3, 1);

    return {
      detected: true,
      confidence: Math.round(confidence * 100) / 100,
      strength: Math.round(strength * 100) / 100,
      matchCount: totalMatches,
      matchedKeywords,
    };
  }

  _analyzeSentiment(text) {
    let positive = 0;
    let negative = 0;

    for (const word of SENTIMENT_WORDS.positive) {
      if (text.includes(word)) positive++;
    }
    for (const word of SENTIMENT_WORDS.negative) {
      if (text.includes(word)) negative++;
    }

    if (positive === 0 && negative === 0) return 0;
    return Math.round(((positive - negative) / (positive + negative)) * 100) / 100;
  }
}

module.exports = SignalEngine;
