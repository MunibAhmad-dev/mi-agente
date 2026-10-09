const { logger } = require('@librechat/data-schemas');

const PROVIDER = process.env.AGENT_ARCHITECT_PROVIDER || 'anthropic';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL =
  process.env.AGENT_ARCHITECT_MODEL || (PROVIDER === 'ollama' ? 'qwen3:0.6b' : 'claude-sonnet-4-6');

/**
 * Minimal server-side client for the Agent Architect.
 *
 * Provider-agnostic (FASE 2): por defecto usa la API de Anthropic (Messages),
 * pero si `AGENT_ARCHITECT_PROVIDER=ollama` usa un endpoint OpenAI-compatible
 * local (Ollama) traduciendo mensajes/tools/respuestas. Esto permite ejecutar
 * el planner de punta a punta con un LLM local sin API key externa.
 *
 * El contrato de salida SIEMPRE es formato Anthropic (`content: [...]` con
 * bloques `text` / `tool_use`), de modo que `toolCallLoop.js` no cambia.
 *
 * @param {object} params
 * @param {Array<{role: 'user'|'assistant', content: any}>} params.messages
 * @param {string} [params.system]
 * @param {Array<object>} [params.tools] - definiciones de tools (JSON Schema `input_schema`)
 * @param {object|string} [params.tool_choice]
 * @param {number} [params.max_tokens]
 * @param {string} [params.model]
 * @returns {Promise<object>} respuesta en formato Anthropic
 */
async function createMessage({
  messages,
  system,
  tools,
  tool_choice,
  max_tokens = 2000,
  model = DEFAULT_MODEL,
}) {
  if (PROVIDER === 'ollama') {
    return createMessageOllama({ messages, system, tools, tool_choice, max_tokens, model });
  }
  return createMessageAnthropic({ messages, system, tools, tool_choice, max_tokens, model });
}

/* ───────────────────────── Anthropic (default) ───────────────────────── */

async function createMessageAnthropic({ messages, system, tools, tool_choice, max_tokens, model }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      '[AgentArchitect] ANTHROPIC_API_KEY is not configured; the Agent Architect ' +
        'planner requires it to call the Messages API (o configura ' +
        'AGENT_ARCHITECT_PROVIDER=ollama para usar un LLM local).',
    );
  }

  const body = {
    model,
    max_tokens,
    messages,
    ...(system ? { system } : {}),
    ...(tools?.length ? { tools } : {}),
    ...(tool_choice ? { tool_choice } : {}),
  };

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '<unreadable body>');
    logger.error(`[AgentArchitect] Anthropic API error ${response.status}: ${errText}`);
    throw new Error(`Anthropic API error ${response.status}: ${errText}`);
  }

  return response.json();
}

/* ───────────────────────── Ollama (OpenAI-compatible) ─────────────────── */

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';

/** Traduce mensajes formato Anthropic → OpenAI (conversación para chat.completions). */
function toOpenAiMessages({ system, messages }) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });

  for (const m of messages) {
    if (m.role === 'assistant') {
      const blocks = Array.isArray(m.content) ? m.content : [];
      const text = blocks
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
      const toolUses = blocks.filter((b) => b.type === 'tool_use');
      const msg = { role: 'assistant', content: text || null };
      if (toolUses.length > 0) {
        msg.tool_calls = toolUses.map((b) => ({
          id: b.id,
          type: 'function',
          function: {
            name: b.name,
            arguments: typeof b.input === 'string' ? b.input : JSON.stringify(b.input ?? {}),
          },
        }));
      }
      out.push(msg);
    } else {
      // role user
      const content = Array.isArray(m.content)
        ? m.content
        : [{ type: 'text', text: String(m.content ?? '') }];
      const text = content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      const toolResults = content.filter((b) => b.type === 'tool_result');

      if (toolResults.length > 0) {
        for (const tr of toolResults) {
          out.push({
            role: 'tool',
            tool_call_id: tr.tool_use_id,
            content:
              typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content ?? null),
          });
        }
      }
      if (text.trim()) out.push({ role: 'user', content: text });
    }
  }
  return out;
}

function toOpenAiTools(tools = []) {
  return tools
    .filter((t) => t && t.name)
    .map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description || '',
        parameters: t.input_schema || { type: 'object', properties: {} },
      },
    }));
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

/** Traduce respuesta OpenAI → formato Anthropic (`content` con bloques). */
function fromOpenAiResponse(json) {
  const choice = json?.choices?.[0];
  const msg = choice?.message ?? {};
  const blocks = [];
  if (typeof msg.content === 'string' && msg.content.trim()) {
    blocks.push({ type: 'text', text: msg.content });
  }
  for (const tc of msg.tool_calls ?? []) {
    blocks.push({
      type: 'tool_use',
      id: tc.id,
      name: tc.function?.name,
      input: safeJsonParse(tc.function?.arguments),
    });
  }
  return { content: blocks };
}

async function createMessageOllama({ messages, system, tools, tool_choice, max_tokens, model }) {
  const url = `${OLLAMA_BASE_URL}/v1/chat/completions`;
  const body = {
    model,
    messages: toOpenAiMessages({ system, messages }),
    ...(tools?.length ? { tools: toOpenAiTools(tools) } : {}),
    ...(tool_choice ? { tool_choice } : {}),
    max_tokens,
    stream: false,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '<unreadable body>');
    logger.error(`[AgentArchitect] Ollama API error ${response.status}: ${errText}`);
    throw new Error(`Ollama API error ${response.status}: ${errText}`);
  }

  const json = await response.json();
  return fromOpenAiResponse(json);
}

module.exports = { createMessage, DEFAULT_MODEL, PROVIDER };
