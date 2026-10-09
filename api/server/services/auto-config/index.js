/**
 * Auto Configuration Service
 * ===========================
 *
 * Service for automatic agent configuration based on task analysis.
 *
 * Features:
 * - Task complexity analysis
 * - Model recommendation
 * - Tool selection
 * - Skill matching
 *
 * Autor: Mi LibreChat
 * Version: 1.0.0
 */

const AgentType = {
  CHAT: 'chat',
  CODING: 'coding',
  RESEARCH: 'research',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  PLANNER: 'planner',
  REVIEWER: 'reviewer',
  ARCHITECT: 'architect',
  MANAGER: 'manager',
  WORKFLOW: 'workflow',
  ROUTER: 'router',
  EVALUATOR: 'evaluator',
  CUSTOM: 'custom',
};

const ComplexityLevel = {
  TRIVIAL: 'trivial',
  SIMPLE: 'simple',
  MODERATE: 'moderate',
  COMPLEX: 'complex',
  VERY_COMPLEX: 'very_complex',
  MASSIVE: 'massive',
};

/**
 * Keyword mappings for task analysis
 */
const keywordMappings = {
  agentType: {
    [AgentType.CODING]: [
      'code',
      'programming',
      'function',
      'class',
      'debug',
      'refactor',
      'implement',
      'build',
      'developer',
      'script',
      'api',
      'backend',
      'frontend',
      'bug',
      'test',
    ],
    [AgentType.RESEARCH]: [
      'research',
      'analyze',
      'study',
      'investigate',
      'find',
      'search',
      'discover',
      'report',
      'survey',
      'review',
      'explore',
    ],
    [AgentType.IMAGE]: [
      'image',
      'picture',
      'photo',
      'generate',
      'create',
      'art',
      'design',
      'visual',
      'graphic',
      'draw',
      'paint',
    ],
    [AgentType.VIDEO]: [
      'video',
      'animation',
      'clip',
      'movie',
      'render',
      'produce',
      'film',
      'sequence',
    ],
    [AgentType.AUDIO]: [
      'audio',
      'sound',
      'music',
      'speech',
      'transcribe',
      'voice',
      'podcast',
      'song',
      'synthesize',
    ],
    [AgentType.PLANNER]: [
      'plan',
      'schedule',
      'organize',
      'agenda',
      'timeline',
      'roadmap',
      'strategy',
      'milestone',
    ],
    [AgentType.REVIEWER]: [
      'review',
      'check',
      'validate',
      'verify',
      'audit',
      'inspect',
      'quality',
      'test',
      'evaluate',
    ],
    [AgentType.MANAGER]: [
      'manage',
      'coordinate',
      'oversee',
      'direct',
      'lead',
      'team',
      'project',
      'stakeholder',
    ],
    [AgentType.WORKFLOW]: [
      'workflow',
      'pipeline',
      'process',
      'automation',
      'sequence',
      'chain',
      'flow',
    ],
  },
  complexity: {
    [ComplexityLevel.TRIVIAL]: ['simple', 'easy', 'quick', 'one', 'basic', 'hello'],
    [ComplexityLevel.SIMPLE]: ['small', 'minor', 'little', 'few', 'simple', 'straightforward'],
    [ComplexityLevel.MODERATE]: ['moderate', 'medium', 'standard', 'typical', 'regular'],
    [ComplexityLevel.COMPLEX]: [
      'complex',
      'complicated',
      'difficult',
      'challenging',
      'advanced',
      'multiple',
    ],
    [ComplexityLevel.VERY_COMPLEX]: [
      'very complex',
      'highly complex',
      'enterprise',
      'large scale',
      'distributed',
    ],
    [ComplexityLevel.MASSIVE]: ['massive', 'huge', 'enormous', 'system-wide', 'full application'],
  },
  capabilities: {
    reasoning: ['reason', 'logic', 'think', 'analyze', 'evaluate', 'compare', 'contrast'],
    creativity: ['create', 'generate', 'design', 'invent', 'imagine', 'innovate'],
    research: ['research', 'search', 'find', 'discover', 'investigate', 'explore'],
    communication: ['explain', 'describe', 'summarize', 'translate', 'write', 'present'],
    technical: ['code', 'program', 'debug', 'implement', 'api', 'database', 'system'],
    data: ['data', 'analyze', 'statistics', 'chart', 'graph', 'visualize', 'report'],
  },
  tools: {
    web_search: ['search', 'find online', 'look up', 'internet', 'web'],
    code_execution: ['run code', 'execute', 'python', 'javascript', 'node'],
    file_system: ['read file', 'write file', 'save', 'load', 'file'],
    image_generation: ['generate image', 'create image', 'draw', 'art'],
    browser: ['browse', 'open', 'navigate', 'click', 'webpage'],
  },
};

