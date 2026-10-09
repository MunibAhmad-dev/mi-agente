/**
 * planner.spec.js — tests unitarios de `generatePlan` (Agent Architect).
 *
 * `generatePlan` ejecuta un bucle de tool-calling contra la API de Anthropic.
 * Aquí se mockea `createMessage` (anthropicClient) para probar el flujo REAL
 * del planner sin red:
 *   - bucle de tools (list_available_tools → submit_plan),
 *   - terminal submit_plan + validación del schema,
 *   - reintento cuando el primer turno no llama submit_plan,
 *   - error cuando nunca se genera un plan,
 *   - error cuando el plan no pasa el schema.
 *
 * Ejecutar:
 *   NODE_ENV=test node_modules/.bin/jest server/services/AgentArchitect/__tests__/planner.spec.js
 */

const { generatePlan } = require('../planner');
const { createMessage } = require('../anthropicClient');

jest.mock('../anthropicClient', () => ({ createMessage: jest.fn() }));

const planInput = {
  summary: 'Plan de prueba',
  topology: 'subagents',
  agents: [
    {
      key: 'coord',
      name: 'Coordinador',
      role_description: 'Coordina',
      instructions: 'Delega y junta resultados.',
      tools: ['web_search'],
      is_root: true,
    },
    {
      key: 'worker',
      name: 'Worker',
      role_description: 'Ejecuta',
      instructions: 'Haz la tarea.',
      tools: [],
    },
  ],
  missing_capabilities: [],
};

const toolUse = (name, input) => ({
  type: 'tool_use',
  id: `tu_${name}`,
  name,
  input,
});

const textOnly = (text = 'Analizando…') => ({
  content: [{ type: 'text', text }],
});

beforeEach(() => {
  createMessage.mockReset();
});

describe('generatePlan', () => {
  it('genera un plan válido cuando el modelo llama submit_plan directo', async () => {
    createMessage.mockResolvedValueOnce({ content: [toolUse('submit_plan', planInput)] });

    const { plan, transcriptTurns } = await generatePlan({
      task: 'investiga y resume',
      listAvailableTools: jest.fn().mockResolvedValue([]),
    });

    expect(plan.topology).toBe('subagents');
    expect(plan.agents).toHaveLength(2);
    expect(plan.missing_capabilities).toEqual([]);
    expect(transcriptTurns).toBe(1);
  });

  it('ejecuta el bucle de tools: list_available_tools → submit_plan', async () => {
    createMessage
      .mockResolvedValueOnce({
        content: [toolUse('list_available_tools', {})],
      })
      .mockResolvedValueOnce({ content: [toolUse('submit_plan', planInput)] });

    const listAvailableTools = jest.fn().mockResolvedValue([
      { name: 'web_search', description: 'Busca en la web', category: 'search' },
      { name: 'knowledge_engine', description: 'Verifica hechos', category: 'search' },
    ]);

    const { plan, transcriptTurns } = await generatePlan({
      task: 'analiza el código',
      listAvailableTools,
      model: 'claude-sonnet-4-6',
    });

    expect(listAvailableTools).toHaveBeenCalled();
    // El resultado de list_available_tools se devolvió al modelo como tool_result
    // (se verifica que hubo 2 turnos modelo→herramienta→modelo).
    expect(transcriptTurns).toBe(2);
    expect(plan.agents).toHaveLength(2);
    // El bucle no debe llamar submit_plan antes de tiempo: se llama exactamente 2 veces.
    expect(createMessage).toHaveBeenCalledTimes(2);
  });

  it('filtra tools por categoría cuando el modelo lo pide', async () => {
    createMessage
      .mockResolvedValueOnce({ content: [toolUse('list_available_tools', { category: 'search' })] })
      .mockResolvedValueOnce({ content: [toolUse('submit_plan', planInput)] });

    const listAvailableTools = jest.fn().mockResolvedValue([
      { name: 'web_search', description: 'Busca', category: 'search' },
      { name: 'dalle3', description: 'Imagen', category: 'image' },
    ]);

    await generatePlan({ task: 'x', listAvailableTools });

    const toolResultCall = createMessage.mock.calls[1][0].messages.find(
      (m) => m.role === 'user' && Array.isArray(m.content),
    );
    const resultContent = JSON.stringify(toolResultCall?.content || []);
    expect(resultContent).toContain('web_search');
    expect(resultContent).not.toContain('dalle3');
  });

  it('reintenta una vez si el primer turno no llama submit_plan', async () => {
    createMessage
      .mockResolvedValueOnce(textOnly('Voy a analizar primero'))
      .mockResolvedValueOnce({ content: [toolUse('submit_plan', planInput)] });

    const { plan } = await generatePlan({
      task: 'x',
      listAvailableTools: jest.fn().mockResolvedValue([]),
    });

    expect(plan.topology).toBe('subagents');
    expect(createMessage).toHaveBeenCalledTimes(2);
  });

  it('falla si tras dos intentos nunca se genera un plan', async () => {
    createMessage.mockResolvedValue(textOnly('sigo pensando'));

    await expect(
      generatePlan({ task: 'x', listAvailableTools: jest.fn().mockResolvedValue([]) }),
    ).rejects.toThrow(/no pudo generar un plan válido/i);
  });

  it('falla si el plan no pasa el schema (agentes duplicados)', async () => {
    const bad = {
      ...planInput,
      agents: [
        { ...planInput.agents[0] },
        { ...planInput.agents[0], key: 'coord' }, // clave duplicada
      ],
    };
    createMessage.mockResolvedValueOnce({ content: [toolUse('submit_plan', bad)] });

    await expect(
      generatePlan({ task: 'x', listAvailableTools: jest.fn().mockResolvedValue([]) }),
    ).rejects.toThrow(/Plan inválido/i);
  });

  it('reporta cuando el skill marketplace no está disponible', async () => {
    createMessage
      .mockResolvedValueOnce({ content: [toolUse('search_skill_marketplace', { query: 'video' })] })
      .mockResolvedValueOnce({ content: [toolUse('submit_plan', planInput)] });

    // Sin searchSkillCatalog → executeTool devuelve "not available".
    await generatePlan({
      task: 'x',
      listAvailableTools: jest.fn().mockResolvedValue([]),
    });

    const toolResultCall = createMessage.mock.calls[1][0].messages.find(
      (m) => m.role === 'user' && Array.isArray(m.content),
    );
    expect(JSON.stringify(toolResultCall?.content || [])).toContain('not available');
  });
});

