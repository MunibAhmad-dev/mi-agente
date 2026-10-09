/**
 * Discovery API Routes
 * ====================
 * Rutas API para el sistema de búsqueda universal de plugins, skills y herramientas
 *
 * Endpoints:
 * - POST /api/discovery/search - Búsqueda universal
 * - GET  /api/discovery/search/:source - Búsqueda en fuente específica
 * - GET  /api/discovery/featured - Plugins destacados
 * - GET  /api/discovery/categories - Categorías de plugins
 * - GET  /api/discovery/agents - Agentes compatibles
 * - GET  /api/discovery/plugin/:source/:id - Detalles de plugin
 */

const express = require('express');
const router = express.Router();
const { logger } = require('@librechat/data-schemas');

// Fuentes disponibles para búsqueda
const SOURCES = {
  github: 'https://api.github.com',
  huggingface: 'https://huggingface.co',
  mcp: 'https://modelcontextprotocol.github.io',
  npm: 'https://registry.npmjs.org',
  pypi: 'https://pypi.org',
};

// Categorías de plugins
const CATEGORIES = [
  {
    id: 'coding',
    name: 'Coding & Development',
    description: 'Code generation, refactoring, debugging',
    icon: '💻',
  },
  {
    id: 'research',
    name: 'Research & Analysis',
    description: 'Web search, data analysis, documentation',
    icon: '🔍',
  },
  {
    id: 'creative',
    name: 'Creative & Design',
    description: 'Image generation, writing, creative tools',
    icon: '🎨',
  },
  {
    id: 'productivity',
    name: 'Productivity',
    description: 'Automation, task management, integrations',
    icon: '⚡',
  },
  {
    id: 'security',
    name: 'Security & DevOps',
    description: 'Security scanning, deployment, monitoring',
    icon: '🔒',
  },
  {
    id: 'ai_ml',
    name: 'AI & Machine Learning',
    description: 'ML models, prompts, fine-tuning',
    icon: '🧠',
  },
  {
    id: 'communication',
    name: 'Communication',
    description: 'Slack, Discord, email integrations',
    icon: '💬',
  },
  {
    id: 'database',
    name: 'Database & Storage',
    description: 'Database tools, file storage, backups',
    icon: '🗄️',
  },
];

// Agentes compatibles
const AGENTS = [
  {
    id: 'claude_code',
    name: 'Claude Code',
    icon: '🤖',
    website: 'https://docs.anthropic.com/en/docs/claude-code',
    supportedTypes: ['skill', 'plugin', 'tool'],
  },
  {
    id: 'manus',
    name: 'Manus',
    icon: '📖',
    website: 'https://manus.im',
    supportedTypes: ['skill', 'plugin', 'tool'],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    icon: '👨‍💻',
    website: 'https://cursor.sh',
    supportedTypes: ['skill', 'plugin', 'tool'],
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    icon: '🌊',
    website: 'https://codeium.com/windsurf',
    supportedTypes: ['skill', 'plugin', 'tool'],
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    icon: '💻',
    website: 'https://github.com/features/copilot',
    supportedTypes: ['plugin', 'tool'],
  },
  {
    id: 'continue',
    name: 'Continue',
    icon: '▶️',
    website: 'https://continue.dev',
    supportedTypes: ['skill', 'plugin', 'tool'],
  },
  {
    id: 'replit_agent',
    name: 'Replit Agent',
    icon: '🔄',
    website: 'https://replit.com',
    supportedTypes: ['skill', 'plugin', 'tool'],
  },
  {
    id: 'openhands',
    name: 'OpenHands',
    icon: '🤝',
    website: 'https://www.all-hands.dev',
    supportedTypes: ['skill', 'plugin', 'tool'],
  },
];

