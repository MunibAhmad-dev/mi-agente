/**
 * deepResearch.js — FASE 6: Deep Research para agentes.
 *
 * Convierte una pregunta en una investigación con fuentes verificables:
 *
 *   1. Descompone la pregunta en sub-búsquedas (determinista, sin LLM).
 *   2. Recolecta fuentes con el motor universal real (UniversalSearchService:
 *      SearchRuntime DuckDuckGo→Bing, sin API keys).
 *   3. Deduplica por URL y rankea por relevancia + autoridad + confiabilidad.
 *   4. Numera las fuentes [1], [2], … para que la respuesta las cite.
 *   5. Verifica cada sub-consulta (veredicto CORROBORATED / CONTRADICTED /
 *      SINGLE_SOURCE / NO_EVIDENCE) con corroboración entre dominios.
 *   6. Redacta la respuesta final citando las fuentes con el LLM local; si el
 *      LLM no está disponible, genera una respuesta determinista con citas
 *      (nunca inventa fuentes: siempre cita números que existen en la lista).
 *
 * Dependencias inyectables (`opts.search/verify/synthesize`) para tests; por
 * defecto usa los servicios reales del proyecto (cargados de forma perezosa
 * para que los tests unitarios no dependan del alias `~` ni de la red).
 */

const DEFAULT_MAX_SUBQUERIES = 4;
const DEFAULT_MAX_SOURCES = 8;
const DEFAULT_MAX_EVIDENCE = 5;

/* ------------------------------------------------------------------ */
/* 1. Descomposición de la pregunta                                   */
/* ------------------------------------------------------------------ */

const STOP_WORDS = new Set([
  'que',
  'qué',
  'para',
  'con',
  'una',
  'uno',
  'como',
  'cómo',
  'del',
  'las',
  'los',
  'the',
  'and',
  'with',
  'what',
  'when',
  'where',
  'which',
  'who',
  'this',
  'that',
  'sobre',
  'entre',
  'desde',
  'hasta',
  'por',
  'pero',
  'mas',
  'más',
]);

/** Palabras clave de la pregunta para medir relevancia de cada fuente. */
function questionKeywords(text = '') {
  return [
    ...new Set(
      String(text)
        .toLowerCase()
        .replace(/[^\wáéíóúñü\s-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOP_WORDS.has(w)),
    ),
  ].slice(0, 8);
}

/**
 * Divide una pregunta en sub-búsquedas independientes. Estrategia:
 *   · separadores fuertes: "?" (preguntas múltiples), ";" y " y "/" and "
 *     (conjunciones que unen dos temas);
 *   · la pregunta original siempre queda primero;
 *   · se respeta un máximo (maxSubQueries).
 */
function decomposeQuestion(question, maxSubQueries = DEFAULT_MAX_SUBQUERIES) {
  const q = String(question || '').trim();
  if (!q) {
    return [];
  }
  let parts = [q];
  if ((q.match(/\?/g) || []).length > 1) {
    parts = q
      .split(/\?/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s.endsWith('?') ? s : `${s}?`));
  } else {
    const chunks = [];
    for (const chunk of q.split(';')) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;
      const andParts = trimmed.split(/\s+y\s+|\s+and\s+/i);
      if (andParts.length > 1) {
        chunks.push(trimmed);
        for (const p of andParts) {
          const sp = p.trim();
          if (sp && sp.length >= 6) chunks.push(sp);
        }
      } else {
        chunks.push(trimmed);
      }
    }
    parts = [...new Set(chunks)];
  }
  // Dedupe conservando orden y recorta al máximo.
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
    if (out.length >= maxSubQueries) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Carga perezosa de los servicios reales del proyecto                 */
/* ------------------------------------------------------------------ */

let _real = null;
/**
 * Devuelve (con memoización) los servicios reales del UniversalSearchService.
 * Se resuelve en el primer uso real, nunca en import: los tests inyectan sus
 * propias dependencias y así jest no necesita el alias `~` ni la red.
 */
function realServices() {
  if (!_real) {
    _real = require('../UniversalSearch/UniversalSearchService');
  }
  return _real;
}

/* ------------------------------------------------------------------ */
/* 2–4. Recolección, dedup, ranking y numeración                       */
/* ------------------------------------------------------------------ */

