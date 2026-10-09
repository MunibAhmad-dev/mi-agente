/**
 * Marketplace API Routes
 * =====================
 * Rutas API para el Marketplace de skills y plugins
 *
 * Endpoints:
 * - GET  /api/marketplace/skills - Lista de skills
 * - GET  /api/marketplace/skills/:id - Detalles de skill
 * - GET  /api/marketplace/categories - Categorías
 * - GET  /api/marketplace/featured - Skills destacados
 * - POST /api/marketplace/skills/:id/rate - Calificar skill
 * - POST /api/marketplace/skills/:id/install - Registrar instalación
 * - GET  /api/marketplace/stats - Estadísticas
 */

const express = require('express');
const router = express.Router();
const { logger } = require('@librechat/data-schemas');

// Skills Registry (in-memory, normalmente vendría de BD)
let SKILLS_REGISTRY = [
  // MCP Servers
  {
    id: 'github-mcp',
    name: 'GitHub MCP Server',
    source: 'mcp',
    type: 'tool',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
    stars: 700,
    tags: ['github', 'git'],
    categories: ['coding'],
    compatibleAgents: ['claude_code', 'cursor', 'windsurf', 'openhands'],
    verified: true,
    featured: true,
    rating: 4.9,
    reviewCount: 312,
  },
  {
    id: 'filesystem-mcp',
    name: 'Filesystem MCP Server',
    source: 'mcp',
    type: 'tool',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    stars: 750,
    tags: ['filesystem'],
    categories: ['coding'],
    compatibleAgents: ['claude_code', 'cursor', 'windsurf', 'openhands'],
    verified: true,
    featured: true,
    rating: 4.9,
    reviewCount: 203,
  },
  {
    id: 'code-review-mcp',
    name: 'Code Review MCP',
    source: 'mcp',
    type: 'skill',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
    stars: 1200,
    tags: ['code-review', 'github'],
    categories: ['coding'],
    compatibleAgents: ['claude_code', 'cursor', 'openhands'],
    verified: true,
    featured: true,
    rating: 4.8,
    reviewCount: 156,
  },
  {
    id: 'memory-mcp',
    name: 'Memory MCP Server',
    source: 'mcp',
    type: 'tool',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
    stars: 300,
    tags: ['memory', 'storage'],
    categories: ['productivity'],
    compatibleAgents: ['claude_code', 'cursor', 'openhands'],
    verified: true,
    featured: true,
    rating: 4.6,
    reviewCount: 178,
  },
  {
    id: 'slack-mcp',
    name: 'Slack MCP Server',
    source: 'mcp',
    type: 'tool',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
    stars: 450,
    tags: ['slack', 'messaging'],
    categories: ['communication'],
    compatibleAgents: ['claude_code', 'openhands'],
    verified: true,
    featured: false,
    rating: 4.5,
    reviewCount: 98,
  },
  {
    id: 'postgres-mcp',
    name: 'PostgreSQL MCP Server',
    source: 'mcp',
    type: 'tool',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
    stars: 600,
    tags: ['database', 'postgres'],
    categories: ['database'],
    compatibleAgents: ['claude_code', 'openhands'],
    verified: true,
    featured: false,
    rating: 4.7,
    reviewCount: 134,
  },
  {
    id: 'openapi-mcp',
    name: 'OpenAPI MCP Server',
    source: 'mcp',
    type: 'tool',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/openapi',
    stars: 800,
    tags: ['openapi', 'api'],
    categories: ['coding'],
    compatibleAgents: ['claude_code', 'cursor'],
    verified: true,
    featured: false,
    rating: 4.6,
    reviewCount: 89,
  },
  {
    id: 'fetch-mcp',
    name: 'Fetch MCP Server',
    source: 'mcp',
    type: 'tool',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
    stars: 280,
    tags: ['fetch', 'http'],
    categories: ['coding'],
    compatibleAgents: ['claude_code', 'cursor', 'openhands'],
    verified: true,
    featured: false,
    rating: 4.7,
    reviewCount: 145,
  },
  {
    id: 's3-mcp',
    name: 'AWS S3 MCP Server',
    source: 'mcp',
    type: 'tool',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/s3',
    stars: 500,
    tags: ['aws', 's3', 'storage'],
    categories: ['database'],
    compatibleAgents: ['claude_code', 'openhands'],
    verified: true,
    featured: false,
    rating: 4.5,
    reviewCount: 123,
  },
  {
    id: 'google-maps-mcp',
    name: 'Google Maps MCP Server',
    source: 'mcp',
    type: 'tool',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/google-maps',
    stars: 400,
    tags: ['maps', 'location'],
    categories: ['productivity'],
    compatibleAgents: ['claude_code', 'openhands'],
    verified: true,
    featured: false,
    rating: 4.3,
    reviewCount: 67,
  },
  // NPM Packages
  {
    id: 'langchain',
    name: 'LangChain',
    source: 'npm',
    type: 'skill',
    url: 'https://www.npmjs.com/package/langchain',
    downloads: 5000000,
    tags: ['ai', 'llm'],
    categories: ['ai_ml'],
    compatibleAgents: ['cursor', 'windsurf', 'openhands'],
    verified: true,
    featured: true,
    rating: 4.6,
    reviewCount: 567,
  },
  {
    id: 'crewai',
    name: 'CrewAI',
    source: 'npm',
    type: 'skill',
    url: 'https://www.npmjs.com/package/crewai',
    downloads: 150000,
    tags: ['ai', 'agents'],
    categories: ['ai_ml'],
    compatibleAgents: ['cursor', 'openhands'],
    verified: true,
    featured: true,
    rating: 4.7,
    reviewCount: 234,
  },
  {
    id: 'prisma',
    name: 'Prisma',
    source: 'npm',
    type: 'tool',
    url: 'https://www.npmjs.com/package/prisma',
    downloads: 3000000,
    tags: ['database', 'orm'],
    categories: ['database'],
    compatibleAgents: ['cursor', 'windsurf'],
    verified: true,
    featured: true,
    rating: 4.8,
    reviewCount: 892,
  },
  {
    id: 'playwright',
    name: 'Playwright',
    source: 'npm',
    type: 'tool',
    url: 'https://www.npmjs.com/package/playwright',
    downloads: 15000000,
    tags: ['testing', 'e2e'],
    categories: ['coding'],
    compatibleAgents: ['cursor', 'windsurf', 'claude_code'],
    verified: true,
    featured: true,
    rating: 4.9,
    reviewCount: 2341,
  },
  {
    id: 'axios',
    name: 'Axios',
    source: 'npm',
    type: 'tool',
    url: 'https://www.npmjs.com/package/axios',
    downloads: 50000000,
    tags: ['http', 'api'],
    categories: ['coding'],
    compatibleAgents: ['cursor', 'windsurf', 'claude_code'],
    verified: true,
    featured: false,
    rating: 4.8,
    reviewCount: 3456,
  },
  {
    id: 'zod',
    name: 'Zod',
    source: 'npm',
    type: 'tool',
    url: 'https://www.npmjs.com/package/zod',
    downloads: 15000000,
    tags: ['validation', 'typescript'],
    categories: ['coding'],
    compatibleAgents: ['cursor', 'windsurf'],
    verified: true,
    featured: false,
    rating: 4.9,
    reviewCount: 1876,
  },
  {
    id: 'vitest',
    name: 'Vitest',
    source: 'npm',
    type: 'tool',
    url: 'https://www.npmjs.com/package/vitest',
    downloads: 8000000,
    tags: ['testing', 'vite'],
    categories: ['coding'],
    compatibleAgents: ['cursor', 'windsurf', 'claude_code'],
    verified: true,
    featured: false,
    rating: 4.8,
    reviewCount: 1234,
  },
  {
    id: 'tailwindcss',
    name: 'Tailwind CSS',
    source: 'npm',
    type: 'tool',
    url: 'https://www.npmjs.com/package/tailwindcss',
    downloads: 8000000,
    tags: ['css', 'ui'],
    categories: ['creative'],
    compatibleAgents: ['cursor', 'windsurf', 'manus'],
    verified: true,
    featured: true,
    rating: 4.9,
    reviewCount: 4523,
  },
  {
    id: 'supabase',
    name: 'Supabase',
    source: 'npm',
    type: 'tool',
    url: 'https://www.npmjs.com/package/@supabase/supabase-js',
    downloads: 500000,
    tags: ['database', 'backend'],
    categories: ['database'],
    compatibleAgents: ['cursor', 'windsurf'],
    verified: true,
    featured: true,
    rating: 4.7,
    reviewCount: 567,
  },
  // Python Packages
  {
    id: 'fastapi',
    name: 'FastAPI',
    source: 'pypi',
    type: 'tool',
    url: 'https://pypi.org/project/fastapi/',
    downloads: 50000000,
    tags: ['api', 'web'],
    categories: ['coding'],
    compatibleAgents: ['openhands', 'claude_code'],
    verified: true,
    featured: true,
    rating: 4.8,
    reviewCount: 3204,
  },
  {
    id: 'pydantic',
    name: 'Pydantic',
    source: 'pypi',
    type: 'tool',
    url: 'https://pypi.org/project/pydantic/',
    downloads: 100000000,
    tags: ['validation', 'typing'],
    categories: ['coding'],
    compatibleAgents: ['openhands', 'claude_code'],
    verified: true,
    featured: false,
    rating: 4.9,
    reviewCount: 1567,
  },
  {
    id: 'pandas',
    name: 'Pandas',
    source: 'pypi',
    type: 'tool',
    url: 'https://pypi.org/project/pandas/',
    downloads: 150000000,
    tags: ['data', 'analysis'],
    categories: ['ai_ml'],
    compatibleAgents: ['openhands', 'claude_code'],
    verified: true,
    featured: true,
    rating: 4.9,
    reviewCount: 4567,
  },
  {
    id: 'numpy',
    name: 'NumPy',
    source: 'pypi',
    type: 'tool',
    url: 'https://pypi.org/project/numpy/',
    downloads: 200000000,
    tags: ['math', 'science'],
    categories: ['ai_ml'],
    compatibleAgents: ['openhands', 'claude_code'],
    verified: true,
    featured: false,
    rating: 4.9,
    reviewCount: 5678,
  },
  {
    id: 'requests',
    name: 'Requests',
    source: 'pypi',
    type: 'tool',
    url: 'https://pypi.org/project/requests/',
    downloads: 1000000000,
    tags: ['http', 'api'],
    categories: ['coding'],
    compatibleAgents: ['openhands', 'claude_code'],
    verified: true,
    featured: false,
    rating: 4.8,
    reviewCount: 8901,
  },
  // HuggingFace
  {
    id: 'transformers-hf',
    name: 'Transformers',
    source: 'huggingface',
    type: 'tool',
    url: 'https://huggingface.co/docs/transformers',
    tags: ['ml', 'nlp'],
    categories: ['ai_ml'],
    compatibleAgents: ['openhands', 'claude_code'],
    verified: true,
    featured: true,
    rating: 4.9,
    reviewCount: 4521,
  },
  {
    id: 'gradio-hf',
    name: 'Gradio',
    source: 'huggingface',
    type: 'tool',
    url: 'https://huggingface.co/spaces?sort=likes',
    tags: ['ui', 'web'],
    categories: ['creative'],
    compatibleAgents: ['openhands', 'claude_code'],
    verified: true,
    featured: true,
    rating: 4.7,
    reviewCount: 1876,
  },
  // GitHub Repos
  {
    id: 'awesome-agent-skills',
    name: 'Awesome Agent Skills',
    source: 'github',
    type: 'skill',
    url: 'https://github.com/VoltAgent/awesome-agent-skills',
    stars: 5000,
    tags: ['skills', 'collection'],
    categories: ['coding'],
    compatibleAgents: ['claude_code', 'cursor', 'openhands'],
    verified: true,
    featured: true,
    rating: 4.8,
    reviewCount: 423,
  },
  {
    id: 'react-agent-tools',
    name: 'React Agent Tools',
    source: 'github',
    type: 'tool',
    url: 'https://github.com/agent-repos/react',
    stars: 1800,
    tags: ['react', 'frontend'],
    categories: ['coding'],
    compatibleAgents: ['cursor', 'windsurf'],
    verified: true,
    featured: false,
    rating: 4.5,
    reviewCount: 156,
  },
  {
    id: 'sequential-thinking-mcp',
    name: 'Sequential Thinking MCP',
    source: 'mcp',
    type: 'skill',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
    stars: 410,
    tags: ['thinking', 'reasoning'],
    categories: ['ai_ml'],
    compatibleAgents: ['claude_code', 'cursor', 'openhands'],
    verified: true,
    featured: true,
    rating: 4.7,
    reviewCount: 234,
  },
  {
    id: 'kubernetes-mcp',
    name: 'Kubernetes MCP Server',
    source: 'mcp',
    type: 'tool',
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/kubernetes',
    stars: 350,
    tags: ['kubernetes', 'k8s'],
    categories: ['security'],
    compatibleAgents: ['claude_code', 'openhands'],
    verified: true,
    featured: false,
    rating: 4.6,
    reviewCount: 123,
  },
];

