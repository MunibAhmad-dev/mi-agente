'use strict';

/**
 * UserProfileMemory - Learns and remembers everything about the user.
 *
 * Stores:
 * - Preferences (language, style, detail level)
 * - Communication patterns (how they ask, what they focus on)
 * - Expertise level (beginner/intermediate/advanced per topic)
 * - History of what they've asked about
 * - What they know vs don't know
 * - What they liked/disliked in responses
 * - Project context (what they're working on)
 */
class UserProfileMemory {
  constructor(config = {}) {
    this.userId = config.userId || 'default';
    this.profile = {
      userId: this.userId,
      preferences: {
        language: 'es', // detected language
        style: 'concise', // concise, detailed, technical
        detailLevel: 'medium', // low, medium, high
        codeStyle: null,
        timezone: null,
      },
      expertise: new Map(), // topic → level (beginner/intermediate/advanced)
      interests: [], // topics they frequently ask about
      knowledgeGaps: [], // what they DON'T know (they asked)
      knownTopics: [], // what they DO know (they didn't need explanation)
      communicationPatterns: {
        avgMessageLength: 0,
        usesEmoji: false,
        asksFollowUps: true,
        prefersVisuals: false,
      },
      projectContext: {
        currentProject: '',
        techStack: [],
        goals: [],
        recentTopics: [],
      },
      feedback: {
        positive: [],
        negative: [],
      },
      history: [],
    };

    this._messageCount = 0;
  }

  /**
   * Learn from a user message.
   */
  async learnFromMessage(message) {
    const text = (message || '').toLowerCase();
    this._messageCount++;

    // Detect language
    if (/[áéíóúñ]/.test(text)) this.profile.preferences.language = 'es';
    else if (/[àèìòù]/.test(text)) this.profile.preferences.language = 'fr';
    else this.profile.preferences.language = 'en';

    // Detect detail preference
    if (text.includes('resumen') || text.includes('corto') || text.includes('breve') || text.includes('quick')) {
      this.profile.preferences.detailLevel = 'low';
    } else if (text.includes('detallado') || text.includes('completo') || text.includes('extenso') || text.includes('in detail')) {
      this.profile.preferences.detailLevel = 'high';
    }

    // Detect expertise level per topic
    const technicalTerms = ['api', 'database', 'kubernetes', 'docker', 'microservices', 'compiler', 'kernel', 'algorithm', 'neural', 'transformer', 'embedding'];
    const beginnerTerms = ['qué es', 'cómo se hace', 'básico', 'simple', 'fácil', 'what is', 'how to', 'basic', 'simple'];
    const advancedTerms = ['optimizar', 'benchmark', 'escalabilidad', 'concurrency', 'race condition', 'optimize', 'scale', 'parallel'];

    for (const term of technicalTerms) {
      if (text.includes(term)) {
        const isBeginner = beginnerTerms.some(b => text.includes(b));
        const isAdvanced = advancedTerms.some(a => text.includes(a));
        this.profile.expertise.set(term, isBeginner ? 'beginner' : isAdvanced ? 'advanced' : 'intermediate');
      }
    }

    // Track interests
    const topics = this._extractTopics(text);
    for (const topic of topics) {
      if (!this.profile.interests.includes(topic)) {
        this.profile.interests.push(topic);
        if (this.profile.interests.length > 50) this.profile.interests.shift();
      }
    }

    // Track recent topics
    this.profile.projectContext.recentTopics.push(...topics);
    if (this.profile.projectContext.recentTopics.length > 20) {
      this.profile.projectContext.recentTopics = this.profile.projectContext.recentTopics.slice(-20);
    }

    // Communication patterns
    this.profile.communicationPatterns.avgMessageLength =
      (this.profile.communicationPatterns.avgMessageLength * (this._messageCount - 1) + message.length) / this._messageCount;

    if (/[😀😃😄😁😆]/.test(message)) this.profile.communicationPatterns.usesEmoji = true;

    this.profile.history.push({
      message: message.substring(0, 200),
      timestamp: Date.now(),
      topics,
    });

    if (this.profile.history.length > 100) {
      this.profile.history = this.profile.history.slice(-100);
    }
  }

