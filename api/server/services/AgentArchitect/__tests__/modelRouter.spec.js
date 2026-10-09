/**
 * modelRouter.spec.js — tests unitarios del Model Router (FASE 4).
 *
 * Verifica:
 *   - perfiles de capacidades por modelo (qwen/deepseek/vision/audio),
 *   - registro real en el ModelRegistry del CapabilityOrchestrator,
 *   - routing por capacidades: matchScore + preferencia local + latencia,
 *   - capacidades sin cobertura reportadas con honestidad,
 *   - el flujo completo con fetch de Ollama (mockeado) y plan multi-agente.
 *
 * Ejecutar:
 *   NODE_ENV=test node_modules/.bin/jest server/services/AgentArchitect/__tests__/modelRouter.spec.js
 */

const {
  capabilitiesForOllamaModel,
  estimateSizeFromName,
  buildModelRegistryFromOllama,
  routeModelForAgent,
  routePlanToModels,
  routePlanWithOllamaModels,
} = require('../modelRouter');

const { Capabilities } = require('../../CapabilityOrchestrator/constants/Types');

/** Fixture que refleja los modelos REALES de Ollama del entorno. */
const OLLAMA_FIXTURE = [
  {
    name: 'deepseek-r1:1.5b',
    size: 1117322768,
    digest: 'a1',
    modified_at: '2026-08-15T19:46:18',
    details: { family: 'deepseek', parameter_size: '1.5B' },
  },
  {
    name: 'qwen3:0.6b',
    size: 500000000,
    digest: 'a2',
    modified_at: '2026-08-15T19:46:18',
    details: { family: 'qwen3', parameter_size: '0.6B' },
  },
  {
    name: 'qwen3:1.7b',
    size: 1200000000,
    digest: 'a3',
    modified_at: '2026-08-15T19:46:18',
    details: { family: 'qwen3', parameter_size: '1.7B' },
  },
  {
    name: 'llama3.2:3b',
    size: 2000000000,
    digest: 'a4',
    modified_at: '2026-08-15T19:46:18',
    details: { family: 'llama', parameter_size: '3B' },
  },
  {
    name: 'llama3.2-vision:11b',
    size: 7000000000,
    digest: 'a5',
    modified_at: '2026-08-15T19:46:18',
    details: { family: 'llama', parameter_size: '11B' },
  },
];

describe('capabilitiesForOllamaModel — perfiles por modelo', () => {
  it('qwen3 → code + tool_calling + reasoning', () => {
    const caps = capabilitiesForOllamaModel('qwen3:0.6b');
    expect(caps).toEqual(
      expect.arrayContaining([
        Capabilities.CODE,
        Capabilities.TOOL_CALLING,
        Capabilities.REASONING,
      ]),
    );
  });

  it('deepseek → reasoning_chain + math + code', () => {
    const caps = capabilitiesForOllamaModel('deepseek-r1:1.5b');
    expect(caps).toEqual(
      expect.arrayContaining([Capabilities.REASONING_CHAIN, Capabilities.MATH, Capabilities.CODE]),
    );
  });

  it('modelo vision → vision + multimodal', () => {
    const caps = capabilitiesForOllamaModel('llama3.2-vision:11b');
    expect(caps).toEqual(expect.arrayContaining([Capabilities.VISION, Capabilities.MULTIMODAL]));
  });

  it('whisper → audio', () => {
    const caps = capabilitiesForOllamaModel('whisper-large-v3');
    expect(caps).toContain(Capabilities.AUDIO);
  });

  it('modelo desconocido → defaults chat core', () => {
    const caps = capabilitiesForOllamaModel('mimodelo-extraño');
    expect(caps).toContain(Capabilities.CHAT);
    expect(caps).toContain(Capabilities.REASONING);
  });
});

describe('estimateSizeFromName', () => {
  it('extrae el tamaño desde el nombre', () => {
    expect(estimateSizeFromName('qwen3:0.6b')).toBe(0.6);
    expect(estimateSizeFromName('qwen3:1.7b')).toBe(1.7);
    expect(estimateSizeFromName('deepseek-r1:1.5b')).toBe(1.5);
  });
  it('default razonable sin tamaño en el nombre', () => {
    expect(estimateSizeFromName('llama3.2')).toBe(7);
  });
});

