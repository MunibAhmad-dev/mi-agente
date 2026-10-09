const { logger } = require('@librechat/data-schemas');
const { runToolCallLoop } = require('./toolCallLoop');
const { buildArchitectTools } = require('./architectTools');
const { architectPlanSchema, MAX_AGENTS } = require('./schemas');
const { analyzeComplexity, buildTierGuidance } = require('./complexity');

const SYSTEM_PROMPT = `Eres el "Agent Architect": decides cómo descomponer una tarea del \
usuario en uno o más agentes de IA dentro de LibreChat.

Reglas:
- Usa el MENOR número de agentes que resuelva la tarea bien. No crees agentes \
de más "porque sí". Un solo agente bien instruido suele bastar para tareas simples.
- Máximo ${MAX_AGENTS} agentes.
- Antes de decidir qué tools necesita cada agente, llama list_available_tools \
para saber qué ya existe.
- Si una capacidad que necesitas no está disponible, llama \
search_skill_marketplace para ver si se puede instalar; si no encuentras nada, \
inclúyela igual en missing_capabilities (en texto libre) para que el usuario lo sepa.
- Elige la topología más simple que funcione:
  - "single": una sola tarea, un agente.
  - "chain": pasos secuenciales donde la salida de uno alimenta al siguiente.
  - "handoff": un agente principal que puede transferir la conversación a \
especialistas según lo que pida el usuario.
  - "subagents": un agente coordinador que delega sub-tareas y junta resultados.
- Cada agente necesita instrucciones (system prompt) claras y específicas, no genéricas.
- Cuando termines de investigar, llama submit_plan EXACTAMENTE UNA VEZ con el plan completo.`;

/**
 * @param {object} params
 * @param {string} params.task - user's task description, in their own words
 * @param {() => Promise<Array<{name: string}>>} params.listAvailableTools
 * @param {(query: string) => Promise<Array<object>>} [params.searchSkillCatalog]
 * @param {string} [params.model]
 * @param {object} [params.complexity] - si se pasa, se usa en lugar de analizar
 *   la tarea (para pruebas o UI que ya conozca el tier).
 * @returns {Promise<{ plan: object, transcriptTurns: number, complexity: object }>}
 */
async function generatePlan({
  task,
  listAvailableTools,
  searchSkillCatalog,
  model,
  complexity: complexityOverride,
}) {
  // FASE 2: escalado dinámico — analiza la complejidad real de la tarea y
  // dimensiona la guía del plan en consecuencia.
  const complexity = complexityOverride ?? analyzeComplexity(task);
  const system = `${SYSTEM_PROMPT}\n\n${buildTierGuidance(complexity)}`;

  const tools = buildArchitectTools();

  const executeTool = async (name, input) => {
    if (name === 'list_available_tools') {
      const all = await listAvailableTools();
      const filtered = input?.category
        ? all.filter((t) => (t.category || '').toLowerCase() === input.category.toLowerCase())
        : all;
      return filtered.map((t) => ({ name: t.name, description: t.description ?? '' }));
    }
    if (name === 'search_skill_marketplace') {
      if (!searchSkillCatalog) {
        return { results: [], note: 'skill marketplace search not available' };
      }
      const results = await searchSkillCatalog(input?.query ?? '');
      return { results };
    }
    return { error: `Unknown tool: ${name}` };
  };

  const runOnce = async () =>
    runToolCallLoop({
      system,
      messages: [{ role: 'user', content: `Tarea del usuario:\n${task}` }],
      tools,
      executeTool,
      model,
      isTerminal: (name) => name === 'submit_plan',
    });

  let result = await runOnce();

  if (!result.terminalToolCall) {
    logger.warn(
      '[AgentArchitect] planner did not call submit_plan on first attempt, retrying once',
    );
    result = await runOnce();
  }

  if (!result.terminalToolCall) {
    throw new Error(
      'El planificador no pudo generar un plan válido (no invocó submit_plan tras dos intentos).',
    );
  }

  const parsed = architectPlanSchema.safeParse(result.terminalToolCall.input);
  if (!parsed.success) {
    logger.error('[AgentArchitect] plan failed schema validation', parsed.error.flatten());
    throw new Error(`Plan inválido: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }

  return { plan: parsed.data, transcriptTurns: result.turns, complexity };
}

module.exports = { generatePlan, SYSTEM_PROMPT };