// Plugins destacados
const FEATURED_PLUGINS = [
  {
    id: 'mcp-servers',
    name: 'Model Context Protocol Servers',
    description: 'Oficial collection of MCP servers for Claude',
    source: 'mcp',
    type: 'tool',
    url: 'https://github.com/modelcontextprotocol/servers',
    stars: 6000,
    category: 'coding',
    icon: '🔌',
  },
  {
    id: 'awesome-agent-skills',
    name: 'Awesome Agent Skills',
    description: 'Curated collection of skills for AI agents',
    source: 'github',
    type: 'skill',
    url: 'https://github.com/VoltAgent/awesome-agent-skills',
    stars: 5000,
    category: 'coding',
    icon: '⭐',
  },
  {
    id: 'langchain-skills',
    name: 'LangChain Skills',
    description: 'Skills and tools for LangChain agents',
    source: 'github',
    type: 'skill',
    url: 'https://github.com/langchain-ai/langchain-skills',
    stars: 2500,
    category: 'ai_ml',
    icon: '⛓️',
  },
  {
    id: 'react-agent-tools',
    name: 'React Agent Tools',
    description: 'Tools for building React applications',
    source: 'github',
    type: 'tool',
    url: 'https://github.com/agent-repos/react',
    stars: 1800,
    category: 'coding',
    icon: '⚛️',
  },
  {
    id: 'code-review-agent',
    name: 'Code Review Agent',
    description: 'Automated code review with AI',
    source: 'github',
    type: 'skill',
    url: 'https://github.com/agent-repos/code-review',
    stars: 1200,
    category: 'coding',
    icon: '🔍',
  },
  {
    id: 'openapi-mcp',
    name: 'OpenAPI MCP Server',
    description: 'MCP server for OpenAPI specifications',
    source: 'mcp',
    type: 'tool',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/openapi',
    stars: 800,
    category: 'coding',
    icon: '📡',
  },
  {
    id: 'filesystem-mcp',
    name: 'Filesystem MCP Server',
    description: 'MCP server for filesystem operations',
    source: 'mcp',
    type: 'tool',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    stars: 750,
    category: 'productivity',
    icon: '📁',
  },
  {
    id: 'github-mcp',
    name: 'GitHub MCP Server',
    description: 'MCP server for GitHub integration',
    source: 'mcp',
    type: 'tool',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
    stars: 700,
    category: 'productivity',
    icon: '🐙',
  },
];

/**
 * GET /api/discovery/featured
 * Obtiene plugins destacados
 */
router.get('/featured', (req, res) => {
  res.json(FEATURED_PLUGINS);
});

/**
 * GET /api/discovery/categories
 * Obtiene categorías de plugins
 */
router.get('/categories', (req, res) => {
  const categoriesWithCount = CATEGORIES.map((cat) => ({
    ...cat,
    count: FEATURED_PLUGINS.filter((p) => p.category === cat.id).length,
  }));
  res.json(categoriesWithCount);
});

/**
 * GET /api/discovery/agents
 * Obtiene agentes compatibles
 */
router.get('/agents', (req, res) => {
  res.json(AGENTS);
});

/**
 * POST /api/discovery/search
 * Búsqueda universal en múltiples fuentes
 */
router.post('/search', async (req, res) => {
  const startTime = Date.now();
  const {
    query,
    sources = ['github', 'huggingface', 'mcp', 'npm', 'pypi'],
    limit = 20,
    agents = [],
  } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    const results = [];
    const sourcesSearched = [];

    // Buscar en cada fuente
    const searchPromises = sources.map(async (source) => {
      try {
        const sourceResults = await searchInSource(
          source,
          query,
          Math.ceil(limit / sources.length),
        );
        results.push(...sourceResults);
        sourcesSearched.push(source);
      } catch (error) {
        logger.warn(`[Discovery] Search in ${source} failed:`, error);
      }
    });

    await Promise.all(searchPromises);

    // Rankear resultados
    const rankedResults = rankResults(results, query, agents);

    res.json({
      results: rankedResults.slice(0, limit),
      totalFound: rankedResults.length,
      sourcesSearched,
      queryTimeMs: Date.now() - startTime,
      cacheHit: false,
    });
  } catch (error) {
    logger.error('[Discovery] Search failed:', error);
    // Devolver fallback
    const fallback = FEATURED_PLUGINS.filter(
      (p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.description.toLowerCase().includes(query.toLowerCase()),
    ).map((p) => resultToSearchResult(p));

    res.json({
      results: fallback.slice(0, limit),
      totalFound: fallback.length,
      sourcesSearched: [],
      queryTimeMs: Date.now() - startTime,
      cacheHit: true,
    });
  }
});

/**
 * GET /api/discovery/search/:source
 * Búsqueda en fuente específica
 */
router.get('/search/:source', async (req, res) => {
  const { source } = req.params;
  const { q = '', limit = 10 } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Query parameter q is required' });
  }

  try {
    const results = await searchInSource(source, q, parseInt(limit));
    res.json({ results });
  } catch (error) {
    logger.error(`[Discovery] Search in ${source} failed:`, error);
    res.status(500).json({ error: `Search in ${source} failed` });
  }
});

/**
 * GET /api/discovery/plugin/:source/:id
 * Detalles de un plugin específico
 */
router.get('/plugin/:source/:id', (req, res) => {
  const { source, id } = req.params;

  const plugin = FEATURED_PLUGINS.find((p) => p.source === source && p.id === id);
  if (plugin) {
    res.json(resultToSearchResult(plugin));
  } else {
    res.status(404).json({ error: 'Plugin not found' });
  }
});

// ============== Helper Functions ==============