  /**
   * Learn from a response (what the user liked/disliked).
   */
  async learnFromResponse(response, userFeedback) {
    if (userFeedback === 'positive' || userFeedback?.liked) {
      this.profile.feedback.positive.push({
        topic: response.topic,
        style: response.style,
        timestamp: Date.now(),
      });
    } else if (userFeedback === 'negative' || userFeedback?.disliked) {
      this.profile.feedback.negative.push({
        topic: response.topic,
        reason: userFeedback.reason || 'unknown',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Mark a topic as known (user didn't need explanation).
   */
  markAsKnown(topic) {
    if (!this.profile.knownTopics.includes(topic)) {
      this.profile.knownTopics.push(topic);
    }
  }

  /**
   * Mark a topic as unknown (user asked about it).
   */
  markAsUnknown(topic) {
    if (!this.profile.knowledgeGaps.includes(topic)) {
      this.profile.knowledgeGaps.push(topic);
    }
  }

  /**
   * Get user context for LLM system prompt.
   */
  getContextForLLM() {
    const ctx = [];
    ctx.push(`User language: ${this.profile.preferences.language}`);
    ctx.push(`Detail level: ${this.profile.preferences.detailLevel}`);

    if (this.profile.expertise.size > 0) {
      const exp = Array.from(this.profile.expertise.entries()).map(([k, v]) => `${k}(${v})`).join(', ');
      ctx.push(`Expertise: ${exp}`);
    }

    if (this.profile.knowledgeGaps.length > 0) {
      ctx.push(`Topics user is learning: ${this.profile.knowledgeGaps.slice(-5).join(', ')}`);
    }

    if (this.profile.projectContext.currentProject) {
      ctx.push(`Current project: ${this.profile.projectContext.currentProject}`);
    }

    return ctx.join('\n');
  }

  /**
   * Get the full profile.
   */
  getProfile() {
    return {
      ...this.profile,
      expertise: Object.fromEntries(this.profile.expertise),
    };
  }

  _extractTopics(text) {
    const words = (text || '').toLowerCase().split(/\s+/);
    const stopWords = new Set(['el','la','los','las','un','una','que','como','para','por','con','sin','sobre','entre','desde','hasta','este','esta','esto','ese','esa','eso','aquel','aquella','más','menos','muy','mucho','poco','todo','nada','algo','cada','otro','otra','mismo','misma','tiene','puede','hace','dice','sabe','va','viene','ser','estar','haber','tener','hacer','poder','decir','saber','ir','venir','dar','ver','querer','llegar','poner','creer','hablar','llevar','dejar','seguir','encontrar','llamar','volver','tomar','conocer','vivir','sentir','tratar','mirar','contar','empezar','esperar','salir','llegar','caer','crecer','abrir','cerrar','andar','necesitar','quedar','comenzar','existir','pensar','saludar','hola','adios','gracias','por favor','ok','bien','mal','si','no','pero','entonces','porque','aunque','como','cuando','donde','quien','cual','cuanto','que','cómo','cuándo','dónde','cuánto']);
    return words.filter(w => w.length > 3 && !stopWords.has(w)).slice(0, 5);
  }

  getStats() {
    return {
      messagesAnalyzed: this._messageCount,
      interests: this.profile.interests.length,
      knowledgeGaps: this.profile.knowledgeGaps.length,
      knownTopics: this.profile.knownTopics.length,
      expertiseTopics: this.profile.expertise.size,
      feedbackPositive: this.profile.feedback.positive.length,
      feedbackNegative: this.profile.feedback.negative.length,
    };
  }
}

module.exports = { UserProfileMemory };
