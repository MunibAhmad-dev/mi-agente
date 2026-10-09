/**
 * Auto Config Routes
 * ==================
 *
 * API routes for automatic agent configuration.
 *
 * Endpoints:
 * - POST /api/auto-config/analyze - Analyze task and get recommendations
 * - GET /api/auto-config/templates - Get configuration templates
 * - GET /api/auto-config/models - Get available models
 *
 * Autor: Mi LibreChat
 * Version: 1.0.0
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('../middleware');
const { analyzeTask } = require('../services/auto-config');

/**
 * POST /api/auto-config/analyze
 *
 * Analyze a task and return automatic configuration recommendations.
 */
router.post('/analyze', requireJwtAuth, async (req, res) => {
  try {
    const { task, preferences } = req.body;

    if (!task || typeof task !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Task description is required and must be a string',
      });
    }

    if (task.length > 5000) {
      return res.status(400).json({
        success: false,
        error: 'Task description is too long (max 5000 characters)',
      });
    }

    const result = analyzeTask(task, preferences);

    if (!result.success) {
      return res.status(500).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('Auto-config analyze error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during analysis',
    });
  }
});

/**
 * GET /api/auto-config/templates
 *
 * Get available configuration templates.
 */
router.get('/templates', requireJwtAuth, async (req, res) => {
  try {
    const templates = [
      {
        id: 'coding-assistant',
        name: 'Coding Assistant',
        description: 'General purpose coding assistant for code generation and debugging',
        agentType: 'coding',
        config: {
          model: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', temperature: 0.2 },
          capabilities: ['reasoning', 'technical', 'communication'],
          tools: ['code_execution', 'file_system'],
          memory: { type: 'long', config: { maxItems: 200, contextWindow: 30 } },
        },
      },
      {
        id: 'research-agent',
        name: 'Research Agent',
        description: 'Agent specialized in research and information gathering',
        agentType: 'research',
        config: {
          model: { provider: 'openAI', model: 'gpt-4o', temperature: 0.3 },
          capabilities: ['research', 'communication', 'data'],
          tools: ['web_search'],
          memory: { type: 'hybrid', config: { maxItems: 500, contextWindow: 50 } },
        },
      },
      {
        id: 'creative-writer',
        name: 'Creative Writer',
        description: 'Agent for creative writing and content generation',
        agentType: 'chat',
        config: {
          model: { provider: 'openAI', model: 'gpt-4o', temperature: 0.8 },
          capabilities: ['creativity', 'communication'],
          tools: [],
          memory: { type: 'short', config: { maxItems: 50, contextWindow: 10 } },
        },
      },
      {
        id: 'planner-agent',
        name: 'Planner Agent',
        description: 'Agent for planning and scheduling tasks',
        agentType: 'planner',
        config: {
          model: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', temperature: 0.4 },
          capabilities: ['reasoning', 'planning'],
          tools: [],
          memory: { type: 'hybrid', config: { maxItems: 300, contextWindow: 40 } },
        },
      },
      {
        id: 'qa-reviewer',
        name: 'QA Reviewer',
        description: 'Agent for quality assurance and code review',
        agentType: 'reviewer',
        config: {
          model: { provider: 'anthropic', model: 'claude-sonnet-4-20250514', temperature: 0.1 },
          capabilities: ['reasoning', 'technical', 'communication'],
          tools: ['code_execution', 'web_search'],
          memory: { type: 'long', config: { maxItems: 200, contextWindow: 30 } },
        },
      },
    ];

    return res.json({
      success: true,
      templates,
    });
  } catch (error) {
    console.error('Auto-config templates error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch templates',
    });
  }
});

/**
 * GET /api/auto-config/models
 *
 * Get available models by provider.
 */