describe('buildModelRegistryFromOllama — registro real en ModelRegistry', () => {
  it('registra todos los modelos como activos y saludables', () => {
    const registry = buildModelRegistryFromOllama(OLLAMA_FIXTURE);
    const models = registry.listModels({ activeOnly: true });
    expect(models.length).toBe(OLLAMA_FIXTURE.length);
    for (const m of models) {
      expect(m.provider).toBe('ollama');
      expect(m.status).toBe('active');
      expect(m.healthCheck.isHealthy).toBe(true);
      expect(m.costPer1K.input).toBe(0); // local = gratis
    }
  });

  it('el registro se consulta por capacidades con el índice invertido', () => {
    const registry = buildModelRegistryFromOllama(OLLAMA_FIXTURE);
    const candidates = registry.findByCapabilities([Capabilities.CODE, Capabilities.TOOL_CALLING]);
    const ids = candidates.map((c) => c.modelId);
    expect(ids).toContain('ollama/qwen3:0.6b');
    expect(ids).toContain('ollama/qwen3:1.7b');
  });
});

describe('routeModelForAgent — routing por capacidades', () => {
  const registry = buildModelRegistryFromOllama(OLLAMA_FIXTURE);

  it('agente con code+tool_calling → qwen3 (mejor match) sobre deepseek', () => {
    const d = routeModelForAgent({
      capabilities: [Capabilities.CODE, Capabilities.TOOL_CALLING],
      registry,
    });
    expect(d.chosen).not.toBeNull();
    expect(d.chosen.modelId).toMatch(/^ollama\/qwen3/);
    expect(d.matchScore).toBeGreaterThan(0);
  });

  it('agente de razonamiento puro → deepseek o qwen3, siempre local', () => {
    const d = routeModelForAgent({
      capabilities: [Capabilities.REASONING_CHAIN, Capabilities.REASONING, Capabilities.ANALYSIS],
      registry,
    });
    expect(d.chosen).not.toBeNull();
    expect(d.chosen.provider).toBe('ollama');
    expect(d.chosen.matchedCapabilities).toContain(Capabilities.REASONING);
  });

  it('capacidad sin cobertura → unmatched honesta, sin inventar modelo', () => {
    const d = routeModelForAgent({
      capabilities: [Capabilities.VIDEO_GEN],
      registry,
    });
    // Ningún modelo del registro cubre video → no hay elección.
    expect(d.unmatchedCapabilities).toContain(Capabilities.VIDEO_GEN);
    expect(d.chosen ? d.chosen.missingCapabilities.includes(Capabilities.VIDEO_GEN) : true).toBe(
      true,
    );
  });

  it('preferencia local: un modelo cloud con el mismo match no gana al local', () => {
    const reg = buildModelRegistryFromOllama(OLLAMA_FIXTURE);
    reg.registerModel({
      provider: 'openai',
      model: 'gpt-4o-mini',
      capabilities: { capabilities: capabilitiesForOllamaModel('qwen3:0.6b') },
      metrics: { avgLatency: 50 },
      costPer1K: { input: 0.15, output: 0.6 },
      status: 'active',
      healthCheck: { isHealthy: true },
    });
    const d = routeModelForAgent({
      capabilities: [Capabilities.CODE, Capabilities.TOOL_CALLING, Capabilities.FUNCTION_CALLING],
      registry: reg,
    });
    expect(d.chosen.provider).toBe('ollama');
  });

  it('rank alternativas por matchScore descendente', () => {
    const d = routeModelForAgent({
      capabilities: [Capabilities.CODE],
      registry,
    });
    const scores = d.alternatives.map((a) => a.matchScore);
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }
  });
});

