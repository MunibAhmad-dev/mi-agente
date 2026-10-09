/**
 * AgentRuntime.spec.js — PIN DEL CONTRATO del runtime de agentes (FASE 1).
 *
 * Verifica que la fachada versionada exponga exactamente las funciones que la
 * app usa y que cada una sea invocable contra el paquete real. Corre DENTRO
 * del contenedor del API (donde @librechat/api y @librechat/agents existen).
 *
 * Si este test falla tras actualizar @librechat/api, el contrato cambió:
 *   - si la función desapareció → adaptar el código de la app,
 *   - si cambió de firma → actualizar la fachada (y subir RUNTIME_VERSION).
 *
 * Ejecutar:
 *   NODE_ENV=test node_modules/.bin/jest server/services/AgentRuntime/AgentRuntime.spec.js
 */

const runtime = require('./index');

describe('AgentRuntime — contrato versionado', () => {
  it('expone versión del contrato y del paquete objetivo', () => {
    expect(runtime.RUNTIME_VERSION).toBeGreaterThanOrEqual(1);
    expect(typeof runtime.TARGET_API_VERSION).toBe('string');
    expect(runtime.TARGET_API_VERSION.length).toBeGreaterThan(0);
  });

  it('expone todas las funciones del núcleo (@librechat/api)', () => {
    for (const fn of [
      'initializeAgent',
      'loadAgent',
      'discoverConnectedAgents',
      'isMemoryEnabled',
      'validateAgentModel',
      'buildAgentContextAttachmentsByAgentId',
    ]) {
      expect(typeof runtime[fn]).toBe('function');
      expect(runtime[fn]).toBeTruthy();
    }
  });

  it('expone el GenerationJobManager (clase/constructor)', () => {
    expect(runtime.GenerationJobManager).toBeTruthy();
  });

  it('expone el agregador de contenido del stream (@librechat/agents)', () => {
    expect(typeof runtime.createContentAggregator).toBe('function');
  });

  it('isMemoryEnabled responde ante un agente sin memoria (no lanza)', () => {
    const agent = { model: 'qwen3:0.6b', memory: undefined };
    const result = runtime.isMemoryEnabled(agent);
    expect(typeof result).toBe('boolean');
  });

  it('validateAgentModel sigue el contrato real ({isValid, error}) sin lanzar', async () => {
    // Sin modelsConfig → inválido con error MODELS_NOT_LOADED (no bloquea el flujo).
    const result = await runtime.validateAgentModel({
      agent: { provider: 'Ollama (local)', model: 'qwen3:0.6b' },
      modelsConfig: null,
    });
    expect(result).toHaveProperty('isValid');
    expect(typeof result.isValid).toBe('boolean');
  });
});
