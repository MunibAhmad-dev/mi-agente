/**
 * deepResearch.spec.js — FASE 6: Deep Research para agentes.
 * Tests unitarios con dependencias inyectadas (sin red): descomposición,
 * dedup por URL, ranking, verificación por sub-consulta y respuesta con
 * citas [n] (LLM y respaldo determinista).
 */
const {
  deepResearch,
  decomposeQuestion,
  questionKeywords,
  collectSources,
  verifySubQueries,
  buildAnswer,
  buildFallbackAnswer,
} = require('../deepResearch');

const src = (url, title, snippet, extra = {}) => ({
  url,
  title,
  snippet,
  source: extra.source || 'web',
  ...extra,
});

describe('decomposeQuestion', () => {
  it('mantiene la pregunta original primero', () => {
    const parts = decomposeQuestion('¿Qué es Ollama?');
    expect(parts[0]).toBe('¿Qué es Ollama?');
    expect(parts.length).toBe(1);
  });

  it('divide preguntas múltiples con "?"', () => {
    const parts = decomposeQuestion('¿Qué es Ollama? ¿Cómo se instala?');
    expect(parts.length).toBe(2);
    expect(parts[0]).toContain('Ollama');
    expect(parts[1]).toContain('instala');
  });

  it('divide conjunciones "y" en sub-búsquedas', () => {
    const parts = decomposeQuestion('historia de Linux y funcionamiento del kernel');
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.some((p) => p.includes('Linux'))).toBe(true);
    expect(parts.some((p) => p.includes('kernel'))).toBe(true);
  });

  it('divide con punto y coma', () => {
    const parts = decomposeQuestion('resume el proyecto; lista sus dependencias');
    expect(parts.length).toBeGreaterThanOrEqual(2);
  });

  it('respeta el máximo de sub-búsquedas', () => {
    const parts = decomposeQuestion('¿Qué es A? ¿Qué es B? ¿Qué es C? ¿Qué es D? ¿Qué es E?', 3);
    expect(parts.length).toBe(3);
  });

  it('devuelve [] para entrada vacía', () => {
    expect(decomposeQuestion('')).toEqual([]);
    expect(decomposeQuestion(undefined)).toEqual([]);
  });
});

describe('questionKeywords', () => {
  it('extrae palabras significativas sin stop words', () => {
    const kw = questionKeywords('¿Cómo funciona el kernel de Linux con memoria virtual?');
    expect(kw).toContain('kernel');
    expect(kw).toContain('linux');
    expect(kw).toContain('memoria');
    expect(kw).not.toContain('con');
    expect(kw).not.toContain('que');
  });
});

describe('collectSources', () => {
  const search = async (q) => ({
    results: [
      src('https://a.com/x', 'A sobre ' + q, 'detalle de ' + q),
      src('https://b.com/y', 'B distinto', 'otro contenido'),
    ],
  });

  it('deduplica por URL cuando dos sub-búsquedas devuelven la misma', async () => {
    const dupSearch = async () => ({
      results: [src('https://same.com/1', 'Mismo', 'el mismo resultado')],
    });
    const { sources, totalRaw } = await collectSources(['q1', 'q2'], { search: dupSearch });
    expect(totalRaw).toBe(1);
    expect(sources.length).toBe(1);
    expect(sources[0].url).toBe('https://same.com/1');
  });

  it('rankea por relevancia y numera [1..n]', async () => {
    const { sources } = await collectSources(['kernel linux memoria virtual'], {
      search,
      questionKeywordsList: questionKeywords('kernel linux memoria virtual'),
    });
    expect(sources.length).toBe(2);
    expect(sources[0].index).toBe(1);
    expect(sources[1].index).toBe(2);
    // El resultado que menciona la consulta queda primero.
    expect(sources[0].relevance).toBeGreaterThanOrEqual(sources[1].relevance);
  });

  it('reporta errores de búsqueda sin romper', async () => {
    const failingSearch = async (q) => {
      if (q === 'q1') throw new Error('timeout');
      return { results: [src('https://ok.com/1', 'OK', 'ok')] };
    };
    const { sources, searchErrors } = await collectSources(['q1', 'q2'], {
      search: failingSearch,
    });
    expect(searchErrors.length).toBe(1);
    expect(sources.length).toBe(1);
  });
});

