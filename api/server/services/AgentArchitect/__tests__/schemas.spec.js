/**
 * schemas.spec.js — tests unitarios del schema del plan (Agent Architect).
 *
 * El schema (`architectPlanSchema`) es la red de seguridad del planner: valida
 * que el LLM no produzca planes inválidos (agentes duplicados, handoffs a
 * agentes inexistentes, topología single con varios agentes, más de MAX_AGENTS,
 * claves con caracteres inválidos). Estas pruebas son 100% deterministas
 * (zod puro, sin LLM ni red).
 *
 * Ejecutar:
 *   NODE_ENV=test node_modules/.bin/jest server/services/AgentArchitect/__tests__/schemas.spec.js
 */

const { architectPlanSchema, MAX_AGENTS } = require('../schemas');

const validAgent = (key = 'a1') => ({
  key,
  name: 'Agente 1',
  role_description: 'Hace una subtarea.',
  instructions: 'Haz tu tarea paso a paso.',
});

const validPlan = (overrides = {}) => ({
  summary: 'Plan de prueba',
  topology: 'single',
  agents: [validAgent()],
  missing_capabilities: [],
  ...overrides,
});

describe('architectPlanSchema — planes válidos', () => {
  it('acepta un plan single con un agente', () => {
    const parsed = architectPlanSchema.safeParse(validPlan());
    expect(parsed.success).toBe(true);
    expect(parsed.data.topology).toBe('single');
    expect(parsed.data.agents).toHaveLength(1);
  });

  it('acepta una cadena (chain) con handoffs válidos', () => {
    const plan = validPlan({
      topology: 'chain',
      agents: [
        { ...validAgent('a1'), handoff_to: ['a2'] },
        { ...validAgent('a2'), handoff_to: ['a3'] },
        validAgent('a3'),
      ],
    });
    expect(architectPlanSchema.safeParse(plan).success).toBe(true);
  });

  it('acepta subagents con herramientas opcionales y capacidades faltantes', () => {
    const plan = validPlan({
      topology: 'subagents',
      agents: [
        { ...validAgent('coord'), is_root: true, tools: ['web_search', 'knowledge_engine'] },
        validAgent('worker1'),
      ],
      missing_capabilities: ['video editing'],
    });
    const parsed = architectPlanSchema.safeParse(plan);
    expect(parsed.success).toBe(true);
    expect(parsed.data.missing_capabilities).toEqual(['video editing']);
  });
});

describe('architectPlanSchema — rechazos (red de seguridad)', () => {
  it('rechaza claves de agente duplicadas', () => {
    const plan = validPlan({
      topology: 'subagents',
      agents: [validAgent('dup'), validAgent('dup')],
    });
    const parsed = architectPlanSchema.safeParse(plan);
    expect(parsed.success).toBe(false);
    expect(parsed.error.issues.some((i) => i.message.includes('Duplicate agent key'))).toBe(true);
  });

  it('rechaza handoff a un agente que no existe', () => {
    const plan = validPlan({
      topology: 'chain',
      agents: [{ ...validAgent('a1'), handoff_to: ['ghost'] }],
    });
    const parsed = architectPlanSchema.safeParse(plan);
    expect(parsed.success).toBe(false);
    expect(parsed.error.issues.some((i) => i.message.includes('unknown key'))).toBe(true);
  });

  it('rechaza topología single con más de un agente', () => {
    const plan = validPlan({
      topology: 'single',
      agents: [validAgent('a1'), validAgent('a2')],
    });
    const parsed = architectPlanSchema.safeParse(plan);
    expect(parsed.success).toBe(false);
    expect(parsed.error.issues.some((i) => i.message.includes('exactly one agent'))).toBe(true);
  });

  it(`rechaza más de ${MAX_AGENTS} agentes (guardrail duro)`, () => {
    const agents = Array.from({ length: MAX_AGENTS + 1 }, (_, i) => validAgent(`a${i}`));
    const parsed = architectPlanSchema.safeParse(validPlan({ topology: 'subagents', agents }));
    expect(parsed.success).toBe(false);
  });

  it('rechaza claves con caracteres inválidos (espacios/símbolos)', () => {
    const plan = validPlan({ agents: [{ ...validAgent('mal clave!') }] });
    const parsed = architectPlanSchema.safeParse(plan);
    expect(parsed.success).toBe(false);
  });

  it('rechaza plan sin instrucciones ni resumen (campos requeridos)', () => {
    const plan = validPlan({
      agents: [{ key: 'a1', name: 'X', role_description: 'r' }], // sin instructions
    });
    const parsed = architectPlanSchema.safeParse(plan);
    expect(parsed.success).toBe(false);
  });

  it('rechaza topología desconocida', () => {
    const parsed = architectPlanSchema.safeParse(validPlan({ topology: 'swarm' }));
    expect(parsed.success).toBe(false);
  });
});

describe('MAX_AGENTS', () => {
  it('es un límite duro finito y razonable', () => {
    expect(Number.isInteger(MAX_AGENTS)).toBe(true);
    expect(MAX_AGENTS).toBeGreaterThanOrEqual(1);
    expect(MAX_AGENTS).toBeLessThanOrEqual(20);
  });
});