/**
 * Model recommendations by agent type
 */
const modelRecommendations = {
  [AgentType.CODING]: {
    provider: 'anthropic',
    default: 'claude-sonnet-4-20250514',
    fallback: 'gpt-4o',
    temperature: 0.2,
  },
  [AgentType.RESEARCH]: {
    provider: 'openAI',
    default: 'gpt-4o',
    fallback: 'claude-sonnet-4-20250514',
    temperature: 0.3,
  },
  [AgentType.CHAT]: {
    provider: 'openAI',
    default: 'gpt-4o-mini',
    fallback: 'claude-haiku-4-20250514',
    temperature: 0.7,
  },
  [AgentType.PLANNER]: {
    provider: 'anthropic',
    default: 'claude-sonnet-4-20250514',
    fallback: 'gpt-4o',
    temperature: 0.4,
  },
  [AgentType.IMAGE]: {
    provider: 'openAI',
    default: 'dall-e-3',
    fallback: 'midjourney',
    temperature: 0.9,
  },
};

/**
 * Category mappings
 */
const categoryMappings = {
  coding: ['coding', 'development', 'programming', 'software'],
  research: ['research', 'analysis', 'investigation', 'study'],
  creative: ['creative', 'art', 'design', 'writing', 'content'],
  productivity: ['productivity', 'automation', 'workflow', 'efficiency'],
  data: ['data', 'analytics', 'statistics', 'visualization'],
  general: ['general', 'assistant', 'helper', 'support'],
};

/**
 * Analyze task complexity
 * @param {string} task - Task description
 * @returns {Object} Complexity analysis
 */
function analyzeComplexity(task) {
  const lowerTask = task.toLowerCase();
  let score = 5; // Base score
  const warnings = [];

  // Count complexity indicators
  Object.entries(keywordMappings.complexity).forEach(([level, keywords]) => {
    const matches = keywords.filter((kw) => lowerTask.includes(kw)).length;
    if (matches > 0) {
      switch (level) {
        case ComplexityLevel.TRIVIAL:
          score = Math.max(1, score - 3);
          break;
        case ComplexityLevel.SIMPLE:
          score = Math.max(2, score - 2);
          break;
        case ComplexityLevel.MODERATE:
          break;
        case ComplexityLevel.COMPLEX:
          score = Math.min(9, score + 2);
          break;
        case ComplexityLevel.VERY_COMPLEX:
          score = Math.min(10, score + 4);
          break;
        case ComplexityLevel.MASSIVE:
          score = 10;
          warnings.push('This is a massive task. Consider breaking it down.');
          break;
      }
    }
  });

  // Additional complexity factors
  const multiIndicators = ['multiple', 'several', 'many', 'various', 'different'];
  multiIndicators.forEach((ind) => {
    if (lowerTask.includes(ind)) score = Math.min(10, score + 1);
  });

  // Determine complexity level
  let level;
  if (score <= 2) level = ComplexityLevel.TRIVIAL;
  else if (score <= 4) level = ComplexityLevel.SIMPLE;
  else if (score <= 6) level = ComplexityLevel.MODERATE;
  else if (score <= 8) level = ComplexityLevel.COMPLEX;
  else if (score <= 9) level = ComplexityLevel.VERY_COMPLEX;
  else level = ComplexityLevel.MASSIVE;

  return { level, score, warnings };
}

/**
 * Detect agent type from task
 * @param {string} task - Task description
 * @returns {string} Detected agent type
 */
function detectAgentType(task) {
  const lowerTask = task.toLowerCase();
  const scores = {};

  Object.entries(keywordMappings.agentType).forEach(([type, keywords]) => {
    const matches = keywords.filter((kw) => lowerTask.includes(kw)).length;
    scores[type] = matches;
  });

  // Find highest scoring type
  let maxScore = 0;
  let detectedType = AgentType.CHAT;

  Object.entries(scores).forEach(([type, score]) => {
    if (score > maxScore) {
      maxScore = score;
      detectedType = type;
    }
  });

  return detectedType;
}

/**
 * Detect required capabilities
 * @param {string} task - Task description
 * @returns {string[]} List of capabilities
 */
function detectCapabilities(task) {
  const lowerTask = task.toLowerCase();
  const capabilities = [];

  Object.entries(keywordMappings.capabilities).forEach(([capability, keywords]) => {
    const matches = keywords.filter((kw) => lowerTask.includes(kw)).length;
    if (matches > 0) {
      capabilities.push(capability);
    }
  });

  // Always include basic communication
  if (capabilities.length === 0) {
    capabilities.push('communication');
  }

  return capabilities;
}