// Reviews simulados
const REVIEWS_DB = new Map();

// Categorías
const CATEGORIES = [
  {
    id: 'coding',
    name: 'Coding & Development',
    description: 'Code generation, refactoring, debugging',
    icon: '💻',
    color: '#3B82F6',
  },
  {
    id: 'research',
    name: 'Research & Analysis',
    description: 'Web search, data analysis',
    icon: '🔍',
    color: '#8B5CF6',
  },
  {
    id: 'creative',
    name: 'Creative & Design',
    description: 'Image generation, writing, creative tools',
    icon: '🎨',
    color: '#EC4899',
  },
  {
    id: 'productivity',
    name: 'Productivity',
    description: 'Automation, task management',
    icon: '⚡',
    color: '#F59E0B',
  },
  {
    id: 'security',
    name: 'Security & DevOps',
    description: 'Security scanning, deployment',
    icon: '🔒',
    color: '#EF4444',
  },
  {
    id: 'ai_ml',
    name: 'AI & Machine Learning',
    description: 'ML models, prompts, fine-tuning',
    icon: '🧠',
    color: '#10B981',
  },
  {
    id: 'communication',
    name: 'Communication',
    description: 'Slack, Discord, email',
    icon: '💬',
    color: '#6366F1',
  },
  {
    id: 'database',
    name: 'Database & Storage',
    description: 'Database tools, file storage',
    icon: '🗄️',
    color: '#14B8A6',
  },
];

