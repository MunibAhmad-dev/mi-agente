const { z } = require('zod');

/** Hard guardrail: never let a single plan spin up more than this many agents.
 *  FASE 2 (escalado dinámico): el tier extremadamente_complejo recomienda
 *  15–20 agentes, por lo que el guardrail sube a 20. */
const MAX_AGENTS = 20;

const architectAgentSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, 'key must be alphanumeric/dash/underscore'),
  name: z.string().min(1).max(80),
  role_description: z.string().min(1).max(300),
  instructions: z.string().min(1).max(8000),
  tools: z.array(z.string()).max(20).default([]),
  handoff_to: z.array(z.string()).max(MAX_AGENTS).optional(),
  is_root: z.boolean().optional(),
});

const architectPlanSchema = z
  .object({
    summary: z.string().min(1).max(1000),
    topology: z.enum(['single', 'chain', 'handoff', 'subagents']),
    agents: z.array(architectAgentSchema).min(1).max(MAX_AGENTS),
    missing_capabilities: z.array(z.string()).max(20).default([]),
  })
  .superRefine((plan, ctx) => {
    const keys = new Set();
    for (const agent of plan.agents) {
      if (keys.has(agent.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate agent key "${agent.key}"`,
        });
      }
      keys.add(agent.key);
    }
    for (const agent of plan.agents) {
      for (const target of agent.handoff_to ?? []) {
        if (!keys.has(target)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Agent "${agent.key}" hands off to unknown key "${target}"`,
          });
        }
      }
    }
    if (plan.topology === 'single' && plan.agents.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'topology "single" requires exactly one agent',
      });
    }
  });

/** Anthropic tool `input_schema` mirror of architectPlanSchema, used for the submit_plan tool. */
const submitPlanToolInputSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Resumen de la estrategia elegida.' },
    topology: {
      type: 'string',
      enum: ['single', 'chain', 'handoff', 'subagents'],
    },
    agents: {
      type: 'array',
      maxItems: MAX_AGENTS,
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Identificador temporal único dentro del plan.' },
          name: { type: 'string' },
          role_description: { type: 'string' },
          instructions: { type: 'string', description: 'System prompt para este agente.' },
          tools: {
            type: 'array',
            items: { type: 'string' },
            description: 'Nombres de tools/skills/MCP servers que este agente necesita.',
          },
          handoff_to: {
            type: 'array',
            items: { type: 'string' },
            description: 'Keys de otros agentes a los que este puede transferir la conversación.',
          },
          is_root: { type: 'boolean' },
        },
        required: ['key', 'name', 'role_description', 'instructions'],
      },
    },
    missing_capabilities: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Nombres de capacidades/skills que el plan necesita pero no están disponibles todavía.',
    },
  },
  required: ['summary', 'topology', 'agents'],
};

module.exports = {
  MAX_AGENTS,
  architectAgentSchema,
  architectPlanSchema,
  submitPlanToolInputSchema,
};