describe('routePlanToModels — plan multi-agente', () => {
  const registry = buildModelRegistryFromOllama(OLLAMA_FIXTURE);

  const PLAN_AGENTS = [
    {
      key: 'coord',
      name: 'Coordinador',
      capabilities: [Capabilities.TOOL_CALLING, Capabilities.CHAT],
    },
    {
      key: 'researcher',
      name: 'Researcher',
      capabilities: [Capabilities.SEARCH, Capabilities.ANALYSIS],
    },
    { key: 'coder', name: 'Coder', capabilities: [Capabilities.CODE, Capabilities.REASONING] },
    {
      key: 'reviewer',
      name: 'Reviewer',
      capabilities: [Capabilities.ANALYSIS, Capabilities.SECURITY],
    },
  ];

  it('cada agente recibe un modelo real registrado (con nombre plano utilizable)', () => {
    const report = routePlanToModels({ agents: PLAN_AGENTS, registry });
    expect(report.stats.agents).toBe(4);
    expect(report.stats.routed).toBe(4);
    for (const a of report.agents) {
      expect(a.chosenModel).not.toBeNull();
      expect(a.chosenModel.provider).toBe('ollama');
      expect(a.chosenModel.isLocal).toBe(true);
      // `model` debe ser el nombre plano (p. ej. 'qwen3:0.6b'), no un objeto.
      expect(typeof a.chosenModel.model).toBe('string');
      expect(a.chosenModel.model.length).toBeGreaterThan(0);
      expect(a.chosenModel.model).not.toContain('ollama/');
    }
  });

  it('stats: todos locales, modelos únicos registrados', () => {
    const report = routePlanToModels({ agents: PLAN_AGENTS, registry });
    expect(report.stats.allLocal).toBe(true);
    expect(report.stats.uniqueModels).toBeGreaterThanOrEqual(1);
    expect(report.stats.uniqueModels).toBeLessThanOrEqual(report.stats.agents);
    expect(report.stats.byProvider.ollama).toBe(4);
  });

  it('distribuye modelos DISTINTOS entre agentes cuando empatan en matchScore', () => {
    const reg = buildModelRegistryFromOllama([
      {
        name: 'qwen3:0.6b',
        size: 5e8,
        digest: 'x1',
        modified_at: '',
        details: { family: 'qwen3' },
      },
      {
        name: 'qwen3:1.7b',
        size: 1.2e9,
        digest: 'x2',
        modified_at: '',
        details: { family: 'qwen3' },
      },
      { name: 'gemma3:1b', size: 1e9, digest: 'x3', modified_at: '', details: { family: 'gemma' } },
    ]);
    // Los tres agentes piden exactamente las mismas capacidades → el primer
    // agente toma el mejor y los siguientes deben recibir otros con el mismo
    // match en lugar de repetir el mismo modelo.
    const report = routePlanToModels({
      agents: [
        { key: 'a1', capabilities: [Capabilities.CODE, Capabilities.TOOL_CALLING] },
        { key: 'a2', capabilities: [Capabilities.CODE, Capabilities.TOOL_CALLING] },
        { key: 'a3', capabilities: [Capabilities.CODE, Capabilities.TOOL_CALLING] },
      ],
      registry: reg,
    });
    const ids = report.agents.map((a) => a.chosenModel?.modelId);
    expect(new Set(ids).size).toBeGreaterThan(1); // no todos al mismo modelo
    expect(ids.every((id) => id && id.startsWith('ollama/'))).toBe(true);
  });

  it('prefiere tags oficiales limpios sobre aliases hf.co/QuantFactory', () => {
    const reg = buildModelRegistryFromOllama([
      {
        name: 'hf.co/MaziyarPanahi/Qwen3-0.6B-GGUF:latest',
        size: 7.5e8,
        digest: 'y1',
        modified_at: '',
        details: { family: 'qwen3' },
      },
      {
        name: 'qwen3:0.6b',
        size: 7.5e8,
        digest: 'y2',
        modified_at: '',
        details: { family: 'qwen3' },
      },
    ]);
    const d = routeModelForAgent({ capabilities: [Capabilities.CODE], registry: reg });
    expect(d.chosen.modelId).toBe('ollama/qwen3:0.6b');
  });
});

describe('routePlanWithOllamaModels — flujo completo (fetch mockeado)', () => {
  it('fetch → registro → routing, con el reporte completo', async () => {
    const fetchFn = async () => ({ ok: true, json: async () => ({ models: OLLAMA_FIXTURE }) });
    const { report, registry, ollamaModels } = await routePlanWithOllamaModels({
      agents: [
        {
          key: 'coder',
          name: 'Coder',
          capabilities: [Capabilities.CODE, Capabilities.TOOL_CALLING],
        },
        {
          key: 'writer',
          name: 'Writer',
          capabilities: [Capabilities.WRITING, Capabilities.SUMMARIZATION],
        },
      ],
      ollamaBaseUrl: 'http://ollama:11434',
      fetchFn,
    });
    expect(ollamaModels.length).toBe(OLLAMA_FIXTURE.length);
    expect(registry.listModels().length).toBe(OLLAMA_FIXTURE.length);
    expect(report.stats.routed).toBe(2);
    expect(report.agents[0].chosenModel.modelId).toMatch(/^ollama\/qwen3/);
  });

  it('propaga el error si Ollama no responde (honestidad, sin modelo falso)', async () => {
    const fetchFn = async () => ({ ok: false, status: 503 });
    await expect(
      routePlanWithOllamaModels({
        agents: [{ key: 'a', capabilities: [Capabilities.CHAT] }],
        ollamaBaseUrl: 'http://ollama:11434',
        fetchFn,
      }),
    ).rejects.toThrow(/503/);
  });
});
