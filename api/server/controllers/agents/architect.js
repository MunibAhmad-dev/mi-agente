const { logger } = require('@librechat/data-schemas');
const { getCachedTools } = require('~/server/services/Config');
const v1 = require('./v1');
const {
  generatePlan,
  resolveMissingCapabilities,
  discoverCapabilitiesForPlan,
  mapRoleToCapabilities,
  fetchOllamaModels,
  buildModelRegistryFromOllama,
  routePlanToModels,
  deepResearch,
  MAX_AGENTS,
} = require('~/server/services/AgentArchitect');

const DEFAULT_PROVIDER = process.env.AGENT_ARCHITECT_PROVIDER || 'anthropic';
const DEFAULT_MODEL =
  process.env.AGENT_ARCHITECT_MODEL ||
  (DEFAULT_PROVIDER === 'ollama' ? 'qwen3:0.6b' : 'claude-sonnet-4-6');

/**
 * Adapts `getCachedTools()` (a map keyed by tool name) into the flat list
 * shape the Architect's tools expect.
 */
async function listAvailableTools() {
  const cached = await getCachedTools().catch(() => ({}));
  return Object.entries(cached ?? {}).map(([name, def]) => ({
    name,
    description: def?.description,
    category: def?.category,
  }));
}

/**
 * Best-effort skill catalog search. Wired loosely on purpose: this repo's
 * GitHub-sync marketplace (`services/Skills/sync.js`) is oriented around an
 * admin-authenticated sync run, not an ad-hoc "search for capability X" call.
 * Until that's exposed as a proper search function, we fall back to matching
 * against the same cached tools list, so at minimum "capability already
 * installed under a different phrasing" still resolves. Replace this with a
 * real marketplace search once one exists.
 * @see docs/agent-architect/DESIGN.md section 7
 */
async function searchSkillCatalog(query) {
  const tools = await listAvailableTools();
  const q = query.toLowerCase();
  return tools
    .filter(
      (t) => t.name.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q),
    )
    .map((t) => ({ name: t.name, source: 'workspace_tools' }));
}

/**
 * POST /agents/architect/plan
 * Body: { task: string }
 * Does NOT create anything — returns a proposed plan + capability resolution
 * for the client to render (auto mode: apply immediately; manual mode: edit
 * then confirm).
 */
const planTask = async (req, res) => {
  try {
    const { task } = req.body ?? {};
    if (!task || typeof task !== 'string' || task.trim().length === 0) {
      return res.status(400).json({ error: 'task is required' });
    }

    const { plan, complexity } = await generatePlan({
      task,
      listAvailableTools,
      searchSkillCatalog,
      model: DEFAULT_MODEL,
    });

    const resolution = await resolveMissingCapabilities({
      missingCapabilities: plan.missing_capabilities,
      listAvailableTools,
      searchSkillCatalog,
    });

    // FASE 3+4: discovery de capacidades por agente + routing de modelos
    // (aditivo, no cambia el contrato).
    const discovery = await discoverCapabilitiesForPlan({
      plan,
      listAvailableTools,
      searchSkillCatalog,
      routeModels: async (agents) => {
        const { report: routing } = await routeModelsForRequest({ agents });
        return routing;
      },
    }).catch((err) => {
      logger.warn('[AgentArchitect] capability discovery failed (non-blocking)', err.message);
      return null;
    });

    return res.json({ plan, resolution, complexity, discovery });
  } catch (err) {
    logger.error('[AgentArchitect] planTask failed', err);
    return res.status(500).json({ error: err.message || 'Failed to generate plan' });
  }
};

/**
 * Invokes the existing, security-reviewed `createAgent` / `updateAgent`
 * Express handlers directly with a synthetic req/res, instead of
 * re-implementing agent persistence + ACL logic here. This guarantees the
 * plan goes through exactly the same permission checks, tool-authorization
 * filtering, and validation as manually creating an agent in the UI.
 */
