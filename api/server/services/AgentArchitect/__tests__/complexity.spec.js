/**
 * complexity.spec.js — tests unitarios del analizador determinista de
 * complejidad (FASE 2: escalado dinámico del planner).
 *
 * Verifica el mapeo tarea → tier → rango de agentes:
 *   simple → 1–3, medium → 4–5, complex → 6–14 (hasta ~15),
 *   extremely_complex → 15–20.
 * 100% determinista (sin LLM ni red).
 *
 * Ejecutar:
 *   NODE_ENV=test node_modules/.bin/jest server/services/AgentArchitect/__tests__/complexity.spec.js
 */

const { analyzeComplexity, buildTierGuidance, TIERS } = require('../complexity');
const { MAX_AGENTS } = require('../schemas');

/** Tarea que crece en complejidad en tiempo real: se construye concatenando
 *  sub-tareas, simulando que el usuario amplía el alcance mientras trabaja. */
const EXTREMELY_COMPLEX_BASE = [
  'Construye una plataforma web completa para gestionar proyectos creativos:',
  '1. Diseña la interfaz con React, CSS y componentes accesibles.',
  '2. Implementa el backend en Node con MongoDB, caché y colas de tareas.',
  '3. Añade autenticación, permisos por rol y auditoría de seguridad.',
  '4. Crea pruebas unitarias y E2E con cobertura superior al 80%.',
  '5. Despliega el sistema en Docker con un contenedor por servicio y Kubernetes para escalar.',
  '6. Documenta la arquitectura, la API y un manual de usuario.',
  '7. Integra un modelo de IA (LLM local) para recomendaciones y resúmenes.',
  '8. Genera imágenes con ComfyUI, videos cortos de animación y audio TTS con voz local.',
  '9. Investiga fuentes oficiales y cita la evidencia en el informe final.',
  '10. Verifica la regresión de todos los módulos y optimiza el consumo de RAM y CPU.',
].join('\n');