/**
 * GET /api/marketplace/skills
 * Lista de skills con filtros
 */
router.get('/skills', (req, res) => {
  const {
    source,
    type,
    category,
    agent,
    minRating,
    verifiedOnly,
    featuredOnly,
    sortBy = 'rating',
    limit = 50,
    offset = 0,
  } = req.query;

  let skills = [...SKILLS_REGISTRY];

  // Filtros
  if (source) {
    skills = skills.filter((s) => s.source === source);
  }
  if (type) {
    skills = skills.filter((s) => s.type === type);
  }
  if (category) {
    skills = skills.filter((s) => s.categories?.includes(category));
  }
  if (agent) {
    skills = skills.filter((s) => s.compatibleAgents?.includes(agent));
  }
  if (minRating) {
    skills = skills.filter((s) => s.rating >= parseFloat(minRating));
  }
  if (verifiedOnly === 'true') {
    skills = skills.filter((s) => s.verified);
  }
  if (featuredOnly === 'true') {
    skills = skills.filter((s) => s.featured);
  }

  // Ordenamiento
  switch (sortBy) {
    case 'downloads':
      skills.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
      break;
    case 'stars':
      skills.sort((a, b) => (b.stars || 0) - (a.stars || 0));
      break;
    case 'newest':
      skills.reverse(); // Simulado
      break;
    case 'name':
      skills.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'rating':
    default:
      skills.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  }

  const total = skills.length;
  skills = skills.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

  res.json({
    skills,
    total,
    limit: parseInt(limit),
    offset: parseInt(offset),
  });
});