function callHandlerInternally(handler, req, body) {
  return new Promise((resolve, reject) => {
    const fakeReq = Object.assign(Object.create(Object.getPrototypeOf(req)), req, { body });
    const fakeRes = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (this.statusCode >= 400) {
          reject(
            Object.assign(new Error(payload?.error || 'Internal agent operation failed'), {
              statusCode: this.statusCode,
              payload,
            }),
          );
        } else {
          resolve(payload);
        }
      },
    };
    Promise.resolve(handler(fakeReq, fakeRes)).catch(reject);
  });
}

/**
 * POST /agents/architect/apply
 * Body: { plan: ArchitectPlan, confirmed_installs?: string[] }
 *
 * Two-phase creation:
 *  1. Create every agent from the plan (no cross-references yet) via the
 *     real `createAgent` handler, so each gets its permanent id/ACL.
 *  2. Patch in edges/subagents/agent_ids that reference sibling agents, now
 *     that real ids exist, via the real `updateAgent` handler.
 */
const applyPlan = async (req, res) => {
  try {
    const { plan, confirmed_installs: confirmedInstalls = [] } = req.body ?? {};
    if (!plan || !Array.isArray(plan.agents) || plan.agents.length === 0) {
      return res.status(400).json({ error: 'A valid plan with at least one agent is required' });
    }
    if (plan.agents.length > MAX_AGENTS) {
      return res.status(400).json({ error: `Plan exceeds the maximum of ${MAX_AGENTS} agents` });
    }

    // Guardrail: installing a new skill/plugin always requires explicit
    // confirmation from this call's body, even in automatic mode. We don't
    // silently install third-party code.
    const unconfirmed = (plan.missing_capabilities ?? []).filter(
      (cap) => !confirmedInstalls.includes(cap),
    );
    if (unconfirmed.length > 0) {
      return res.status(409).json({
        error: 'Missing capabilities require explicit confirmation before install',
        pending_confirmation: unconfirmed,
      });
    }

    const keyToRealId = {};
    const createdAgents = [];

    // Phase 1: create agents without cross-references.
    for (const agentSpec of plan.agents) {
      const created = await callHandlerInternally(v1.createAgent, req, {
        name: agentSpec.name,
        description: agentSpec.role_description,
        instructions: agentSpec.instructions,
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        tools: agentSpec.tools ?? [],
      });
      keyToRealId[agentSpec.key] = created.id;
      createdAgents.push(created);
    }

    // Phase 2: wire topology now that real ids exist.
    for (const agentSpec of plan.agents) {
      const realId = keyToRealId[agentSpec.key];
      const patch = {};

      if (plan.topology === 'handoff' && agentSpec.handoff_to?.length) {
        patch.edges = agentSpec.handoff_to
          .map((targetKey) => keyToRealId[targetKey])
          .filter(Boolean)
          .map((toId) => ({ from: realId, to: toId }));
      }

      if (plan.topology === 'subagents' && agentSpec.is_root) {
        const childIds = plan.agents
          .filter((a) => a.key !== agentSpec.key)
          .map((a) => keyToRealId[a.key]);
        patch.subagents = { enabled: true, agent_ids: childIds };
      }

      if (plan.topology === 'chain' && agentSpec.is_root) {
        patch.agent_ids = plan.agents
          .filter((a) => a.key !== agentSpec.key)
          .map((a) => keyToRealId[a.key]);
      }

      if (Object.keys(patch).length > 0) {
        await callHandlerInternally(
          (r, s) => v1.updateAgent(Object.assign(r, { params: { id: realId } }), s),
          req,
          patch,
        );
      }
    }

    return res.status(201).json({
      topology: plan.topology,
      agents: createdAgents,
      root_agent_id: keyToRealId[plan.agents.find((a) => a.is_root)?.key ?? plan.agents[0].key],
    });
  } catch (err) {
    logger.error('[AgentArchitect] applyPlan failed', err);
    return res
      .status(err.statusCode || 500)
      .json({ error: err.message || 'Failed to apply plan', ...(err.payload ?? {}) });
  }
};

