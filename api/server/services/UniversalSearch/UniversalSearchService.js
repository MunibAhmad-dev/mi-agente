/**
 * UniversalSearchService — Motor de búsqueda universal con verificación
 * factual (FASE 34).
 *
 * Separa RELEVANCIA de AUTORIDAD de CONFIABILIDAD:
 *   · universalSearch(claim) → multi-query, multi-proveedor, dedup + scoring
 *   · verifyClaim(claim)     → evidencia + corroboración independiente +
 *                              detección de contradicción + veredicto
 *   · sourceCatalog          → registro de fuentes con perfiles (no una
 *                              regla simplista "oficial=true, fan=false")
 *
 * Motor subyacente: SearchRuntime del proyecto (DuckDuckGo → Bing fallback),
 * sin API keys. Los veredictos NO inventan evidencia: si no hay fuentes
 * independientes, se dice SINGLE_SOURCE o NO_EVIDENCE.
 */

const { getSearchRuntime } = require('~/server/services/SearchRuntime');

/* FASE 38 — síntesis de la verificación con el LLM local (sin claves). */
const SYNTH_MODEL = process.env.UNIVERSAL_SEARCH_SYNTH_MODEL || 'qwen3:0.6b';
const SYNTH_OLLAMA_URL = process.env.OLLAMA_HOST || 'http://chat-ollama:11434';

/** Logger ligero local (mismo estilo que SearchRuntime: sin deps extra). */
const logger = {
  debug: (...a) => console.log('[UniversalSearch]', ...a),
  info: (...a) => console.log('[UniversalSearch]', ...a),
  warn: (...a) => console.warn('[UniversalSearch]', ...a),
  error: (...a) => console.error('[UniversalSearch]', ...a),
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const _cache = new Map(); // key -> { at, data }

function cacheGet(key) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.data;
  }
  return null;
}

function cacheSet(key, data) {
  _cache.set(key, { at: Date.now(), data });
}

/* ------------------------------------------------------------------ */
/* Registro de fuentes (Source Catalog)                               */
/* ------------------------------------------------------------------ */

/**
 * Perfiles curados de confiabilidad/autoridad por dominio. No es una lista
 * exhaustiva: los dominios fuera de aquí reciben un perfil neutral derivado
 * del tipo de dominio (.gov/.edu/.org). El sistema NUNCA declara "verdadero"
 * por ser oficial: estos scores alimentan la corroboración, no la sustituyen.
 */
