/**
 * AgentRouting — Model Routing por agente (FASE 23 + FASE 25).
 *
 * `applyAgentRouting(agent, messages, modelsConfig)` se invoca justo después de
 * cargar un agente (primario o subagente). Si el agente tiene `mode === 'auto'`,
 * resuelve el modelo EFECTIVO según la complejidad del último mensaje del usuario
 * y el presupuesto de contexto, y lo aplica al objeto local del agente:
 *
 *   - `agent.model` y `agent.model_parameters.model` (este último es el que usa
 *     realmente el cliente LLM: client.js `this.model = agent.model_parameters.model`).
 *
 * Heurística ligera y honesta (no inventa datos):
 *   - large: texto ≥ 600 caracteres, contiene bloques de código (```), o
 *     palabras clave de razonamiento profundo (refactor/auditoría/debug…).
 *   - medium: texto ≥ 90 caracteres, términos técnicos (código, sql, regex…) o
 *     > 60 palabras.
 *   - small: consultas cortas y simples.
 *
 * PRESUPUESTO DE CONTEXTO (FASE 25):
 *   El historial completo se estima en tokens (≈ caracteres/4). Si el contexto
 *   acumulado supera los umbrales, el tier se escala hacia arriba (una tarea con
 *   mucho contexto necesita un modelo con más ventana de contexto):
 *     context ≥ 8k  → sube un nivel (small→medium, medium→large)
 *     context ≥ 32k → large
 *
 * MÉTRICAS (FASE 25):
 *   Cada resolución auto incrementa contadores persistentes en la preferencia
 *   (total, por tier, fallbacks y último modelo usado). Se exponen vía
 *   GET /api/agents/routing/:id (campo `metrics`).
 *
 * Si el nivel elegido no tiene modelo configurado, o el modelo no existe en el
 * endpoint (isModelValid), se usa el modelo del agente (nunca rompe el flujo).
 * La resolución es por petición; el agente no se guarda, solo las métricas.
 */

const AgentRoutingPreference = require('~/models/AgentRoutingPreference');

const DEFAULTS = { mode: 'manual', tiers: { small: '', medium: '', large: '' } };

/** Umbrales del presupuesto de contexto (en tokens estimados). */
const CONTEXT_ESCALATE = 8000; // sube un nivel desde este contexto
const CONTEXT_FORCE_LARGE = 32000; // fuerza large desde este contexto

/** Estimación de tokens (ligera y documentada como aproximación). */
function estimateTokens(text = '') {
  const t = text || '';
  // ~4 caracteres por token es la regla común; no es exacto por idioma pero es
  // una aproximación honesta para escalar tiers.
  return Math.ceil(t.length / 4);
}

/** Suma los tokens estimados de todos los mensajes del historial. */
function estimateMessagesTokens(messages = []) {
  let total = 0;
  for (const m of messages) {
    if (!m) {
      continue;
    }
    const c = m.content;
    if (typeof c === 'string') {
      total += estimateTokens(c);
    } else if (Array.isArray(c)) {
      for (const p of c) {
        if (p && typeof p.text === 'string') {
          total += estimateTokens(p.text);
        } else if (p && typeof p.content === 'string') {
          total += estimateTokens(p.content);
        }
      }
    } else if (c && typeof c.text === 'string') {
      total += estimateTokens(c.text);
    }
  }
  return total;
}

async function getRouting(agentId) {
  if (!agentId) {
    return null;
  }
  try {
    return await AgentRoutingPreference.findOne({ agentId }).lean();
  } catch (error) {
    console.error('[AgentRouting] error leyendo preferencia', error?.message);
    return null;
  }
}

/** Último texto del usuario (mensajes en formato OpenAI o Responses). */
function lastUserText(messages = []) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (!m || m.role !== 'user') {
      continue;
    }
    const c = m.content;
    if (typeof c === 'string') {
      return c;
    }
    if (Array.isArray(c)) {
      return c
        .filter((p) => p && p.type === 'text')
        .map((p) => p.text || '')
        .join(' ');
    }
    if (c && typeof c.text === 'string') {
      return c.text;
    }
  }
  return '';
}

/** Decide el nivel según complejidad del texto (heurística explícita). */
function pickTier(text = '', contextTokens = 0) {
  const t = (text || '').trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  let tier;
  if (
    t.length >= 600 ||
    t.includes('```') ||
    /refactor(izar)?|analiz(a|ar) el c[oó]digo|debug(uear)?|\bbug\b|explain the code|auditor[ií]a|arquitectura/i.test(
      t,
    )
  ) {
    tier = 'large';
  } else if (
    t.length >= 90 ||
    /\b(c[oó]digo|code|funci[oó]n|function|sql|regex|script|workflow|api)\b/i.test(t) ||
    words > 60
  ) {
    tier = 'medium';
  } else {
    tier = 'small';
  }
  // Presupuesto de contexto: una tarea con mucho historial necesita más ventana.
  const ctx = Number(contextTokens) || 0;
  if (ctx >= CONTEXT_FORCE_LARGE) {
    return 'large';
  }
  if (ctx >= CONTEXT_ESCALATE) {
    if (tier === 'small') {
      return 'medium';
    }
    if (tier === 'medium') {
      return 'large';
    }
  }
  return tier;
}

/**
 * Valida que `model` exista en la lista plana de modelos del endpoint del agente
 * (modelsConfig[provider]). Con proveedores locales (fetch: true) el listado es
 * dinámico; si el tier apunta a un modelo que ya no está instalado, se rechaza
 * para que el runtime nunca devuelva `illegal_model_request`.
 */