/**
 * GET /api/marketplace/skills/:id
 * Detalles de un skill
 */
router.get('/skills/:id', (req, res) => {
  const { id } = req.params;
  const skill = SKILLS_REGISTRY.find((s) => s.id === id);

  if (!skill) {
    return res.status(404).json({ error: 'Skill not found' });
  }

  // Obtener reviews del skill
  const reviews = REVIEWS_DB.get(id) || [];

  res.json({
    ...skill,
    reviews,
  });
});

/**
 * GET /api/marketplace/categories
 * Lista de categorías
 */
router.get('/categories', (req, res) => {
  const categoriesWithCount = CATEGORIES.map((cat) => ({
    ...cat,
    skillCount: SKILLS_REGISTRY.filter((s) => s.categories?.includes(cat.id)).length,
    featuredSkills: SKILLS_REGISTRY.filter((s) => s.categories?.includes(cat.id) && s.featured)
      .slice(0, 4)
      .map((s) => s.id),
  }));

  res.json(categoriesWithCount);
});

/**
 * GET /api/marketplace/featured
 * Skills destacados
 */
router.get('/featured', (req, res) => {
  const featured = SKILLS_REGISTRY.filter((s) => s.featured);
  res.json(featured);
});

/**
 * GET /api/marketplace/agents
 * Agentes compatibles
 */
