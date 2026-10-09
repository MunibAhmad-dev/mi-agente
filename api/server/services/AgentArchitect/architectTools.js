const { submitPlanToolInputSchema } = require('./schemas');

/**
 * Tool definitions exposed to the planner model. Keeping these declarative and
 * separate from execution (see `skillResolver.js` / the controller for the
 * actual `executeTool` implementations) makes it possible to unit test the
 * planner's tool-calling behavior against fakes.
 */
function buildArchitectTools() {
  return [
    {
      name: 'list_available_tools',
      description:
        'Lista las tools, MCP servers y skills que YA están disponibles e instaladas ' +
        'en este workspace para asignar a un agente. Úsala antes de decidir si algo ' +
        'necesita instalarse.',
      input_schema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Filtro opcional, ej. "search", "code", "data", "communication".',
          },
        },
      },
    },
    {
      name: 'search_skill_marketplace',
      description:
        'Busca en el marketplace de skills/plugins (incluye repos sincronizados desde ' +
        'GitHub) una capacidad que no está instalada todavía, ej. "generar PDFs" o ' +
        '"leer hojas de cálculo". No instala nada, solo indica si existe y cómo se llama.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Qué capacidad se necesita, en lenguaje natural.' },
        },
        required: ['query'],
      },
    },
    {
      name: 'submit_plan',
      description:
        'Entrega el plan final de agentes. Debes llamar esta tool exactamente una vez, ' +
        'al terminar de investigar con list_available_tools / search_skill_marketplace.',
      input_schema: submitPlanToolInputSchema,
    },
  ];
}

module.exports = { buildArchitectTools };