/** Score de relevancia léxica entre la pregunta y el snippet/título. */
function relevanceToQuestion(keywords, text = '') {
  const t = String(text).toLowerCase();
  return keywords.reduce((acc, k) => acc + (t.includes(k) ? 1 : 0), 0);
}

/**
 * Ejecuta todas las sub-búsquedas, deduplica por URL y rankea.
 * `search` inyectable (default: universalSearch real, cargado perezoso).
 */
async function collectSources(
  subQueries,
  { search, maxSources = DEFAULT_MAX_SOURCES, questionKeywordsList = [] } = {},
) {
  // Los servicios reales solo se cargan cuando NO hay dependencia inyectada
  // (los tests siempre inyectan, así jest nunca toca el alias `~`).
  let searchFn = search;
  let profileFn = null;
  if (!searchFn) {
    const real = realServices();
    searchFn = real.universalSearch;
    profileFn = real.getSourceProfile;
  }
  const byUrl = new Map(); // url -> entry
  const searchErrors = [];
  for (const subQuery of subQueries) {
    let res;
    try {
      res = await searchFn(subQuery, { maxResults: 8 });
    } catch (error) {
      searchErrors.push({ subQuery, error: error?.message || String(error) });
      continue;
    }
    for (const r of res?.results || []) {
      const url = String(r.url || '').trim();
      if (!url || byUrl.has(url)) continue;
      const profile = profileFn ? profileFn(url) : null;
      byUrl.set(url, {
        title: String(r.title || '').trim(),
        url,
        snippet: String(r.snippet || '').trim(),
        source: r.source || profile?.name || 'web',
        domain: profile?.domain || '',
        type: profile?.type || 'unknown',
        authority: profile?.authority ?? 0.4,
        reliability: profile?.reliability ?? 0.5,
        subQuery,
      });
    }
  }

  const ranked = [...byUrl.values()]
    .map((s) => ({
      ...s,
      relevance: relevanceToQuestion(questionKeywordsList, `${s.title} ${s.snippet}`),
    }))
    .sort((a, b) => {
      // 1) relevancia contra la pregunta, 2) autoridad, 3) confiabilidad.
      if (b.relevance !== a.relevance) return b.relevance - a.relevance;
      if (b.authority !== a.authority) return b.authority - a.authority;
      return b.reliability - a.reliability;
    })
    .slice(0, maxSources)
    .map((s, i) => ({ index: i + 1, ...s }));

  return { sources: ranked, searchErrors, totalRaw: byUrl.size };
}

/* ------------------------------------------------------------------ */
/* 5. Verificación factual por sub-consulta                            */
/* ------------------------------------------------------------------ */

/** `verify` inyectable (default: verifyClaim real, cargado perezoso). */
async function verifySubQueries(subQueries, { verify, maxEvidence = DEFAULT_MAX_EVIDENCE } = {}) {
  const verifyFn = verify || realServices().verifyClaim;
  const verification = [];
  const verifyErrors = [];
  for (const subQuery of subQueries) {
    try {
      const v = await verifyFn(subQuery, { maxResults: maxEvidence });
      if (!v || v.success === false) {
        verifyErrors.push({ subQuery, error: v?.error || 'verificación sin éxito' });
        continue;
      }
      verification.push({
        subQuery,
        verdict: v.verdict,
        confidence: v.confidence,
        independentSupportingSources: v.independentSupportingSources,
        independentContradictingSources: v.independentContradictingSources,
        domainBreakdown: v.domainBreakdown || [],
        note: v.note,
      });
    } catch (error) {
      verifyErrors.push({ subQuery, error: error?.message || String(error) });
    }
  }
  return { verification, verifyErrors };
}

/* ------------------------------------------------------------------ */
/* 6. Respuesta con citas [n]                                         */
/* ------------------------------------------------------------------ */

/** Respuesta determinista de respaldo con citas reales [n]. */
function buildFallbackAnswer(question, sources) {
  if (!sources.length) {
    return 'No se encontraron fuentes suficientes para responder con citas.';
  }
  const top = sources.slice(0, 3);
  const lines = top
    .map(
      (s) =>
        `[${s.index}] ${s.title} — ${String(s.snippet || s.domain).slice(0, 180)} (${s.domain || s.source})`,
    )
    .join('\n');
  return (
    `Respuesta basada en las fuentes consultadas (${top.length} citadas; ver lista completa abajo).\n` +
    `Fuentes citadas:\n${lines}`
  );
}

