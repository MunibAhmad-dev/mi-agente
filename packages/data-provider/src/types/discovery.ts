/**
 * Discovery Types
 * ===============
 * Tipos para el sistema de búsqueda universal
 */

export type DiscoverySource = 'github' | 'huggingface' | 'mcp' | 'npm' | 'pypi';

export type PluginType = 'skill' | 'plugin' | 'tool' | 'dataset' | 'model' | 'agent';

export interface DiscoverySearchResult {
  id: string;
  name: string;
  description: string;
  source: DiscoverySource;
  type: PluginType;
  url: string;
  stars?: number;
  likes?: number;
  downloads?: number;
  author?: string;
  tags: string[];
  installationCommand?: string;
  compatibleAgents: string[];
  score: number;
  lastUpdated?: string;
}

export interface DiscoverySearchRequest {
  query: string;
  sources?: DiscoverySource[];
  agents?: string[];
  limit?: number;
  includeInstallCommand?: boolean;
}

export interface DiscoverySearchResponse {
  results: DiscoverySearchResult[];
  totalFound: number;
  sourcesSearched: DiscoverySource[];
  queryTimeMs: number;
  cacheHit: boolean;
}

export interface DiscoveryFeaturedItem {
  id: string;
  name: string;
  description: string;
  source: DiscoverySource;
  type: PluginType;
  url: string;
  stars: number;
  category: string;
  icon: string;
}

export interface DiscoveryCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  count: number;
}

export interface DiscoveryAgent {
  id: string;
  name: string;
  icon: string;
  website: string;
  supportedTypes: PluginType[];
  installCommand?: string;
}

// Agentes compatibles
export const COMPATIBLE_AGENTS: DiscoveryAgent[] = [
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
    icon: '� Cursor',
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

// Categorías de plugins
export const PLUGIN_CATEGORIES: DiscoveryCategory[] = [
  { id: 'coding', name: 'Coding & Development', description: 'Code generation, refactoring, debugging', icon: '💻', count: 0 },
  { id: 'research', name: 'Research & Analysis', description: 'Web search, data analysis, documentation', icon: '🔍', count: 0 },
  { id: 'creative', name: 'Creative & Design', description: 'Image generation, writing, creative tools', icon: '🎨', count: 0 },
  { id: 'productivity', name: 'Productivity', description: 'Automation, task management, integrations', icon: '⚡', count: 0 },
  { id: 'security', name: 'Security & DevOps', description: 'Security scanning, deployment, monitoring', icon: '🔒', count: 0 },
  { id: 'ai_ml', name: 'AI & Machine Learning', description: 'ML models, prompts, fine-tuning', icon: '🧠', count: 0 },
  { id: 'communication', name: 'Communication', description: 'Slack, Discord, email integrations', icon: '💬', count: 0 },
  { id: 'database', name: 'Database & Storage', description: 'Database tools, file storage, backups', icon: '🗄️', count: 0 },
];

// Repositorios destacados (fallback cuando no hay conexión)
export const FEATURED_PLUGINS: DiscoveryFeaturedItem[] = [
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