/**
 * Suggest tools based on task
 * @param {string} task - Task description
 * @returns {string[]} List of suggested tools
 */
function suggestTools(task) {
  const lowerTask = task.toLowerCase();
  const tools = [];

  Object.entries(keywordMappings.tools).forEach(([tool, keywords]) => {
    const matches = keywords.filter((kw) => lowerTask.includes(kw)).length;
    if (matches > 0) {
      tools.push(tool);
    }
  });

  return tools;
}

/**
 * Determine category
 * @param {string} agentType - Agent type
 * @param {string} task - Task description
 * @returns {string} Category
 */
function determineCategory(agentType, task) {
  const lowerTask = task.toLowerCase();

  for (const [category, keywords] of Object.entries(categoryMappings)) {
    const matches = keywords.filter((kw) => lowerTask.includes(kw)).length;
    if (matches > 0) return category;
  }

  // Default based on agent type
  const typeToCategory = {
    [AgentType.CODING]: 'coding',
    [AgentType.RESEARCH]: 'research',
    [AgentType.IMAGE]: 'creative',
    [AgentType.AUDIO]: 'creative',
    [AgentType.PLANNER]: 'productivity',
  };

  return typeToCategory[agentType] || 'general';
}

/**
 * Estimate time based on complexity
 * @param {string} complexity - Complexity level
 * @returns {number} Estimated minutes
 */
function estimateTime(complexity) {
  const timeEstimates = {
    [ComplexityLevel.TRIVIAL]: 5,
    [ComplexityLevel.SIMPLE]: 15,
    [ComplexityLevel.MODERATE]: 30,
    [ComplexityLevel.COMPLEX]: 60,
    [ComplexityLevel.VERY_COMPLEX]: 120,
    [ComplexityLevel.MASSIVE]: 240,
  };

  return timeEstimates[complexity] || 30;
}

/**
 * Main analysis function
 * @param {string} task - Task description
 * @param {Object} preferences - User preferences
 * @returns {Object} Analysis result
 */
function analyzeTask(task, preferences = {}) {
  try {
    // Detect agent type
    const agentType = detectAgentType(task);

    // Analyze complexity
    const { level: complexity, score: complexityScore, warnings } = analyzeComplexity(task);

    // Get model recommendation
    const modelRec = modelRecommendations[agentType] || modelRecommendations[AgentType.CHAT];

    // Adjust based on preferences
    if (preferences.preferFastResponse) {
      modelRec.default = modelRec.default.includes('mini')
        ? modelRec.default
        : modelRec.default + '-mini';
    }
    if (preferences.preferCostEfficient) {
      modelRec.default = modelRec.default.includes('mini') ? modelRec.default : modelRec.default;
    }

    // Detect capabilities and tools
    const capabilities = detectCapabilities(task);
    const suggestedTools = suggestTools(task);

    // Determine category
    const category = determineCategory(agentType, task);

    // Check if task can be parallelized
    const canParallelize =
      task.toLowerCase().includes('parallel') ||
      task.toLowerCase().includes('concurrent') ||
      task.toLowerCase().includes('multiple at once');

    // Build analysis result
    const analysis = {
      originalTask: task,
      complexity,
      complexityScore,
      suggestedAgentType: agentType,
      suggestedCategory: category,
      suggestedModel: modelRec.default,
      suggestedProvider: modelRec.provider,
      requiredCapabilities: capabilities,
      suggestedTools,
      suggestedSkills: [], // Can be extended with skill matching
      estimatedTimeMinutes: estimateTime(complexity),
      canParallelize,
      warnings,
    };

    // Build recommendation
    const recommendation = {
      model: {
        provider: modelRec.provider,
        model: modelRec.default,
        fallback: modelRec.fallback,
        temperature: modelRec.temperature,
      },
      category,
      capabilities,
      tools: suggestedTools,
      skills: [],
      memory: {
        type: complexityScore > 7 ? 'hybrid' : 'short',
        config:
          complexityScore > 7
            ? { maxItems: 500, contextWindow: 50 }
            : { maxItems: 100, contextWindow: 10 },
      },
      workflow: canParallelize ? { type: 'parallel', agents: 2 } : undefined,
    };

    return {
      success: true,
      analysis,
      recommendation,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Analysis failed',
    };
  }
}

module.exports = {
  analyzeTask,
  AgentType,
  ComplexityLevel,
};