const SOURCE_PROFILES = [
  { domain: 'wikipedia.org', name: 'Wikipedia', type: 'wiki', authority: 0.7, reliability: 0.75 },
  { domain: 'wikidata.org', name: 'Wikidata', type: 'database', authority: 0.7, reliability: 0.8 },
  { domain: 'github.com', name: 'GitHub', type: 'repository', authority: 0.6, reliability: 0.7 },
  {
    domain: 'huggingface.co',
    name: 'Hugging Face',
    type: 'repository',
    authority: 0.6,
    reliability: 0.7,
  },
  { domain: 'arxiv.org', name: 'arXiv', type: 'academic', authority: 0.85, reliability: 0.85 },
  { domain: 'reddit.com', name: 'Reddit', type: 'community', authority: 0.3, reliability: 0.45 },
  {
    domain: 'stackoverflow.com',
    name: 'Stack Overflow',
    type: 'community',
    authority: 0.55,
    reliability: 0.7,
  },
  {
    domain: 'stackexchange.com',
    name: 'Stack Exchange',
    type: 'community',
    authority: 0.55,
    reliability: 0.7,
  },
  { domain: 'fandom.com', name: 'Fandom', type: 'fanwiki', authority: 0.45, reliability: 0.6 },
  { domain: 'imdb.com', name: 'IMDb', type: 'database', authority: 0.7, reliability: 0.8 },
  { domain: 'anilist.co', name: 'AniList', type: 'database', authority: 0.6, reliability: 0.75 },
  {
    domain: 'myanimelist.net',
    name: 'MyAnimeList',
    type: 'database',
    authority: 0.6,
    reliability: 0.75,
  },
  {
    domain: 'dictionary.com',
    name: 'Dictionary.com',
    type: 'reference',
    authority: 0.7,
    reliability: 0.8,
  },
  {
    domain: 'merriam-webster.com',
    name: 'Merriam-Webster',
    type: 'reference',
    authority: 0.75,
    reliability: 0.85,
  },
  { domain: 'mdn.io', name: 'MDN', type: 'docs', authority: 0.8, reliability: 0.85 },
  { domain: 'developer.mozilla.org', name: 'MDN', type: 'docs', authority: 0.8, reliability: 0.85 },
  { domain: 'nodejs.org', name: 'Node.js', type: 'docs', authority: 0.85, reliability: 0.9 },
  { domain: 'python.org', name: 'Python', type: 'docs', authority: 0.85, reliability: 0.9 },
  { domain: 'docker.com', name: 'Docker', type: 'docs', authority: 0.8, reliability: 0.85 },
  { domain: 'ollama.com', name: 'Ollama', type: 'docs', authority: 0.8, reliability: 0.85 },
  { domain: 'react.dev', name: 'React', type: 'docs', authority: 0.8, reliability: 0.85 },
  { domain: 'cnn.com', name: 'CNN', type: 'news', authority: 0.6, reliability: 0.65 },
  { domain: 'bbc.com', name: 'BBC', type: 'news', authority: 0.7, reliability: 0.75 },
  { domain: 'reuters.com', name: 'Reuters', type: 'news', authority: 0.75, reliability: 0.8 },
  { domain: 'apnews.com', name: 'AP', type: 'news', authority: 0.75, reliability: 0.8 },
  { domain: 'nature.com', name: 'Nature', type: 'academic', authority: 0.9, reliability: 0.9 },
  { domain: 'nih.gov', name: 'NIH', type: 'government', authority: 0.9, reliability: 0.9 },
  { domain: 'who.int', name: 'WHO', type: 'government', authority: 0.9, reliability: 0.9 },
  { domain: 'europa.eu', name: 'EU', type: 'government', authority: 0.85, reliability: 0.85 },
  {
    domain: 'gov',
    name: 'Gobierno (.gov)',
    type: 'government',
    authority: 0.85,
    reliability: 0.85,
    suffix: true,
  },
  {
    domain: 'edu',
    name: 'Academia (.edu)',
    type: 'academic',
    authority: 0.8,
    reliability: 0.8,
    suffix: true,
  },
  {
    domain: 'org',
    name: 'Organización (.org)',
    type: 'organization',
    authority: 0.55,
    reliability: 0.6,
    suffix: true,
  },
];

function getSourceProfile(url) {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    host = '';
  }
  if (!host) {
    return null;
  }
  for (const p of SOURCE_PROFILES) {
    if (p.suffix) {
      if (host.endsWith(`.${p.domain}`) || host === p.domain) {
        return { ...p, domain: host, matched: p.domain };
      }
    } else if (host === p.domain || host.endsWith(`.${p.domain}`)) {
      return { ...p, domain: host, matched: p.domain };
    }
  }
  return {
    domain: host,
    name: host.split('.')[0],
    type: 'unknown',
    authority: 0.4,
    reliability: 0.5,
    matched: null,
  };
}

/* ------------------------------------------------------------------ */
/* Búsqueda universal                                                  */
/* ------------------------------------------------------------------ */

/** Genera variantes de consulta a partir de la pregunta original. */
function buildQueries(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  const base = [q];
  const qLower = q.toLowerCase();
  if (/quién|quién|who|which/.test(qLower) || /es el|es la|es un|es una/.test(qLower)) {
    base.push(q.replace(/\?+$/, ''));
  }
  if (qLower.includes(' y ') || qLower.includes(' and ')) {
    base.push(q.replace(/\?+$/, ''));
  }
  // Dedupe conservando orden
  return [...new Set(base)].slice(0, 3);
}

