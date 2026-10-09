'use strict';

/**
 * TaskClassifier - Identifies the type of task to optimize
 * compression strategy accordingly.
 */
class TaskClassifier {
  constructor(config = {}) {
    this.config = config;
    this.patterns = {
      coding: /\b(code|function|class|import|export|const|let|var|return|async|await|npm|install|debug|fix|bug|error|typescript|javascript|python|file|directory|refactor|implement|module|require)\b/i,
      debugging: /\b(error|bug|fallo|crash|stack|trace|exception|undefined|null|cannot|failed|broken|issue|problem|diagnose|fix|repair|fixing)\b/i,
      research: /\b(search|find|investigate|analyze|compare|research|review|evaluate|explore|discover|what is|how does|explain|tell me|informacion|información|buscar|investigar)\b/i,
      chat: /\b(hello|hola|hi|hey|thanks|gracias|please|por favor|how are you|que tal)\b/i,
      planning: /\b(plan|design|architect|strategy|roadmap|approach|method|steps|phase|fase|planificar|diseñar|arquitectura)\b/i,
      writing: /\b(write|draft|compose|document|report|summarize|summary|resumen|escribir|articulo|article|blog|post)\b/i,
      analysis: /\b(analyze|data|metrics|statistics|graph|chart|trend|pattern|correlate|analyze|analizar|datos|estadisticas)\b/i,
      creative: /\b(creative|idea|brainstorm|imagine|innovative|novel|unique|original|creative|creativo|idea|innovar)\b/i,
      tool: /\b(execute|run|command|script|terminal|shell|bash|tool|execute|ejecutar|comando|script)\b/i,
      document: /\b(pdf|doc|document|file|read|parse|extract|document|archivo|documento|leer|parsear)\b/i,
    };
  }

  /**
   * Classify a request into a task type.
   */
  classify(request) {
    const text = [
      request.system || '',
      (request.messages || []).map(m => m.content || '').join(' '),
    ].join(' ');

    const scores = {};
    for (const [type, pattern] of Object.entries(this.patterns)) {
      const matches = text.match(new RegExp(pattern, 'gi'));
      scores[type] = matches ? matches.length : 0;
    }

    // Get the top type
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const topType = sorted[0][1] > 0 ? sorted[0][0] : 'chat';

    return {
      type: topType,
      scores,
      all: sorted.map(([type, score]) => ({ type, score })),
    };
  }

  /**
   * Get compression policy for a task type.
   */
  getPolicy(taskType) {
    const policies = {
      coding: {
        mode: 'SAFE',
        preserveCode: true,
        preserveSymbols: true,
        preserveImports: true,
        preserveErrors: true,
        compressionRatio: 0.3,
        keepStructure: true,
      },
      debugging: {
        mode: 'SAFE',
        preserveErrors: true,
        preserveStackTraces: true,
        preserveContext: true,
        compressionRatio: 0.2,
        keepRecent: 8,
      },
      research: {
        mode: 'BALANCED',
        preserveEvidence: true,
        preserveSources: true,
        preserveFacts: true,
        compressionRatio: 0.5,
        maxDocs: 8,
      },
      chat: {
        mode: 'AGGRESSIVE',
        preserveRecent: true,
        compressOld: true,
        compressionRatio: 0.7,
        keepRecent: 4,
      },
      planning: {
        mode: 'SAFE',
        preserveGoals: true,
        preserveConstraints: true,
        preserveDecisions: true,
        compressionRatio: 0.3,
      },
      writing: {
        mode: 'BALANCED',
        preserveDrafts: false,
        preserveReferences: true,
        compressionRatio: 0.4,
      },
      analysis: {
        mode: 'SAFE',
        preserveData: true,
        preserveNumbers: true,
        preserveResults: true,
        compressionRatio: 0.3,
      },
      creative: {
        mode: 'SAFE',
        preserveIdeas: true,
        preserveVariants: true,
        compressionRatio: 0.2,
      },
      tool: {
        mode: 'AGGRESSIVE',
        compressToolResults: true,
        maxTokensPerResult: 300,
        compressionRatio: 0.6,
      },
      document: {
        mode: 'BALANCED',
        useRAG: true,
        compressDocuments: true,
        compressionRatio: 0.5,
      },
    };

    return policies[taskType] || policies.chat;
  }
}

module.exports = { TaskClassifier };