/**
 * Redacta la respuesta final citando [n]. `synthesize` inyectable (default:
 * synthesizeAnswer real con LLM local). Si el LLM no responde, cae al
 * respaldo determinista — nunca devuelve una respuesta sin numeración que
 * no exista en la lista de fuentes.
 */
async function buildAnswer(
  question,
  sources,
  { synthesize, maxEvidence = DEFAULT_MAX_EVIDENCE } = {},
) {
  const evidence = sources.slice(0, maxEvidence).map((s) => ({
    title: s.title,
    snippet: s.snippet,
    domain: s.domain || s.source,
  }));
  const synthFn = synthesize || realServices().synthesizeAnswer;
  let answer = null;
  try {
    answer = await synthFn(question, { evidence });
  } catch {
    answer = null;
  }
  if (answer && typeof answer === 'string' && answer.trim()) {
    return answer.trim();
  }
  return buildFallbackAnswer(question, sources);
}

/* ------------------------------------------------------------------ */
/* Orquestación                                                        */
/* ------------------------------------------------------------------ */

/**
 * Punto de entrada de la FASE 6. Devuelve un reporte de investigación:
 * subQueries, fuentes numeradas [n], verificación por sub-consulta y la
 * respuesta final con citas.
 */
async function deepResearch(question, opts = {}) {
  const {
    maxSubQueries = DEFAULT_MAX_SUBQUERIES,
    maxSources = DEFAULT_MAX_SOURCES,
    maxEvidence = DEFAULT_MAX_EVIDENCE,
    tokenBudget = null, // character cap fed to the LLM synthesizer
    search,
    verify,
    synthesize,
  } = opts;
  const q = String(question || '').trim();
  if (!q) {
    return {
      success: false,
      error: 'Pregunta vacía. Proporciona una pregunta de investigación.',
      question: '',
      subQueries: [],
      sources: [],
      verification: [],
      answer: null,
    };
  }

  const subQueries = decomposeQuestion(q, maxSubQueries);
  const keywords = questionKeywords(q);

  const { sources, searchErrors, totalRaw } = await collectSources(subQueries, {
    search,
    maxSources,
    questionKeywordsList: keywords,
  });

  // Enforce token budget: truncate snippets so total evidence fed to the LLM
  // stays under the caller's character limit (quick=4k, standard=12k, deep=32k).
  let budgetedSources = sources;
  if (tokenBudget && tokenBudget > 0) {
    let remaining = tokenBudget;
    budgetedSources = [];
    for (const s of sources) {
      if (remaining <= 0) break;
      const snippetAlloc = Math.min(s.snippet.length, Math.floor(remaining / Math.max(sources.length, 1)));
      budgetedSources.push({ ...s, snippet: s.snippet.slice(0, snippetAlloc) });
      remaining -= snippetAlloc;
    }
  }

  const { verification, verifyErrors } = await verifySubQueries(subQueries, {
    verify,
    maxEvidence,
  });
  const answer = await buildAnswer(q, budgetedSources, { synthesize, maxEvidence });

  return {
    success: true,
    question: q,
    subQueries,
    sources: budgetedSources,
    verification,
    answer,
    stats: {
      subQueries: subQueries.length,
      rawResults: totalRaw,
      sourcesKept: budgetedSources.length,
      searchErrors: searchErrors.length,
      verifyErrors: verifyErrors.length,
      tokenBudgetApplied: tokenBudget || null,
    },
    instructions:
      'Responde usando `answer` y cita las fuentes con [n] EXACTAMENTE como están numeradas en `sources`. ' +
      'Si `answer` es null, redacta con `sources` y cita los números [n]. Nunca cites un número que no exista.',
  };
}

module.exports = {
  deepResearch,
  decomposeQuestion,
  questionKeywords,
  collectSources,
  verifySubQueries,
  buildAnswer,
  buildFallbackAnswer,
  DEFAULT_MAX_SUBQUERIES,
  DEFAULT_MAX_SOURCES,
  DEFAULT_MAX_EVIDENCE,
};