/**
 * FASE 4: rutea agentes a modelos REALES (Ollama local primero) según sus
 * capacidades. Devuelve el reporte de routing; el fetch de /api/tags hace de
 * health check real (si Ollama lista modelos, responde).
 */
async function routeModelsForRequest({ agents }) {
  const ollamaModels = await fetchOllamaModels();
  const registry = buildModelRegistryFromOllama(ollamaModels);
  const report = routePlanToModels({ agents, registry });
  return { report, registry, ollamaModels };
}

/**
 * POST /agents/architect/discover
 * Body: { plan: ArchitectPlan }
 * FASE 3: Capability Discovery — por cada agente del plan, mapea rol →
 * capacidades → tools/skills/MCP disponibles y asigna el conjunto mínimo sin
 * duplicados (ni en asignación ni en instalaciones sugeridas).
 * FASE 4 (aditivo): incluye `modelRouting` con el modelo real elegido por
 * agente según sus capacidades.
 */
const discoverCapabilities = async (req, res) => {
  try {
    const { plan } = req.body ?? {};
    if (!plan || !Array.isArray(plan?.agents) || plan.agents.length === 0) {
      return res.status(400).json({ error: 'A plan with at least one agent is required' });
    }

    const report = await discoverCapabilitiesForPlan({
      plan,
      listAvailableTools,
      searchSkillCatalog,
      routeModels: async (agents) => {
        const { report: routing } = await routeModelsForRequest({ agents });
        return routing;
      },
    });

    return res.json(report);
  } catch (err) {
    logger.error('[AgentArchitect] discoverCapabilities failed', err);
    return res.status(500).json({ error: err.message || 'Failed to discover capabilities' });
  }
};

/**
 * POST /agents/architect/models
 * Body: { plan: ArchitectPlan }
 * FASE 4: Model Router — por cada agente del plan, elige el modelo real
 * (local Ollama primero) según las capacidades de su rol.
 */
const routePlanModels = async (req, res) => {
  try {
    const { plan } = req.body ?? {};
    if (!plan || !Array.isArray(plan?.agents) || plan.agents.length === 0) {
      return res.status(400).json({ error: 'A plan with at least one agent is required' });
    }

    const agents = plan.agents.map((a) => ({
      key: a.key,
      name: a.name || a.key,
      capabilities: mapRoleToCapabilities({
        role: a.role_description || '',
        instructions: a.instructions || '',
      }),
    }));

    const { report, registry, ollamaModels } = await routeModelsForRequest({ agents });
    return res.json({
      ...report,
      registryStats: registry.getStats(),
      ollamaModels: ollamaModels.map((m) => m.name),
    });
  } catch (err) {
    logger.error('[AgentArchitect] routePlanModels failed', err);
    return res.status(500).json({ error: err.message || 'Failed to route models' });
  }
};

/**
 * POST /agents/architect/research
 * Body: { question: string, maxSubQueries?, maxSources?, maxEvidence? }
 * FASE 6: Deep Research — descompone la pregunta en sub-búsquedas, recolecta
 * fuentes con el motor universal (UniversalSearchService real), verifica
 * factualmente cada sub-consulta y redacta una respuesta con citas [1][2].
 * Es aditivo: no toca el plan ni los agentes.
 */
const deepResearchHandler = async (req, res) => {
  try {
    const { question, maxSubQueries, maxSources, maxEvidence } = req.body ?? {};
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({ error: 'question is required' });
    }
    const report = await deepResearch(question, { maxSubQueries, maxSources, maxEvidence });
    return res.json(report);
  } catch (err) {
    logger.error('[AgentArchitect] deepResearch failed', err);
    return res.status(500).json({ error: err.message || 'Failed to run deep research' });
  }
};

module.exports = {
  planTask,
  applyPlan,
  discoverCapabilities,
  routePlanModels,
  deepResearchHandler,
};