router.get('/models', requireJwtAuth, async (req, res) => {
  try {
    const { provider } = req.query;

    const models = {
      openAI: [
        { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, supportsFunctionCalling: true },
        {
          id: 'gpt-4o-mini',
          name: 'GPT-4o Mini',
          contextWindow: 128000,
          supportsFunctionCalling: true,
        },
        {
          id: 'gpt-4-turbo',
          name: 'GPT-4 Turbo',
          contextWindow: 128000,
          supportsFunctionCalling: true,
        },
        {
          id: 'gpt-3.5-turbo',
          name: 'GPT-3.5 Turbo',
          contextWindow: 16385,
          supportsFunctionCalling: true,
        },
        {
          id: 'dall-e-3',
          name: 'DALL-E 3',
          contextWindow: 0,
          supportsFunctionCalling: false,
          type: 'image',
        },
      ],
      anthropic: [
        {
          id: 'claude-sonnet-4-20250514',
          name: 'Claude Sonnet 4',
          contextWindow: 200000,
          supportsFunctionCalling: true,
        },
        {
          id: 'claude-opus-4-20250514',
          name: 'Claude Opus 4',
          contextWindow: 200000,
          supportsFunctionCalling: true,
        },
        {
          id: 'claude-haiku-4-20250514',
          name: 'Claude Haiku 4',
          contextWindow: 200000,
          supportsFunctionCalling: true,
        },
        {
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          contextWindow: 200000,
          supportsFunctionCalling: true,
        },
        {
          id: 'claude-3-opus-20240229',
          name: 'Claude 3 Opus',
          contextWindow: 200000,
          supportsFunctionCalling: true,
        },
      ],
      google: [
        {
          id: 'gemini-1.5-pro',
          name: 'Gemini 1.5 Pro',
          contextWindow: 2000000,
          supportsFunctionCalling: true,
        },
        {
          id: 'gemini-1.5-flash',
          name: 'Gemini 1.5 Flash',
          contextWindow: 1000000,
          supportsFunctionCalling: true,
        },
        {
          id: 'gemini-1.0-pro',
          name: 'Gemini 1.0 Pro',
          contextWindow: 32768,
          supportsFunctionCalling: true,
        },
      ],
      openrouter: [
        {
          id: 'openrouter/auto',
          name: 'Auto Router',
          contextWindow: 128000,
          supportsFunctionCalling: true,
        },
        {
          id: 'anthropic/claude-3-haiku',
          name: 'Claude 3 Haiku (via OR)',
          contextWindow: 200000,
          supportsFunctionCalling: true,
        },
        {
          id: 'openai/gpt-4o',
          name: 'GPT-4o (via OR)',
          contextWindow: 128000,
          supportsFunctionCalling: true,
        },
      ],
    };

    if (provider && models[provider]) {
      return res.json({
        success: true,
        provider,
        models: models[provider],
      });
    }

    return res.json({
      success: true,
      models,
    });
  } catch (error) {
    console.error('Auto-config models error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch models',
    });
  }
});

/**
 * GET /api/auto-config/capabilities
 *
 * Get available agent capabilities.
 */
router.get('/capabilities', requireJwtAuth, async (req, res) => {
  try {
    const capabilities = [
      {
        id: 'reasoning',
        name: 'Logical Reasoning',
        description: 'Advanced logical thinking and problem solving',
      },
      {
        id: 'creativity',
        name: 'Creativity',
        description: 'Creative thinking and content generation',
      },
      {
        id: 'research',
        name: 'Research',
        description: 'Information gathering and research skills',
      },
      {
        id: 'communication',
        name: 'Communication',
        description: 'Clear and effective communication',
      },
      { id: 'technical', name: 'Technical', description: 'Technical and programming skills' },
      { id: 'data', name: 'Data Analysis', description: 'Data analysis and visualization' },
      { id: 'planning', name: 'Planning', description: 'Planning and scheduling capabilities' },
      { id: 'critique', name: 'Critique', description: 'Review and evaluation skills' },
    ];

    return res.json({
      success: true,
      capabilities,
    });
  } catch (error) {
    console.error('Auto-config capabilities error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch capabilities',
    });
  }
});

/**
 * GET /api/auto-config/tools
 *
 * Get available tools for agents.
 */
router.get('/tools', requireJwtAuth, async (req, res) => {
  try {
    const tools = [
      {
        id: 'web_search',
        name: 'Web Search',
        description: 'Search the web for information',
        category: 'search',
      },
      {
        id: 'code_execution',
        name: 'Code Execution',
        description: 'Execute code in various languages',
        category: 'execution',
      },
      {
        id: 'file_system',
        name: 'File System',
        description: 'Read and write files',
        category: 'storage',
      },
      {
        id: 'image_generation',
        name: 'Image Generation',
        description: 'Generate images with AI',
        category: 'creative',
      },
      {
        id: 'browser',
        name: 'Browser',
        description: 'Browse and interact with web pages',
        category: 'browser',
      },
      {
        id: 'calculator',
        name: 'Calculator',
        description: 'Perform mathematical calculations',
        category: 'utility',
      },
      {
        id: 'database',
        name: 'Database',
        description: 'Query and manage databases',
        category: 'storage',
      },
    ];

    return res.json({
      success: true,
      tools,
    });
  } catch (error) {
    console.error('Auto-config tools error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch tools',
    });
  }
});

module.exports = router;