async function searchInSource(source, query, limit) {
  switch (source) {
    case 'github':
      return searchGitHub(query, limit);
    case 'huggingface':
      return searchHuggingFace(query, limit);
    case 'mcp':
      return searchMCP(query, limit);
    case 'npm':
      return searchNPM(query, limit);
    case 'pypi':
      return searchPyPI(query, limit);
    default:
      return [];
  }
}

async function searchGitHub(query, limit) {
  try {
    const response = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}+topic:skill+OR+topic:plugin+OR+topic:agent&per_page=${limit}&sort=stars&order=desc`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'MiLibreChat',
        },
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    return (data.items || []).map((repo) => ({
      id: `github-${repo.id}`,
      name: repo.name,
      description: repo.description || '',
      source: 'github',
      type: detectTypeFromRepo(repo),
      url: repo.html_url,
      stars: repo.stargazers_count,
      author: repo.owner.login,
      tags: repo.topics || [],
      installationCommand: getGitHubInstallCommand(repo),
      compatibleAgents: detectCompatibleAgents(repo),
      score: repo.stargazers_count / 1000,
    }));
  } catch (error) {
    logger.warn('[Discovery] GitHub search failed:', error);
    return [];
  }
}

async function searchHuggingFace(query, limit) {
  try {
    const response = await fetch(
      `https://huggingface.co/api/spaces?search=${encodeURIComponent(query)}&limit=${limit}&sort=likes`,
    );

    if (!response.ok) {
      throw new Error(`HuggingFace API error: ${response.status}`);
    }

    const data = await response.json();
    return (data || []).map((space) => ({
      id: `hf-${space.id}`,
      name: space.id.split('/').pop(),
      description: space.description || '',
      source: 'huggingface',
      type: 'tool',
      url: `https://huggingface.co/spaces/${space.id}`,
      likes: space.likes || 0,
      author: space.id.split('/')[0],
      tags: space.tags || [],
      compatibleAgents: ['claude_code', 'openhands'],
      score: (space.likes || 0) / 100,
    }));
  } catch (error) {
    logger.warn('[Discovery] HuggingFace search failed:', error);
    return [];
  }
}

async function searchMCP(query, limit) {
  // MCP servers de la lista oficial
  const mcpServers = [
    {
      name: 'github',
      url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
      description: 'MCP server for GitHub integration',
      stars: 700,
    },
    {
      name: 'filesystem',
      url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
      description: 'MCP server for filesystem operations',
      stars: 750,
    },
    {
      name: 'openapi',
      url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/openapi',
      description: 'MCP server for OpenAPI specs',
      stars: 800,
    },
    {
      name: 'postgres',
      url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
      description: 'MCP server for PostgreSQL',
      stars: 600,
    },
    {
      name: 's3',
      url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/s3',
      description: 'MCP server for AWS S3',
      stars: 500,
    },
    {
      name: 'slack',
      url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
      description: 'MCP server for Slack',
      stars: 450,
    },
    {
      name: 'google-maps',
      url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/google-maps',
      description: 'MCP server for Google Maps',
      stars: 400,
    },
    {
      name: 'everart',
      url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/everart',
      description: 'MCP server for EverArt',
      stars: 350,
    },
    {
      name: 'memory',
      url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
      description: 'MCP server for persistent memory',
      stars: 300,
    },
    {
      name: 'fetch',
      url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
      description: 'MCP server for web fetching',
      stars: 280,
    },
  ];

  const queryLower = query.toLowerCase();
  return mcpServers
    .filter((s) => s.name.includes(queryLower) || s.description.toLowerCase().includes(queryLower))
    .slice(0, limit)
    .map((s) => ({
      id: `mcp-${s.name}`,
      name: `${s.name} (MCP)`,
      description: s.description,
      source: 'mcp',
      type: 'tool',
      url: s.url,
      stars: s.stars,
      tags: ['mcp', 'tool'],
      installationCommand: `npx -y @modelcontextprotocol/server-${s.name}`,
      compatibleAgents: ['claude_code', 'cursor', 'windsurf', 'manus', 'openhands'],
      score: s.stars / 100,
    }));
}

async function searchNPM(query, limit) {
  try {
    const response = await fetch(
      `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}+agent&size=${limit}`,
    );

    if (!response.ok) {
      throw new Error(`NPM API error: ${response.status}`);
    }

    const data = await response.json();
    return (data.objects || []).map((pkg) => ({
      id: `npm-${pkg.package.name}`,
      name: pkg.package.name,
      description: pkg.package.description || '',
      source: 'npm',
      type: 'plugin',
      url: `https://www.npmjs.com/package/${pkg.package.name}`,
      downloads: pkg.package.downloads?.[0]?.downloads,
      author: pkg.package.publisher?.username,
      tags: pkg.package.keywords || [],
      installationCommand: `npm install ${pkg.package.name}`,
      compatibleAgents: ['cursor', 'windsurf', 'replit_agent'],
      score: pkg.score?.final || 0,
    }));
  } catch (error) {
    logger.warn('[Discovery] NPM search failed:', error);
    return [];
  }
}