describe('verifySubQueries', () => {
  it('verifica cada sub-consulta y reporta veredictos', async () => {
    const verify = async (claim) => ({
      success: true,
      claim,
      verdict: 'CORROBORATED',
      confidence: 0.8,
      independentSupportingSources: 2,
      independentContradictingSources: 0,
      domainBreakdown: [{ domain: 'wikipedia.org', supporting: 2 }],
    });
    const { verification, verifyErrors } = await verifySubQueries(['q1', 'q2'], { verify });
    expect(verification.length).toBe(2);
    expect(verification[0].verdict).toBe('CORROBORATED');
    expect(verifyErrors.length).toBe(0);
  });

  it('tolera fallos de verificación por sub-consulta', async () => {
    const verify = async () => {
      throw new Error('rate limited');
    };
    const { verification, verifyErrors } = await verifySubQueries(['q1'], { verify });
    expect(verification.length).toBe(0);
    expect(verifyErrors.length).toBe(1);
  });
});

describe('buildAnswer', () => {
  const sources = [
    { index: 1, title: 'Fuente A', snippet: 'texto A', domain: 'a.org' },
    { index: 2, title: 'Fuente B', snippet: 'texto B', domain: 'b.org' },
  ];

  it('usa la síntesis del LLM cuando responde', async () => {
    const synth = async () => 'Según [1] y [2], la respuesta es X.';
    const answer = await buildAnswer('¿Pregunta?', sources, { synthesize: synth });
    expect(answer).toContain('[1]');
    expect(answer).toContain('[2]');
  });

  it('cae al respaldo determinista con citas reales si el LLM falla', async () => {
    const failingSynth = async () => {
      throw new Error('ollama down');
    };
    const answer = await buildAnswer('¿Pregunta?', sources, { synthesize: failingSynth });
    expect(answer).toContain('[1]');
    expect(answer).toContain('Fuente A');
  });

  it('el respaldo devuelve mensaje honesto sin fuentes', () => {
    expect(buildFallbackAnswer('q', [])).toContain('No se encontraron');
  });
});

describe('deepResearch (flujo completo, DI)', () => {
  it('produce subQueries + fuentes numeradas + verificación + respuesta con citas', async () => {
    const search = async () => ({
      results: [src('https://x.org/1', 'Doc X', 'contenido sobre el tema')],
    });
    const verify = async (claim) => ({
      success: true,
      claim,
      verdict: 'CORROBORATED',
      confidence: 0.7,
      independentSupportingSources: 2,
      independentContradictingSources: 0,
    });
    const synthesize = async () => 'Resumen con [1].';
    const report = await deepResearch('¿Qué es el tema principal?', {
      search,
      verify,
      synthesize,
    });
    expect(report.success).toBe(true);
    expect(report.subQueries.length).toBeGreaterThanOrEqual(1);
    expect(report.sources.length).toBeGreaterThanOrEqual(1);
    expect(report.sources[0].index).toBe(1);
    expect(report.verification.length).toBeGreaterThanOrEqual(1);
    expect(report.answer).toContain('[1]');
    expect(report.stats.sourcesKept).toBe(report.sources.length);
  });

  it('nunca cita un número de fuente inexistente en el respaldo', async () => {
    const search = async () => ({
      results: [src('https://only.org/1', 'Solo', 'único resultado')],
    });
    const verify = async () => ({ success: true, verdict: 'NO_EVIDENCE', confidence: 0 });
    const synthesize = async () => null;
    const report = await deepResearch('pregunta', { search, verify, synthesize });
    const cited = [...report.answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    for (const n of cited) {
      expect(report.sources.some((s) => s.index === n)).toBe(true);
    }
  });

  it('reporta error honesto para pregunta vacía', async () => {
    const report = await deepResearch('   ', {});
    expect(report.success).toBe(false);
    expect(report.error).toBeTruthy();
  });
});