function isModelValid(agent, model, modelsConfig) {
  if (!modelsConfig || typeof modelsConfig !== 'object') {
    return true; // Sin config no se puede validar → se permite (comportamiento previo).
  }
  const provider = agent?.provider || agent?.endpoint;
  if (!provider) {
    return true;
  }
  const list = modelsConfig[provider];
  if (!Array.isArray(list) || list.length === 0) {
    return true; // Config desconocida → no bloquear.
  }
  return list.includes(model);
}

/** Incrementa las métricas de la preferencia (llamada a fuego lento, sin await). */
function recordMetric(routing, info) {
  if (!routing || routing.mode !== 'auto') {
    return;
  }
  const metrics = routing.metrics || {};
  const byTier = metrics.byTier || {};
  const next = {
    total: (metrics.total || 0) + 1,
    byTier: { ...byTier, [info.tier || 'unknown']: (byTier[info.tier] || 0) + 1 },
    fallbacks: (metrics.fallbacks || 0) + (info.fallbackUsed ? 1 : 0),
    lastRoutedModel: info.routedModel || null,
    lastTier: info.tier || null,
    lastAt: new Date().toISOString(),
  };
  routing.metrics = next;
  AgentRoutingPreference.updateOne({ agentId: routing.agentId }, { $set: { metrics: next } }).catch(
    (error) => console.error('[AgentRouting] error guardando métricas', error?.message),
  );
}

/**
 * Aplica el routing al agente (mutación local por petición).
 * @param {object} agent — agente cargado (solo se muta el objeto local).
 * @param {Array} [messages] — historial para la heurística de complejidad.
 * @param {object} [modelsConfig] — modelos disponibles por endpoint (getModelsConfig),
 *   usado para validar el modelo del tier y nunca romper el flujo.
 * @returns {Promise<{tier: string, routedModel: string|null, mode: string,
 *   contextTokens?: number, fallbackUsed?: boolean}>} — info de la resolución.
 */
async function applyAgentRouting(agent, messages = [], modelsConfig) {
  const info = { tier: null, routedModel: null, mode: 'manual', fallbackUsed: false };
  if (!agent || !agent.id) {
    return info;
  }
  const routing = await getRouting(agent.id);
  if (!routing || routing.mode !== 'auto') {
    return info;
  }
  info.mode = 'auto';
  // El chat de agentes envía el texto del usuario en `req.body.text` (no siempre
  // como `messages`); se contempla como último recurso para no perder contexto.
  const rawText = typeof messages === 'string' ? messages : '';
  const text = rawText || lastUserText(Array.isArray(messages) ? messages : []);
  const contextTokens = rawText
    ? estimateTokens(rawText)
    : estimateMessagesTokens(Array.isArray(messages) ? messages : []);
  info.contextTokens = contextTokens;
  const tier = pickTier(text, contextTokens);
  const chosen = routing.tiers?.[tier] || '';
  const fallback = agent.model_parameters?.model || agent.model;
  info.tier = tier;
  if (!chosen) {
    info.routedModel = fallback || null;
    info.fallbackUsed = true;
    recordMetric(routing, info);
    return info;
  }
  // Validación contra los modelos reales del endpoint: si el tier no existe,
  // se usa el modelo del agente (el routing nunca rompe el flujo).
  if (!isModelValid(agent, chosen, modelsConfig)) {
    info.routedModel = fallback || null;
    info.fallbackUsed = true;
    recordMetric(routing, info);
    return info;
  }
  info.routedModel = chosen;
  // El cliente LLM usa agent.model_parameters.model (client.js); agent.model es
  // el selector. Se sobreescriben ambos SOLO en este objeto por petición.
  agent.model = chosen;
  if (agent.model_parameters && typeof agent.model_parameters === 'object') {
    agent.model_parameters.model = chosen;
  } else {
    agent.model_parameters = { model: chosen };
  }
  recordMetric(routing, info);
  return info;
}

/**
 * Aplica el routing a un CONFIG ya inicializado (subagentes descubiertos vía
 * `discoverConnectedAgents` → onAgentInitialized). `initializeAgent` clona los
 * model_parameters, así que aquí se muta el config resultante directamente
 * (config.model y config.model_parameters.model) antes de que el runtime lo use.
 */
async function applyAgentRoutingToConfig(config, messages = [], modelsConfig) {
  const info = { tier: null, routedModel: null, mode: 'manual', fallbackUsed: false };
  if (!config || (!config.id && !config.agentId)) {
    return info;
  }
  const agentId = config.id || config.agentId;
  const agentProxy = {
    id: agentId,
    provider: config.provider || config.endpoint,
    model: config.model,
    model_parameters: config.model_parameters || {},
  };
  const res = await applyAgentRouting(agentProxy, messages, modelsConfig);
  if (res.mode === 'auto' && res.routedModel && res.routedModel !== config.model) {
    config.model = res.routedModel;
    if (config.model_parameters && typeof config.model_parameters === 'object') {
      config.model_parameters.model = res.routedModel;
    } else {
      config.model_parameters = { model: res.routedModel };
    }
  }
  return res;
}

module.exports = {
  applyAgentRouting,
  applyAgentRoutingToConfig,
  getRouting,
  pickTier,
  lastUserText,
  estimateTokens,
  estimateMessagesTokens,
  isModelValid,
  CONTEXT_ESCALATE,
  CONTEXT_FORCE_LARGE,
  DEFAULTS,
};