async function searchPyPI(query, limit) {
  try {
    const response = await fetch(
      `https://pypi.org/search/?q=${encodeURIComponent(query)}&num=${limit}`,
    );

    if (!response.ok) {
      throw new Error(`PyPI API error: ${response.status}`);
    }

    // PyPI no tiene API de búsqueda directa, usar fallback
    const pyPlugins = [
      {
        name: 'langchain',
        description: 'Building applications with LLMs through composability',
        url: 'https://pypi.org/project/langchain/',
      },
      {
        name: 'crewai',
        description: 'AI agent framework',
        url: 'https://pypi.org/project/crewai/',
      },
      {
        name: 'autogen',
        description: 'Multi-agent AutoGen',
        url: 'https://pypi.org/project/pyautogen/',
      },
    ];

    return pyPlugins
      .filter(
        (p) =>
          p.name.includes(query.toLowerCase()) ||
          p.description.toLowerCase().includes(query.toLowerCase()),
      )
      .slice(0, limit)
      .map((p) => ({
        id: `pypi-${p.name}`,
        name: p.name,
        description: p.description,
        source: 'pypi',
        type: 'tool',
        url: p.url,
        tags: ['python', 'ai'],
        installationCommand: `pip install ${p.name}`,
        compatibleAgents: ['openhands', 'claude_code'],
        score: 1,
      }));
  } catch (error) {
    logger.warn('[Discovery] PyPI search failed:', error);
    return [];
  }
}

function rankResults(results, query, agents = []) {
  const queryWords = query.toLowerCase().split(/\s+/);

  return results
    .map((result) => {
      let score = result.score || 0;

      // Boost por relevancia en nombre
      const nameLower = result.name.toLowerCase();
      queryWords.forEach((word) => {
        if (nameLower.includes(word)) {
          score += 2;
        }
      });

      // Boost por relevancia en descripción
      const descLower = (result.description || '').toLowerCase();
      queryWords.forEach((word) => {
        if (descLower.includes(word)) {
          score += 0.5;
        }
      });

      // Boost por compatibilidad con agentes
      if (agents.length > 0 && result.compatibleAgents) {
        const agentMatch = result.compatibleAgents.some((a) => agents.includes(a));
        if (agentMatch) {
          score += 1;
        }
      }

      return { ...result, score };
    })
    .sort((a, b) => b.score - a.score);
}

function detectTypeFromRepo(repo) {
  const topics = (repo.topics || []).map((t) => t.toLowerCase());
  if (topics.includes('skill')) return 'skill';
  if (topics.includes('plugin')) return 'plugin';
  if (topics.includes('agent')) return 'agent';
  if (topics.includes('dataset')) return 'dataset';
  if (topics.includes('model')) return 'model';
  return 'tool';
}

function detectCompatibleAgents(repo) {
  const topics = (repo.topics || []).map((t) => t.toLowerCase());
  const agents = [];

  if (topics.some((t) => ['claude', 'anthropic'].some((x) => t.includes(x)))) {
    agents.push('claude_code');
  }
  if (topics.some((t) => t.includes('cursor'))) {
    agents.push('cursor');
  }
  if (topics.some((t) => t.includes('mcp'))) {
    agents.push('claude_code', 'cursor', 'windsurf', 'manus', 'openhands');
  }
  if (agents.length === 0) {
    agents.push('claude_code', 'cursor', 'windsurf', 'manus');
  }

  return [...new Set(agents)];
}

function getGitHubInstallCommand(repo) {
  if (repo.name.includes('mcp') || repo.topics?.includes('mcp')) {
    const serverName = repo.name.replace(/^mcp-/, '').replace(/server-/, '');
    return `npx -y @modelcontextprotocol/server-${serverName}`;
  }
  if (repo.language === 'Python') {
    return `pip install ${repo.name}`;
  }
  if (repo.language === 'JavaScript' || repo.language === 'TypeScript') {
    return `npm install ${repo.name}`;
  }
  return `git clone ${repo.clone_url}`;
}

function resultToSearchResult(plugin) {
  return {
    id: plugin.id,
    name: plugin.name,
    description: plugin.description,
    source: plugin.source,
    type: plugin.type,
    url: plugin.url,
    stars: plugin.stars,
    tags: [plugin.category],
    compatibleAgents: ['claude_code', 'cursor', 'windsurf', 'manus'],
    score: (plugin.stars || 0) / 1000,
  };
}

module.exports = router;