router.get('/agents', (req, res) => {
  const agents = [
    {
      id: 'claude_code',
      name: 'Claude Code',
      icon: '🤖',
      website: 'https://docs.anthropic.com/en/docs/claude-code',
      skillCount: SKILLS_REGISTRY.filter((s) => s.compatibleAgents?.includes('claude_code')).length,
    },
    {
      id: 'cursor',
      name: 'Cursor',
      icon: '👨‍💻',
      website: 'https://cursor.sh',
      skillCount: SKILLS_REGISTRY.filter((s) => s.compatibleAgents?.includes('cursor')).length,
    },
    {
      id: 'windsurf',
      name: 'Windsurf',
      icon: '🌊',
      website: 'https://codeium.com/windsurf',
      skillCount: SKILLS_REGISTRY.filter((s) => s.compatibleAgents?.includes('windsurf')).length,
    },
    {
      id: 'manus',
      name: 'Manus',
      icon: '📖',
      website: 'https://manus.im',
      skillCount: SKILLS_REGISTRY.filter((s) => s.compatibleAgents?.includes('manus')).length,
    },
    {
      id: 'openhands',
      name: 'OpenHands',
      icon: '🤝',
      website: 'https://www.all-hands.dev',
      skillCount: SKILLS_REGISTRY.filter((s) => s.compatibleAgents?.includes('openhands')).length,
    },
    {
      id: 'continue',
      name: 'Continue',
      icon: '▶️',
      website: 'https://continue.dev',
      skillCount: SKILLS_REGISTRY.filter((s) => s.compatibleAgents?.includes('continue')).length,
    },
    {
      id: 'replit_agent',
      name: 'Replit Agent',
      icon: '🔄',
      website: 'https://replit.com',
      skillCount: SKILLS_REGISTRY.filter((s) => s.compatibleAgents?.includes('replit_agent'))
        .length,
    },
    {
      id: 'copilot',
      name: 'GitHub Copilot',
      icon: '💻',
      website: 'https://github.com/features/copilot',
      skillCount: SKILLS_REGISTRY.filter((s) => s.compatibleAgents?.includes('copilot')).length,
    },
  ];
  res.json(agents);
});

/**
 * POST /api/marketplace/skills/:id/rate
 * Calificar un skill
 */