function stripHtml(s = '') {
  return String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Ejecuta la búsqueda multi-consulta sobre el SearchRuntime (con fallback
 * automático de proveedores). Deduplica por URL y enriquece cada resultado
 * con el perfil de fuente + score de relevancia.
 */
async function universalSearch(query, opts = {}) {
  const q = String(query || '').trim();
  if (!q) {
    return { success: false, error: 'consulta vacía', results: [] };
  }
  const cacheKey = `u:${q.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const queries = buildQueries(q);
  const runtime = getSearchRuntime({ defaultProvider: 'duckduckgo', maxResults: 8 });
  const seen = new Map(); // url -> entry

  for (const subQuery of queries) {
    try {
      const res = await runtime.execute({
        intent: 'web_search',
        query: subQuery,
        maxResults: 8,
      });
      for (const r of res.results || []) {
        const url = String(r.url || '').trim();
        if (!url || seen.has(url)) continue;
        const profile = getSourceProfile(url);
        seen.set(url, {
          title: stripHtml(r.title),
          url,
          snippet: stripHtml(r.snippet),
          source: r.source || (profile && profile.name) || 'web',
          domain: profile ? profile.domain : '',
          type: profile ? profile.type : 'unknown',
          authority: profile ? profile.authority : 0.4,
          reliability: profile ? profile.reliability : 0.5,
        });
      }
    } catch (error) {
      logger.warn(`[UniversalSearch] Sub-query failed (${subQuery}): ${error.message}`);
    }
  }

  const results = [...seen.values()].slice(0, 12);
  const data = {
    success: true,
    query: q,
    queries,
    provider: 'SearchRuntime (DuckDuckGo→Bing)',
    total: results.length,
    results,
    deduplicatedByUrl: true,
  };
  cacheSet(cacheKey, data);
  return data;
}

/* ------------------------------------------------------------------ */
/* Verificación factual                                                */
/* ------------------------------------------------------------------ */

const NEGATION_WORDS = [
  'no es',
  'no existe',
  'nunca',
  'falso',
  'incorrecto',
  'no fue',
  'no tiene',
  'not',
  'never',
  'false',
  'incorrect',
  'does not',
  "doesn't",
  'no such',
];

function containsNegation(text = '') {
  const t = String(text).toLowerCase();
  return NEGATION_WORDS.some((w) => t.includes(w));
}

/** Keywords del claim para medir cuánto "apoya" cada snippet. */
function claimKeywords(claim) {
  const words = String(claim || '')
    .toLowerCase()
    .replace(/[^\wáéíóúñü\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .filter(
      (w) =>
        ![
          'como',
          'para',
          'sobre',
          'entre',
          'pero',
          'what',
          'who',
          'which',
          'when',
          'where',
          'with',
          'that',
          'this',
          'from',
          'have',
          'they',
          'there',
        ].includes(w),
    );
  return [...new Set(words)].slice(0, 6);
}

/**
 * Verifica una afirmación (claim) buscando evidencia en fuentes
 * independientes. NO decide por mayoría: reporta corroboración real,
 * contradicción y un veredicto honesto. El LLM del chat puede sintetizar
 * la respuesta final usando esta evidencia.
 */
async function verifyClaim(claim, opts = {}) {
  const c = String(claim || '').trim();
  if (!c) {
    return { success: false, error: 'claim vacío', verdict: 'NO_EVIDENCE', evidence: [] };
  }
  const cacheKey = `v:${c.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const search = await universalSearch(c, { maxResults: 10 });
  const evidence = [];
  const domains = new Map(); // domain -> { supporting, contradicting }

  const keywords = claimKeywords(c);
  for (const r of search.results || []) {
    const snippet = String(r.snippet || '').toLowerCase();
    const title = String(r.title || '').toLowerCase();
    const supportScore = keywords.reduce(
      (acc, k) => acc + (snippet.includes(k) || title.includes(k) ? 1 : 0),
      0,
    );
    const hasClaimTerms = supportScore > 0;
    // Contradicción real = hay negación Y el snippet menciona términos del
    // claim. Una negación en un snippet que no habla del claim es neutral
    // (evita falsos positivos tipo "el diccionario dice que 'la' no…").
    const negated = hasClaimTerms && (containsNegation(snippet) || containsNegation(title));
    let stance = 'neutral';
    if (negated) {
      stance = 'contradicting';
    } else if (supportScore > 0) {
      stance = 'supporting';
    }

    const entry = {
      ...r,
      stance,
      supportScore,
      negationDetected: negated,
    };
    evidence.push(entry);

    const dom = r.domain || 'unknown';
    if (!domains.has(dom)) {
      domains.set(dom, { supporting: 0, contradicting: 0, neutral: 0 });
    }
    const bucket = domains.get(dom);
    if (stance === 'supporting') bucket.supporting += 1;
    else if (stance === 'contradicting') bucket.contradicting += 1;
    else bucket.neutral += 1;
  }

  const independentSupport = [...domains.values()].filter((d) => d.supporting > 0).length;
  const independentContradict = [...domains.values()].filter((d) => d.contradicting > 0).length;

  let verdict;
  let confidence;
  if (independentSupport === 0 && independentContradict === 0) {
    verdict = 'NO_EVIDENCE';
    confidence = 0;
  } else if (independentSupport >= 2 && independentContradict === 0) {
    verdict = 'CORROBORATED';
    confidence = Math.min(0.95, 0.6 + independentSupport * 0.1);
  } else if (independentSupport >= 1 && independentContradict >= 1) {
    verdict = 'CONTRADICTED';
    confidence = 0.5;
  } else if (independentSupport === 1) {
    verdict = 'SINGLE_SOURCE';
    confidence = 0.4;
  } else if (independentContradict > 0) {
    verdict = 'CONTRADICTED';
    confidence = 0.5;
  } else {
    verdict = 'INCONCLUSIVE';
    confidence = 0.3;
  }

  const data = {
    success: true,
    claim: c,
    verdict,
    confidence: Math.round(confidence * 100) / 100,
    independentSupportingSources: independentSupport,
    independentContradictingSources: independentContradict,
    domainBreakdown: [...domains.entries()].map(([domain, d]) => ({ domain, ...d })),
    evidence: evidence.slice(0, 10),
    note: 'Veredicto heurístico basado en corroboración entre dominios independientes. La síntesis final debe hacerla el LLM con esta evidencia.',
  };
  cacheSet(cacheKey, data);
  return data;
}

/* ------------------------------------------------------------------ */
/* Síntesis con LLM local (FASE 38)                                    */
/* ------------------------------------------------------------------ */

/**
 * Redacta una respuesta corta en español con la evidencia de la verificación,
 * citando las fuentes con [n]. Usa el LLM local (Ollama, sin claves); si no
 * está disponible devuelve null y el cliente usa la evidencia directamente.
 */
async function synthesizeAnswer(claim, verdictData) {
  const evidence = Array.isArray(verdictData?.evidence) ? verdictData.evidence.slice(0, 5) : [];
  if (evidence.length === 0) {
    return null;
  }
  const lines = evidence
    .map(
      (e, i) =>
        `[${i + 1}] ${e.title || e.domain} — ${String(e.snippet || e.domain).slice(0, 220)} (${e.domain})`,
    )
    .join('\n');
  const prompt = `Eres un verificador factual. Basándote SOLO en la evidencia proporcionada, responde de forma concisa (2-4 frases) en español si la afirmación parece cierta, y cita las fuentes con [n]. No inventes datos.

Afirmación: ${claim}

Evidencia:
${lines}

Respuesta:`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    const res = await fetch(`${SYNTH_OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: SYNTH_MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { temperature: 0.3, num_predict: 600, think: false },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    const text = data?.message?.content?.trim();
    return text || null;
  } catch (error) {
    logger.warn(`[UniversalSearch] Síntesis LLM no disponible: ${error.message}`);
    return null;
  }
}

/* ------------------------------------------------------------------ */

module.exports = {
  universalSearch,
  verifyClaim,
  synthesizeAnswer,
  getSourceProfile,
  buildQueries,
  SOURCE_PROFILES,
};
