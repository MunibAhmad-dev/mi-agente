/**
 * Tests — Local Model Providers (FASE 14).
 * Cubren: detección de Ollama (conectado/desconectado), descubrimiento de
 * modelos (/api/tags), info + capacidades (/api/show), validación SSRF de
 * endpoints y persistencia de configuración.
 */

const { LocalModelProvider } = require('./LocalModelProvider');
const { OllamaProvider } = require('./OllamaProvider');

function mockFetch(handler) {
  global.fetch = jest.fn(handler);
}

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
  };
}

const TAGS_SAMPLE = {
  models: [
    {
      name: 'qwen3:0.6b',
      model: 'qwen3:0.6b',
      modified_at: '2026-08-01T00:00:00Z',
      size: 457000000,
      digest: 'sha256:abc',
      details: {
        parameter_size: '0.6B',
        quantization_level: 'Q4_K_M',
        family: 'qwen3',
        families: ['qwen3'],
        format: 'gguf',
      },
    },
    {
      name: 'llama3.2:1b',
      size: 800000000,
      details: { parameter_size: '1B', family: 'llama', families: ['llama'], format: 'gguf' },
    },
  ],
};

const SHOW_SAMPLE = {
  model_info: { 'llama.context_length': 32768, 'general.architecture': 'llama' },
  capabilities: ['completion', 'tools', 'vision', 'embed'],
  parameters: { temperature: 0.7 },
  license: 'llama3.2',
  template: '{{ .Prompt }}',
};

describe('LocalModelProvider.validateEndpoint (seguridad SSRF)', () => {
  it('acepta http/https', () => {
    expect(LocalModelProvider.validateEndpoint('http://localhost:11434')).toBeTruthy();
    expect(LocalModelProvider.validateEndpoint('https://ollama.example.com:8443')).toBeTruthy();
  });

  it('rechaza esquemas no-HTTP', () => {
    expect(LocalModelProvider.validateEndpoint('file:///etc/passwd')).toBeNull();
    expect(LocalModelProvider.validateEndpoint('gopher://x:70')).toBeNull();
    expect(LocalModelProvider.validateEndpoint('ftp://x')).toBeNull();
  });

  it('rechaza credenciales embebidas y fragmentos', () => {
    expect(LocalModelProvider.validateEndpoint('http://user:pass@localhost:11434')).toBeNull();
    expect(LocalModelProvider.validateEndpoint('http://localhost:11434/#frag')).toBeNull();
  });

  it('rechaza URLs sin formato y puertos fuera de rango', () => {
    expect(LocalModelProvider.validateEndpoint('not a url')).toBeNull();
    expect(LocalModelProvider.validateEndpoint('http://localhost:99999')).toBeNull();
    expect(LocalModelProvider.validateEndpoint('')).toBeNull();
    expect(LocalModelProvider.validateEndpoint(null)).toBeNull();
  });
});

describe('OllamaProvider', () => {
  let provider;
  beforeEach(() => {
    provider = new OllamaProvider();
    provider.setEndpoint('http://ollama:11434');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reporta conectado cuando /api/version responde', async () => {
    mockFetch(async () => jsonResponse({ version: '0.32.9' }));
    const status = await provider.getStatus();
    expect(status.connected).toBe(true);
    expect(status.version).toBe('0.32.9');
  });

  it('reporta desconectado (NO lanza) cuando el runtime no responde', async () => {
    mockFetch(async () => {
      throw new Error('fetch failed');
    });
    const status = await provider.getStatus();
    expect(status.connected).toBe(false);
    expect(status.error).toContain('no responde');
    // un proveedor desconectado no rompe: error informativo, no excepción
    expect(typeof status.modelCount).toBe('number');
  });

  it('descubre modelos vía /api/tags y los normaliza con metadatos reales', async () => {
    mockFetch(async (url) => {
      if (String(url).endsWith('/api/version')) return jsonResponse({ version: '0.32.9' });
      if (String(url).endsWith('/api/tags')) return jsonResponse(TAGS_SAMPLE);
      return jsonResponse({ capabilities: [] });
    });
    const models = await provider.listModelsDetailed();
    expect(models).toHaveLength(2);

    const qwen = models.find((m) => m.name === 'qwen3:0.6b');
    expect(qwen.provider).toBe('ollama');
    expect(qwen.qualifiedId).toBe('ollama:qwen3:0.6b');
    expect(qwen.sizeHuman).toBeTruthy();
    expect(qwen.parameters).toBe('0.6B');
    expect(qwen.quantization).toBe('Q4_K_M');
    expect(qwen.architecture).toBe('qwen3');
    expect(qwen.families).toContain('qwen3');
  });

  it('no inventa metadatos ausentes (los deja null/desconocido)', async () => {
    mockFetch(async () => jsonResponse({ models: [{ name: 'raro', size: 1 }] }));
    const models = await provider.listModels();
    expect(models[0].parameters).toBeNull();
    expect(models[0].quantization).toBeNull();
    expect(models[0].sizeHuman).toBeNull();
  });

  it('enriquece con info de /api/show: contexto, capacidades y visión', async () => {
    mockFetch(async (url) => {
      const u = String(url);
      if (u.endsWith('/api/version')) return jsonResponse({ version: '0.32.9' });
      if (u.endsWith('/api/tags')) return jsonResponse(TAGS_SAMPLE);
      if (u.endsWith('/api/show')) return jsonResponse(SHOW_SAMPLE);
      return jsonResponse({});
    });
    const [model] = await provider.listModelsDetailed();
    expect(model.contextLength).toBe(32768);
    expect(model.capabilities).toEqual(
      expect.arrayContaining(['completion', 'tools', 'vision', 'embed']),
    );
    expect(model.vision).toBe(true);
    expect(model.hasTools).toBe(true);
  });

  it('no asume capacidades cuando /api/show no las reporta', async () => {
    mockFetch(async (url) => {
      const u = String(url);
      if (u.endsWith('/api/version')) return jsonResponse({ version: '0.32.9' });
      if (u.endsWith('/api/tags')) return jsonResponse(TAGS_SAMPLE);
      if (u.endsWith('/api/show')) return jsonResponse({ model_info: {} });
      return jsonResponse({});
    });
    const [model] = await provider.listModelsDetailed();
    expect(model.vision).toBeNull();
    expect(model.hasTools).toBeNull();
  });
});

describe('LocalModelRegistry (persistencia)', () => {
  let registry;
  beforeEach(() => {
    jest.resetModules();
    registry = require('./index');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('actualiza el endpoint y lo persiste; endpoint vacío revierte al default', async () => {
    const before = registry.updateProvider('ollama', { endpoint: 'http://127.0.0.1:11435' });
    expect(before.endpoint).toBe('http://127.0.0.1:11435');
    expect(before.persisted).toBe(true);

    const after = registry.updateProvider('ollama', { endpoint: '' });
    expect(after.endpoint).toBe(providerDefault());
  });

  it('rechaza endpoints inválidos con error claro', () => {
    expect(() => registry.updateProvider('ollama', { endpoint: 'file:///etc/passwd' })).toThrow(
      /endpoint inválido/,
    );
  });

  it('activa/desactiva el proveedor', async () => {
    const off = registry.updateProvider('ollama', { enabled: false });
    expect(off.enabled).toBe(false);
    const on = registry.updateProvider('ollama', { enabled: true });
    expect(on.enabled).toBe(true);
  });

  function providerDefault() {
    const p = registry.getProvider('ollama');
    return p.defaultEndpoint;
  }
});