router.post('/skills/:id/rate', (req, res) => {
  const { id } = req.params;
  const { score, comment, author } = req.body;

  if (!score || score < 1 || score > 5) {
    return res.status(400).json({ error: 'Score must be between 1 and 5' });
  }

  const skill = SKILLS_REGISTRY.find((s) => s.id === id);
  if (!skill) {
    return res.status(404).json({ error: 'Skill not found' });
  }

  // Crear review
  const reviewId = `review-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const review = {
    id: reviewId,
    score,
    comment: comment || '',
    author: author || 'Anonymous',
    createdAt: new Date().toISOString(),
    helpful: 0,
    notHelpful: 0,
  };

  // Guardar review
  if (!REVIEWS_DB.has(id)) {
    REVIEWS_DB.set(id, []);
  }
  REVIEWS_DB.get(id).push(review);

  // Actualizar rating promedio
  const reviews = REVIEWS_DB.get(id);
  const avgRating = reviews.reduce((sum, r) => sum + r.score, 0) / reviews.length;
  skill.rating = Math.round(avgRating * 10) / 10;
  skill.reviewCount = reviews.length;

  res.json({ success: true, review });
});

/**
 * POST /api/marketplace/skills/:id/install
 * Registrar instalación
 */
router.post('/skills/:id/install', (req, res) => {
  const { id } = req.params;
  const { agent } = req.body;

  const skill = SKILLS_REGISTRY.find((s) => s.id === id);
  if (!skill) {
    return res.status(404).json({ error: 'Skill not found' });
  }

  // Simular registro de instalación
  logger.info(`[Marketplace] Skill ${id} installed for agent ${agent}`);

  res.json({
    success: true,
    skillId: id,
    agent,
    installedAt: new Date().toISOString(),
  });
});

/**
 * GET /api/marketplace/stats
 * Estadísticas del marketplace
 */
router.get('/stats', (req, res) => {
  const totalDownloads = SKILLS_REGISTRY.reduce((sum, s) => sum + (s.downloads || 0), 0);
  const avgRating =
    SKILLS_REGISTRY.reduce((sum, s) => sum + (s.rating || 0), 0) / SKILLS_REGISTRY.length;

  res.json({
    totalSkills: SKILLS_REGISTRY.length,
    totalCategories: CATEGORIES.length,
    totalDownloads,
    averageRating: Math.round(avgRating * 10) / 10,
    topSources: [
      { source: 'mcp', count: SKILLS_REGISTRY.filter((s) => s.source === 'mcp').length },
      { source: 'npm', count: SKILLS_REGISTRY.filter((s) => s.source === 'npm').length },
      { source: 'pypi', count: SKILLS_REGISTRY.filter((s) => s.source === 'pypi').length },
      { source: 'github', count: SKILLS_REGISTRY.filter((s) => s.source === 'github').length },
      {
        source: 'huggingface',
        count: SKILLS_REGISTRY.filter((s) => s.source === 'huggingface').length,
      },
    ],
    topAgents: [
      {
        agent: 'claude_code',
        count: SKILLS_REGISTRY.filter((s) => s.compatibleAgents?.includes('claude_code')).length,
      },
      {
        agent: 'cursor',
        count: SKILLS_REGISTRY.filter((s) => s.compatibleAgents?.includes('cursor')).length,
      },
      {
        agent: 'openhands',
        count: SKILLS_REGISTRY.filter((s) => s.compatibleAgents?.includes('openhands')).length,
      },
    ],
  });
});

/**
 * GET /api/marketplace/search
 * Búsqueda en el marketplace
 */
router.get('/search', (req, res) => {
  const { q, limit = 20 } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Query is required' });
  }

  const query = q.toLowerCase();
  const results = SKILLS_REGISTRY.filter(
    (s) =>
      s.name.toLowerCase().includes(query) ||
      s.tags?.some((t) => t.toLowerCase().includes(query)) ||
      s.categories?.some((c) => c.toLowerCase().includes(query)),
  ).slice(0, parseInt(limit));

  res.json({ results, total: results.length });
});

module.exports = router;
