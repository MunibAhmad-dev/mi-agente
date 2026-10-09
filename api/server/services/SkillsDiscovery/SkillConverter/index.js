/**
 * SkillConverter — Convierte skills de distintos formatos al universal SKILL.md.
 *
 * El formato universal (Agent Skills Open Standard) es:
 *   skill-name/
 *   ├── SKILL.md          # YAML frontmatter + instrucciones markdown
 *   ├── references/       # docs de soporte (carga progresiva)
 *   └── scripts/          # código ejecutable opcional
 *
 * Adapters:
 *   - ClaudeSkillAdapter:  Lee SKILL.md nativo (no-op, ya es universal)
 *   - CopilotAdapter:      Convierte .github/copilot-instructions.md
 *   - CodexAdapter:        Lee .codex/skills/ (mismo formato SKILL.md)
 *   - CursorAdapter:       Convierte .cursorrules → SKILL.md
 *   - MCPToSkillAdapter:   Convierte MCP server definition → wrapper SKILL.md
 *   - UniversalFormatter:  Normaliza metadatos a schema universal
 */

/**
 * Parser YAML minimalista para frontmatter (sin dependencias externas).
 * Soporta: key: value, arrays [a, b], y strings simples.
 * @param {string} text
 * @returns {object}
 */
function parseYAMLFrontmatter(text) {
  const result = {};
  const lines = text.split('\n');
  for (const line of lines) {
    const match = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    // Quitar comillas
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Boolean
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    // Array [a, b, c]
    else if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    }
    result[key] = value;
  }
  return result;
}

/**
 * Serializa un objeto a YAML frontmatter minimalista.
 * @param {object} obj
 * @returns {string}
 */
function stringifyYAMLFrontmatter(obj) {
  const lines = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(', ')}]`);
    } else if (typeof value === 'object') {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join('\n');
}

/**
 * Parsea el frontmatter YAML de un SKILL.md.
 * @param {string} content
 * @returns {{frontmatter: object, body: string}}
 */
function parseSKILLMd(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  const frontmatter = parseYAMLFrontmatter(match[1]);
  return { frontmatter, body: match[2].trim() };
}

/**
 * Construye un SKILL.md a partir de frontmatter y body.
 * @param {object} frontmatter
 * @param {string} body
 * @returns {string}
 */
function buildSKILLMd(frontmatter, body) {
  const fm = stringifyYAMLFrontmatter(frontmatter);
  return `---\n${fm}\n---\n\n${body}`;
}

/**
 * ClaudeSkillAdapter — SKILL.md nativo, no necesita conversión.
 */
const ClaudeSkillAdapter = {
  name: 'claude',
  detect(content) {
    return content.includes('---') && content.includes('name:') && content.includes('description:');
  },
  convert(content, meta = {}) {
    const { frontmatter, body } = parseSKILLMd(content);
    return {
      frontmatter: {
        name: frontmatter.name || meta.name || 'unnamed-skill',
        description: frontmatter.description || meta.description || '',
        trigger: frontmatter.trigger || frontmatter['user-invocable'] || false,
        version: frontmatter.version || '1.0.0',
        compatible_agents: frontmatter.compatible_agents || [
          'claude-code',
          'codex',
          'cursor',
          'opencode',
        ],
        ...meta,
      },
      body,
    };
  },
};

/**
 * CopilotAdapter — Convierte .github/copilot-instructions.md a SKILL.md.
 */
const CopilotAdapter = {
  name: 'copilot',
  detect(content) {
    return content.includes('copilot') || content.includes('github copilot');
  },
  convert(content, meta = {}) {
    return {
      frontmatter: {
        name: meta.name || 'copilot-instructions',
        description: 'GitHub Copilot instructions converted to universal skill format',
        trigger: true,
        version: '1.0.0',
        compatible_agents: ['copilot', 'claude-code', 'codex', 'cursor', 'opencode'],
        source_format: 'copilot-instructions',
      },
      body: `# Copilot Instructions (Converted)\n\n${content}`,
    };
  },
};

/**
 * CodexAdapter — Lee .codex/skills/ (mismo formato SKILL.md).
 */
const CodexAdapter = {
  name: 'codex',
  detect(content) {
    return content.includes('---') && content.includes('name:');
  },
  convert(content, meta = {}) {
    const { frontmatter, body } = parseSKILLMd(content);
    return {
      frontmatter: {
        name: frontmatter.name || meta.name || 'codex-skill',
        description: frontmatter.description || '',
        trigger: frontmatter.trigger || false,
        version: frontmatter.version || '1.0.0',
        compatible_agents: ['codex', 'claude-code', 'cursor', 'opencode'],
        source_format: 'codex',
      },
      body,
    };
  },
};

