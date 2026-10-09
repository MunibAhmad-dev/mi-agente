/**
 * capabilityDiscovery.spec.js — tests unitarios del Capability Discovery
 * Engine (FASE 3).
 *
 * Verifica:
 *   - mapeo rol/instrucciones → capacidades (con implicaciones),
 *   - emparejamiento tools → capacidades contra el fixture de tools reales,
 *   - selección del conjunto mínimo sin duplicados por agente ni en el plan,
 *   - el marketplace se consulta una vez por capacidad y nunca se sugiere
 *     instalar algo que ya está disponible.
 *
 * Ejecutar:
 *   NODE_ENV=test node_modules/.bin/jest server/services/AgentArchitect/__tests__/capabilityDiscovery.spec.js
 */

const {
  mapRoleToCapabilities,
  matchToolsToCapabilities,
  selectToolsForAgent,
  discoverCapabilitiesForPlan,
} = require('../capabilityDiscovery');

const { Capabilities } = require('../../CapabilityOrchestrator/constants/Types');

/** Fixture que refleja los tools REALES del workspace (manifest del contenedor). */
const REAL_TOOLS = [
  { name: 'Traversaal', description: 'Web search API', category: 'search' },
  { name: 'Google', description: 'Google search', category: 'search' },
  { name: 'OpenAI Image Tools', description: 'DALL-E image generation', category: 'image' },
  { name: 'Wolfram', description: 'Computational knowledge', category: 'math' },
  { name: 'DALL-E-3', description: 'Image generation', category: 'image' },
  { name: 'Tavily Search', description: 'Web search', category: 'search' },
  { name: 'Calculator', description: 'Math calculations', category: 'math' },
  { name: 'DuckDuckGo Search', description: 'Web search', category: 'search' },
  { name: 'Knowledge Engine', description: 'Fact verification with sources', category: 'search' },
  { name: 'Image Generator', description: 'Generate images', category: 'image' },
  { name: 'Ask User', description: 'Ask the user for clarification', category: 'interaction' },
  { name: 'Stable Diffusion', description: 'Image generation', category: 'image' },
  { name: 'Azure AI Search', description: 'Enterprise search with RAG', category: 'search' },
  { name: 'OpenWeather', description: 'Weather data', category: 'data' },
  { name: 'Flux', description: 'Image generation', category: 'image' },
  { name: 'Gemini Image Tools', description: 'Image generation', category: 'image' },
];

describe('mapRoleToCapabilities — rol → capacidades', () => {
  it('un investigador requiere search/rag/analysis', () => {
    const caps = mapRoleToCapabilities({
      role: 'Researcher',
      instructions:
        'Investiga fuentes oficiales y cita la evidencia. Busca información actualizada.',
    });
    expect(caps).toContain(Capabilities.SEARCH);
    expect(caps).toContain(Capabilities.ANALYSIS);
  });

  it('un programador requiere code + implicación reasoning', () => {
    const caps = mapRoleToCapabilities({
      role: 'Coder',
      instructions: 'Implementa el backend en Node y refactoriza el código existente.',
    });
    expect(caps).toContain(Capabilities.CODE);
    expect(caps).toContain(Capabilities.REASONING); // implicación de code
  });

  it('un coordinador de sub-agentes requiere tool_calling/chat', () => {
    const caps = mapRoleToCapabilities({
      role: 'Coordinator',
      instructions: 'Delega sub-tareas a los especialistas, coordina y junta resultados.',
    });
    expect(caps).toContain(Capabilities.TOOL_CALLING);
    expect(caps).toContain(Capabilities.CHAT);
  });

  it('un agente de documentación requiere writing/summarization', () => {
    const caps = mapRoleToCapabilities({
      role: 'Docs agent',
      instructions: 'Escribe un informe detallado y resume los hallazgos en un manual.',
    });
    expect(caps).toContain(Capabilities.WRITING);
    expect(caps).toContain(Capabilities.SUMMARIZATION);
  });

  it('sin señales → defaults chat + reasoning', () => {
    const caps = mapRoleToCapabilities({ role: 'Agente', instructions: 'Haz tu tarea.' });
    expect(caps).toContain(Capabilities.CHAT);
    expect(caps).toContain(Capabilities.REASONING);
  });

  it('frontend implica code y reasoning (transitivo)', () => {
    const caps = mapRoleToCapabilities({
      role: 'UI',
      instructions: 'Diseña la interfaz con React y componentes CSS.',
    });
    expect(caps).toContain(Capabilities.FRONTEND);
    expect(caps).toContain(Capabilities.CODE);
    expect(caps).toContain(Capabilities.REASONING);
  });
});