describe('generatePlan — FASE 2 escalado dinámico (complejidad)', () => {
  const MEDIUM_TASK =
    'Investiga las mejores prácticas de seguridad en APIs REST y escribe un informe detallado con citas de fuentes oficiales, ejemplos de código en Python y una sección de pruebas de vulnerabilidades.';

  it('inyecta la guía de complejidad en el system prompt', async () => {
    createMessage.mockResolvedValueOnce({ content: [toolUse('submit_plan', planInput)] });

    await generatePlan({
      task: MEDIUM_TASK,
      listAvailableTools: jest.fn().mockResolvedValue([]),
    });

    const system = createMessage.mock.calls[0][0].system;
    expect(system).toContain('Complejidad de la tarea: Media');
    expect(system).toContain('4–5'); // rango recomendado del tier medium
    expect(system).toContain('MENOR número de agentes');
  });

  it('devuelve la metadata de complejidad junto al plan', async () => {
    createMessage.mockResolvedValueOnce({ content: [toolUse('submit_plan', planInput)] });

    const { plan, complexity } = await generatePlan({
      task: MEDIUM_TASK,
      listAvailableTools: jest.fn().mockResolvedValue([]),
    });

    expect(plan.topology).toBe('subagents');
    expect(complexity).toBeDefined();
    expect(complexity.tier).toBe('medium');
    expect(complexity.range).toEqual({ min: 4, max: 5 });
    expect(typeof complexity.score).toBe('number');
    expect(Array.isArray(complexity.reasons)).toBe(true);
  });

  it('respeta un override de complejidad si la UI ya lo conoce', async () => {
    createMessage.mockResolvedValueOnce({ content: [toolUse('submit_plan', planInput)] });

    const override = { tier: 'extremely_complex', score: 9.5, range: { min: 15, max: 20 } };
    const { complexity } = await generatePlan({
      task: 'tarea corta',
      listAvailableTools: jest.fn().mockResolvedValue([]),
      complexity: override,
    });

    expect(complexity.tier).toBe('extremely_complex');
    // El system prompt debe reflejar el override, no el análisis automático.
    const system = createMessage.mock.calls[0][0].system;
    expect(system).toContain('Extremadamente compleja');
  });

  it('una tarea trivial recibe guía simple y rango 1–3', async () => {
    createMessage.mockResolvedValueOnce({ content: [toolUse('submit_plan', planInput)] });

    const { complexity } = await generatePlan({
      task: 'resume esto',
      listAvailableTools: jest.fn().mockResolvedValue([]),
    });

    expect(complexity.tier).toBe('simple');
    expect(complexity.range).toEqual({ min: 1, max: 3 });
    expect(createMessage.mock.calls[0][0].system).toContain('Simple');
  });
});
