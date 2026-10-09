/**
 * Tests unitarios de AgentRouting (FASE 25).
 * Ejecutar con el toolchain del repo (bun/jest) desde la raíz de api/:
 *   NODE_ENV=test jest server/services/AgentRouting.spec.js
 */

const {
  pickTier,
  lastUserText,
  estimateTokens,
  estimateMessagesTokens,
  isModelValid,
  CONTEXT_ESCALATE,
  CONTEXT_FORCE_LARGE,
} = require('./AgentRouting');

describe('pickTier (heurística de complejidad)', () => {
  it('clasifica consultas cortas como small', () => {
    expect(pickTier('hola')).toBe('small');
    expect(pickTier('que es 2+2')).toBe('small');
  });

  it('clasifica tareas técnicas como medium', () => {
    expect(pickTier('escribe una consulta sql para esta tabla')).toBe('medium');
    expect(pickTier('hazme una funcion que sume numeros en codigo')).toBe('medium');
  });

  it('clasifica refactor/auditoría como large', () => {
    expect(pickTier('refactoriza este codigo')).toBe('large');
    expect(pickTier('analiza el código y propón una auditoría')).toBe('large');
    expect(pickTier('```\nconst x = 1;\n```')).toBe('large');
  });

  it('texto largo (>=600 chars) es large', () => {
    expect(pickTier('a'.repeat(620))).toBe('large');
  });

  it('presupuesto de contexto escala hacia arriba', () => {
    // Sin contexto → small
    expect(pickTier('hola', 0)).toBe('small');
    // Contexto grande → sube un nivel
    expect(pickTier('hola', CONTEXT_ESCALATE)).toBe('medium');
    // Contexto enorme → fuerza large
    expect(pickTier('hola', CONTEXT_FORCE_LARGE)).toBe('large');
    expect(pickTier('sql', CONTEXT_FORCE_LARGE)).toBe('large');
  });
});

describe('lastUserText', () => {
  it('extrae el último texto de usuario (string)', () => {
    const messages = [
      { role: 'assistant', content: 'hola' },
      { role: 'user', content: 'dime que es 2+2' },
    ];
    expect(lastUserText(messages)).toBe('dime que es 2+2');
  });

  it('extrae de content complejo (array de partes)', () => {
    const messages = [
      { role: 'user', content: [{ type: 'text', text: 'primero' }] },
      { role: 'user', content: [{ type: 'text', text: 'segundo' }] },
    ];
    expect(lastUserText(messages)).toBe('segundo');
  });

  it('devuelve vacío si no hay mensajes de usuario', () => {
    expect(lastUserText([{ role: 'assistant', content: 'x' }])).toBe('');
    expect(lastUserText([])).toBe('');
  });
});

describe('estimateTokens / estimateMessagesTokens', () => {
  it('estima ~1 token por cada 4 caracteres', () => {
    expect(estimateTokens('a'.repeat(8))).toBe(2);
    expect(estimateTokens('')).toBe(0);
  });

  it('suma los tokens de todos los mensajes', () => {
    const messages = [
      { role: 'user', content: 'a'.repeat(8) }, // 2
      { role: 'assistant', content: 'b'.repeat(8) }, // 2
      { role: 'user', content: [{ type: 'text', text: 'c'.repeat(8) }] }, // 2
    ];
    expect(estimateMessagesTokens(messages)).toBe(6);
  });
});

describe('isModelValid', () => {
  const agent = { provider: 'Ollama (local)', model: 'qwen3:0.6b' };

  it('acepta un modelo presente en la lista del endpoint', () => {
    const modelsConfig = { 'Ollama (local)': ['qwen3:0.6b', 'qwen3:1.7b'] };
    expect(isModelValid(agent, 'qwen3:0.6b', modelsConfig)).toBe(true);
  });

  it('rechaza un modelo que no existe en el endpoint', () => {
    const modelsConfig = { 'Ollama (local)': ['qwen3:0.6b'] };
    expect(isModelValid(agent, 'modelo-inexistente', modelsConfig)).toBe(false);
  });

  it('permite cuando no hay config o el endpoint es desconocido (no bloquea)', () => {
    expect(isModelValid(agent, 'x', null)).toBe(true);
    expect(isModelValid(agent, 'x', {})).toBe(true);
    expect(isModelValid(agent, 'x', { otro: ['x'] })).toBe(true);
  });
});