/**
 * CursorAdapter — Convierte .cursorrules a SKILL.md.
 */
const CursorAdapter = {
  name: 'cursor',
  detect(content) {
    return content.length > 0;
  },
  convert(content, meta = {}) {
    return {
      frontmatter: {
        name: meta.name || 'cursor-rules',
        description: 'Cursor rules converted to universal skill format',
        trigger: true,
        version: '1.0.0',
        compatible_agents: ['cursor', 'claude-code', 'codex', 'opencode'],
        source_format: 'cursorrules',
      },
      body: `# Cursor Rules (Converted)\n\n${content}`,
    };
  },
};

/**
 * MCPToSkillAdapter — Convierte una definición de MCP server a wrapper SKILL.md.
 */
const MCPToSkillAdapter = {
  name: 'mcp',
  detect(server) {
    return server && (server.command || server.url || server.transport);
  },
  convert(server, meta = {}) {
    const name = meta.name || server.name || 'mcp-wrapper';
    const tools = server.tools || server.capabilities?.tools || [];
    const toolList = Array.isArray(tools)
      ? tools.map((t) => `- \`${t.name || t}\`: ${t.description || ''}`).join('\n')
      : 'See MCP server documentation';
    return {
      frontmatter: {
        name,
        description: `MCP server wrapper: ${server.description || name}`,
        trigger: false,
        version: server.version || '1.0.0',
        compatible_agents: ['claude-code', 'codex', 'cursor', 'windsurf'],
        source_format: 'mcp-server',
        mcp_config: {
          command: server.command,
          args: server.args,
          env: server.env,
          url: server.url,
          transport: server.transport || 'stdio',
        },
      },
      body: `# MCP Server Wrapper: ${name}\n\nThis skill wraps an MCP server.\n\n## Available Tools\n\n${toolList}\n\n## Configuration\n\n\`\`\`json\n${JSON.stringify({ mcpServers: { [name]: { command: server.command, args: server.args, env: server.env } } }, null, 2)}\n\`\`\``,
    };
  },
};

/**
 * UniversalFormatter — Normaliza cualquier skill al formato final universal.
 */
const UniversalFormatter = {
  /**
   * @param {object} skill — { frontmatter, body }
   * @returns {{skillMd: string, metadata: object, jsonSchema: object}}
   */
  format(skill) {
    const { frontmatter, body } = skill;
    const skillMd = buildSKILLMd(frontmatter, body);
    const metadata = {
      name: frontmatter.name,
      description: frontmatter.description,
      version: frontmatter.version || '1.0.0',
      compatible_agents: frontmatter.compatible_agents || [],
      trigger: frontmatter.trigger || false,
      source_format: frontmatter.source_format || 'native',
    };
    const jsonSchema = {
      type: 'function',
      function: {
        name: frontmatter.name,
        description: frontmatter.description,
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'Input for the skill' },
          },
          required: ['input'],
        },
      },
    };
    return { skillMd, metadata, jsonSchema };
  },
};

const ADAPTERS = {
  claude: ClaudeSkillAdapter,
  copilot: CopilotAdapter,
  codex: CodexAdapter,
  cursor: CursorAdapter,
  mcp: MCPToSkillAdapter,
};

/**
 * Detecta el formato y convierte al universal.
 * @param {string|object} content — contenido del skill o definición MCP
 * @param {object} [meta]
 * @returns {object} { skillMd, metadata, jsonSchema }
 */
function convert(content, meta = {}) {
  let adapter;
  if (typeof content === 'string') {
    if (ClaudeSkillAdapter.detect(content)) adapter = ClaudeSkillAdapter;
    else if (CodexAdapter.detect(content)) adapter = CodexAdapter;
    else if (CopilotAdapter.detect(content)) adapter = CopilotAdapter;
    else adapter = CursorAdapter;
  } else if (typeof content === 'object') {
    adapter = MCPToSkillAdapter;
  } else {
    throw new Error('Unsupported content type for conversion');
  }
  const skill = adapter.convert(content, meta);
  return UniversalFormatter.format(skill);
}

module.exports = {
  convert,
  parseSKILLMd,
  buildSKILLMd,
  ADAPTERS,
  ClaudeSkillAdapter,
  CopilotAdapter,
  CodexAdapter,
  CursorAdapter,
  MCPToSkillAdapter,
  UniversalFormatter,
};