describe('matchToolsToCapabilities — tools → capacidades', () => {
  it('search empareja Tavily/DuckDuckGo/Google/Traversaal/Knowledge Engine', () => {
    const matches = matchToolsToCapabilities({
      capabilities: [Capabilities.SEARCH],
      availableTools: REAL_TOOLS,
    });
    const names = matches.map((m) => m.name);
    expect(names).toContain('Tavily Search');
    expect(names).toContain('DuckDuckGo Search');
    expect(names).toContain('Knowledge Engine');
    expect(names).toContain('Google');
    expect(names).toContain('Traversaal');
  });

  it('image_generation empareja DALL-E-3/Stable Diffusion/Flux/Image Generator', () => {
    const matches = matchToolsToCapabilities({
      capabilities: [Capabilities.IMAGE_GEN],
      availableTools: REAL_TOOLS,
    });
    const names = matches.map((m) => m.name);
    for (const expected of ['DALL-E-3', 'Stable Diffusion', 'Flux', 'Image Generator']) {
      expect(names).toContain(expected);
    }
  });

  it('Knowledge Engine cubre search + rag + analysis (índice exacto)', () => {
    const matches = matchToolsToCapabilities({
      capabilities: [Capabilities.SEARCH, Capabilities.RAG, Capabilities.ANALYSIS],
      availableTools: REAL_TOOLS,
    });
    const ke = matches.find((m) => m.name === 'Knowledge Engine');
    expect(ke).toBeDefined();
    expect(ke.covered).toEqual(
      expect.arrayContaining([Capabilities.SEARCH, Capabilities.RAG, Capabilities.ANALYSIS]),
    );
    expect(ke.score).toBeGreaterThan(3); // bonus de índice exacto
  });

  it('una tool desconocida se infiere por nombre/descripción', () => {
    const matches = matchToolsToCapabilities({
      capabilities: [Capabilities.SEARCH],
      availableTools: [{ name: 'my_custom_search', description: 'búsqueda web interna' }],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe('my_custom_search');
  });
});

describe('selectToolsForAgent — conjunto mínimo y dedup', () => {
  it('cubre search+analysis con el menor número de tools', () => {
    const { assigned, coverage, unmatched } = selectToolsForAgent({
      capabilities: [Capabilities.SEARCH, Capabilities.ANALYSIS],
      availableTools: REAL_TOOLS,
    });
    expect(coverage).toEqual(expect.arrayContaining([Capabilities.SEARCH, Capabilities.ANALYSIS]));
    expect(unmatched).toEqual([]);
    // Knowledge Engine cubre ambas capacidades con un solo tool.
    expect(assigned).toContain('Knowledge Engine');
    expect(assigned.length).toBeLessThanOrEqual(2);
  });

  it('no asigna el mismo tool a dos agentes (dedup por plan)', () => {
    const { assigned: a1 } = selectToolsForAgent({
      capabilities: [Capabilities.SEARCH, Capabilities.ANALYSIS],
      availableTools: REAL_TOOLS,
      alreadyAssigned: [],
    });
    const { assigned: a2, collisions } = selectToolsForAgent({
      capabilities: [Capabilities.SEARCH],
      availableTools: REAL_TOOLS,
      alreadyAssigned: a1,
    });
    const normalized = new Set(a1.map((n) => n.toLowerCase().replace(/[^a-z0-9]/g, '')));
    for (const t of a2) {
      expect(normalized.has(t.toLowerCase().replace(/[^a-z0-9]/g, ''))).toBe(false);
    }
    expect(collisions).toBeGreaterThanOrEqual(1); // el mejor candidato estaba ocupado
  });

  it('capabilidad sin tool disponible queda en unmatched (sin inventar)', () => {
    const { unmatched } = selectToolsForAgent({
      capabilities: [Capabilities.VIDEO_GEN],
      availableTools: REAL_TOOLS,
    });
    expect(unmatched).toContain(Capabilities.VIDEO_GEN);
  });
});

describe('discoverCapabilitiesForPlan — orquestación real sin duplicados', () => {
  const PLAN = {
    summary: 'Construir plataforma con investigación y código',
    topology: 'subagents',
    agents: [
      {
        key: 'coord',
        name: 'Coordinador',
        role_description: 'Coordina sub-tareas y junta resultados.',
        instructions: 'Delega y coordina a los especialistas.',
      },
      {
        key: 'researcher',
        name: 'Researcher',
        role_description: 'Investiga fuentes',
        instructions: 'Investiga y busca información actualizada con fuentes.',
      },
      {
        key: 'coder',
        name: 'Coder',
        role_description: 'Implementa código',
        instructions: 'Implementa el backend en Node y refactoriza el código.',
      },
      {
        key: 'reviewer',
        name: 'Reviewer',
        role_description: 'Audita y verifica',
        instructions: 'Revisa la seguridad, evalúa y verifica cada entregable.',
      },
    ],
  };

  it('asigna tools únicos entre agentes y no sugiere instalar lo ya disponible', async () => {
    const searchSkillCatalog = jest.fn(async (query) => [
      { name: `market-${query}`, source: 'github' },
    ]);

    const report = await discoverCapabilitiesForPlan({
      plan: PLAN,
      listAvailableTools: async () => REAL_TOOLS,
      searchSkillCatalog,
    });

    // Sin tools duplicadas entre agentes.
    const allAssigned = report.agents.flatMap((a) => a.assignedTools);
    const normalized = allAssigned.map((n) => n.toLowerCase().replace(/[^a-z0-9]/g, ''));
    expect(new Set(normalized).size).toBe(normalized.length);

    // Stats coherentes.
    expect(report.stats.agents).toBe(4);
    expect(report.stats.toolsAssigned).toBe(new Set(normalized).size);
    expect(report.stats.duplicateAssignmentsPrevented).toBeGreaterThanOrEqual(0);

    // Nada de lo ya disponible se sugiere como instalación.
    for (const inst of report.installsSuggested) {
      const exists = REAL_TOOLS.some(
        (t) =>
          t.name.toLowerCase().replace(/[^a-z0-9]/g, '') ===
          inst.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
      );
      expect(exists).toBe(false);
    }

    // Claves de instalación únicas.
    const keys = report.installsSuggested.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('el marketplace se consulta UNA vez por capacidad (dedup de queries)', async () => {
    const searchSkillCatalog = jest.fn(async (query) => [
      { name: `skill-${query}`, source: 'github' },
    ]);

    await discoverCapabilitiesForPlan({
      plan: PLAN,
      listAvailableTools: async () => REAL_TOOLS,
      searchSkillCatalog,
    });

    const queries = searchSkillCatalog.mock.calls.map((c) => c[0]);
    expect(new Set(queries).size).toBe(queries.length);
  });

  it('sin searchSkillCatalog → unresolved sin sugerencias falsas', async () => {
    const report = await discoverCapabilitiesForPlan({
      plan: PLAN,
      listAvailableTools: async () => REAL_TOOLS,
    });
    expect(report.stats.installsSuggested).toBe(0);
    expect(report.installsSuggested).toEqual([]);
  });

  it('plan vacío → reporte vacío sin romper', async () => {
    const report = await discoverCapabilitiesForPlan({
      plan: { agents: [] },
      listAvailableTools: async () => REAL_TOOLS,
    });
    expect(report.stats.agents).toBe(0);
    expect(report.agents).toEqual([]);
  });
});