describe('analyzeComplexity — mapeo por tier', () => {
  it('clasifica una tarea trivial como simple (1–3 agentes)', () => {
    const r = analyzeComplexity('Resume este documento');
    expect(r.tier).toBe('simple');
    expect(r.range).toEqual({ min: 1, max: 3 });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThan(3);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('clasifica una tarea corta de un solo dominio como simple', () => {
    const r = analyzeComplexity('Traduce este texto al inglés');
    expect(r.tier).toBe('simple');
    expect(r.range.min).toBeLessThanOrEqual(3);
  });

  it('clasifica una tarea multi-dominio con ejecución como medium (4–5 agentes)', () => {
    const r = analyzeComplexity(
      'Investiga las mejores prácticas de seguridad en APIs REST y escribe un informe detallado con citas de fuentes oficiales, ejemplos de código en Python y una sección de pruebas de vulnerabilidades.',
    );
    expect(r.tier).toBe('medium');
    expect(r.range).toEqual({ min: 4, max: 5 });
    expect(r.score).toBeGreaterThanOrEqual(3);
    expect(r.score).toBeLessThan(6);
    // multi-dominio detectado (research, security, code, docs, testing)
    expect(r.reasons.some((x) => x.includes('dominios'))).toBe(true);
  });

  it('clasifica una tarea grande de plataforma completa como complex (6–14 agentes)', () => {
    const r = analyzeComplexity(EXTREMELY_COMPLEX_BASE.split('\n').slice(0, 6).join('\n'));
    expect(r.tier).toBe('complex');
    expect(r.range.min).toBeGreaterThanOrEqual(6);
    expect(r.range.max).toBeLessThanOrEqual(14);
    expect(r.score).toBeGreaterThanOrEqual(6);
    expect(r.score).toBeLessThan(9);
  });

  it('clasifica una tarea multimodal extremadamente extensa como extremely_complex (15–20)', () => {
    const r = analyzeComplexity(
      `${EXTREMELY_COMPLEX_BASE}\n\nNo sé por dónde empezar: ayúdame a decidir el orden de los módulos, coordina varios equipos, gestiona el presupuesto de contexto y valida cada entregable contra los requisitos antes de terminar.`,
    );
    expect(r.tier).toBe('extremely_complex');
    expect(r.range.min).toBeGreaterThanOrEqual(15);
    expect(r.range.max).toBe(20);
    expect(r.score).toBeGreaterThanOrEqual(9);
  });

  it('los rangos nunca exceden MAX_AGENTS (guardrail duro)', () => {
    for (const task of ['hola', EXTREMELY_COMPLEX_BASE]) {
      const r = analyzeComplexity(task);
      expect(r.range.max).toBeLessThanOrEqual(MAX_AGENTS);
      expect(r.range.min).toBeLessThanOrEqual(r.range.max);
    }
  });

  it('tarea vacía → simple sin romper', () => {
    const r = analyzeComplexity('');
    expect(r.tier).toBe('simple');
    expect(r.range.max).toBeLessThanOrEqual(3);
  });
});

describe('analyzeComplexity — escalado dinámico (tarea que crece)', () => {
  it('el tier nunca baja al añadir más sub-tareas (monótono no decreciente)', () => {
    const order = { simple: 0, medium: 1, complex: 2, extremely_complex: 3 };
    // El crecimiento incluye la parte final de coordinación/ambigüedad para
    // alcanzar el tier extremadamente complejo (15–20).
    const parts = [
      ...EXTREMELY_COMPLEX_BASE.split('\n'),
      'No sé por dónde empezar: ayúdame a decidir el orden de los módulos, coordina varios equipos, gestiona el presupuesto de contexto y valida cada entregable contra los requisitos antes de terminar.',
    ];
    let last = -1;
    for (let i = 1; i <= parts.length; i += 1) {
      const r = analyzeComplexity(parts.slice(0, i).join('\n'));
      const idx = order[r.tier];
      expect(idx).toBeGreaterThanOrEqual(last);
      last = idx;
    }
    // Al final del crecimiento debe llegar al tier máximo.
    expect(last).toBe(order.extremely_complex);
  });

  it('el rango recomendado crece con la complejidad (1→4→6→15)', () => {
    const r1 = analyzeComplexity('Resume este documento');
    const r2 = analyzeComplexity(
      'Investiga las mejores prácticas de seguridad en APIs REST y escribe un informe detallado con citas de fuentes oficiales, ejemplos de código en Python y una sección de pruebas de vulnerabilidades.',
    );
    const r3 = analyzeComplexity(EXTREMELY_COMPLEX_BASE.split('\n').slice(0, 6).join('\n'));
    const r4 = analyzeComplexity(
      `${EXTREMELY_COMPLEX_BASE}\n\nNo sé por dónde empezar: ayúdame a decidir el orden de los módulos, coordina varios equipos, gestiona el presupuesto de contexto y valida cada entregable contra los requisitos antes de terminar.`,
    );
    expect(r1.range.min).toBeLessThan(r2.range.min);
    expect(r2.range.min).toBeLessThan(r3.range.min);
    expect(r3.range.min).toBeLessThan(r4.range.min);
  });
});

describe('buildTierGuidance — guía inyectada al modelo', () => {
  it('incluye el tier, el rango y el límite duro', () => {
    const r = analyzeComplexity('Resume este documento');
    const guidance = buildTierGuidance(r);
    expect(guidance).toContain('Simple');
    expect(guidance).toContain('1–3');
    expect(guidance).toContain(`Nunca superes ${MAX_AGENTS}`);
  });

  it('es coherente con TIERS exportado', () => {
    for (const key of ['simple', 'medium', 'complex', 'extremely_complex']) {
      expect(TIERS[key]).toBeDefined();
      expect(TIERS[key].min).toBeLessThanOrEqual(TIERS[key].max);
    }
  });
});
