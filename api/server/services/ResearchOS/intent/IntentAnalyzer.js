'use strict';

/**
 * Face 24 — IntentAnalyzer (plan §6).
 *
 * Classifies any question into a typed ResearchProfile skeleton:
 * domain, subdomain, entities, question/task type, complexity signals,
 * freshness & verification requirements, research depth, experimentation.
 *
 * Rule-based multilingual heuristics (EN/ES), deterministic and testable.
 * The orchestrator can swap this for an LLM classifier via the same
 * interface: analyze(question) -> profile fields.
 */

const { uid, nowIso } = require('../core/ids');
const { normalize } = require('../core/text');

const DOMAINS = {
  ai: ['llm', 'qwen', 'llama', 'gpt', 'deepseek', 'mistral', 'embedding', 'quantiz', 'quantizaci', 'fine-tun', 'finetun', 'token', 'transformer', 'prompt', 'agent', 'rag', 'modelo', 'gpu vram', 'inference', 'benchmark mmlu', 'context window'],
  programming: ['code', 'python', 'javascript', 'typescript', 'bug', 'stack trace', 'refactor', 'api', 'library', 'framework', 'npm', 'git', 'codigo', 'funcion', 'error de compilacion'],
  hardware: ['gpu', 'cpu', 'rtx', 'radeon', 'vram', 'motherboard', 'placa', 'procesador', 'ssd', 'ddr5', 'overclock', 'benchmark 3dmark', 'tdp'],
  electronics: ['arduino', 'raspberry', 'circuit', 'circuito', 'voltaje', 'resistor', 'capacitor', 'pcb', 'soldadura', 'microcontroller'],
  science: ['physics', 'fisica', 'chemistry', 'quimica', 'biology', 'biologia', 'paper', 'arxiv', 'study', 'estudio', 'experiment', 'hypothesis', 'hipotesis', 'peer review'],
  math: ['theorem', 'teorema', 'proof', 'demostracion', 'equation', 'ecuacion', 'integral', 'matrix', 'probability', 'probabilidad'],
  engineering: ['design', 'diseño', 'structural', 'material', 'efficiency', 'eficiencia', 'tolerance', 'torque'],
  ceramics: ['ceramic', 'ceramica', 'glaze', 'esmalte', 'kiln', 'horno', 'clay', 'arcilla', 'stoneware', 'porcelain', 'porcelana', 'cone 6'],
  art: ['painting', 'pintura', 'sculpture', 'escultura', 'style', 'estilo', 'museum', 'museo'],
  history: ['history', 'historia', 'century', 'siglo', 'war', 'guerra', 'empire', 'imperio', 'medieval', 'revolution'],
  anime: ['anime', 'manga', 'waifu', 'shonen', 'isekai', 'protagonist', 'temporada', 'studio', 'ova', 'canon', 'filler'],
  fiction: ['character', 'personaje', 'twilight sparkle', 'harry potter', 'lore', 'fanfic', 'novel', 'novela', 'serie'],
  games: ['game', 'juego', 'videogame', 'videojuego', 'gameplay', 'speedrun', 'boss', 'patch notes', 'meta', 'rpg'],
  movies: ['movie', 'pelicula', 'film', 'director', 'actor', 'box office', 'oscars', 'soundtrack'],
  news: ['news', 'noticia', 'breaking', 'última hora', 'today', 'hoy', 'yesterday', 'ayer', 'reported', 'según', 'announcement', 'anuncio'],
  politics: ['election', 'elecciones', 'president', 'presidente', 'senate', 'senado', 'policy', 'ley', 'government', 'gobierno', 'minister', 'ministro', 'vote', 'voto', 'party', 'partido'],
  economy: ['inflation', 'inflacion', 'gdp', 'pib', 'market', 'mercado', 'stock', 'bolsa', 'interest rate', 'tipos de interes', 'price', 'precio'],
  products: ['review', 'reseña', 'buy', 'comprar', 'price of', 'opinion', 'worth it', 'vale la pena', 'comparison', 'comparativa'],
};

const FACT_PATTERNS = ['who is', 'quien es', 'qué es', 'que es', 'what is', 'when did', 'cuando', 'where is', 'donde', 'how many', 'cuantos', 'define', 'significado'];
const HOWTO_PATTERNS = ['how to', 'como', 'cómo puedo', 'best way', 'mejor forma', 'steps', 'pasos', 'tutorial', 'guide', 'guia'];
const CHECK_PATTERNS = ['is it true', 'es verdad', 'es cierta', 'es cierto', 'fact check', 'verificar', 'rumor', 'debunk', 'confirm', 'really happened', 'paso de verdad'];
const COMPARE_PATTERNS = [' vs ', 'versus', 'difference between', 'diferencia entre', 'better', 'mejor que', 'compare', 'comparar'];
const OPEN_PATTERNS = ['why', 'por que', 'porqué', 'future of', 'futuro de', 'predict', 'predecir', 'improve', 'mejorar', 'optimize', 'optimizar', 'reduce', 'reducir', 'design', 'diseñar'];
const FRESH_PATTERNS = ['today', 'hoy', 'latest', 'últim', 'last', '2025', '2026', 'current', 'actual', 'now', 'breaking', 'recent', 'reciente', 'nuevo', 'nueva'];
const EXPERIMENT_PATTERNS = ['reduce', 'reducir', 'shrink', 'optimize', 'optimizar', 'speed up', 'acelerar', 'benchmark', 'measure', 'medir', 'test', 'probar', 'without', 'sin', 'improve', 'mejorar'];

const QUOTED = /["“”']([^"“”']{3,})["“”']/g;
const CAPS = /\b([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,3})\b/g;

function extractEntities(q) {
  const found = new Set();
  let m;
  QUOTED.lastIndex = 0;
  while ((m = QUOTED.exec(q))) found.add(m[1].trim());
  CAPS.lastIndex = 0;
  while ((m = CAPS.exec(q))) {
    const t = m[1].trim();
    if (t.length >= 3 && !/^(The|This|That|What|How|Why|When|Where|Who|Is|Are|Can|Does|El|La|Los|Las|Que|Como|Cuando)$/i.test(t)) found.add(t);
  }
  return [...found].slice(0, 8);
}

function scoreDomain(q) {
  const n = ' ' + normalize(q) + ' ';
  const scores = {};
  for (const [dom, words] of Object.entries(DOMAINS)) {
    let s = 0;
    for (const w of words) if (n.includes(w)) s += 1;
    if (s > 0) scores[dom] = s;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return { domain: 'general', subdomain: 'unknown', confidence: 0.3, runner_up: null };
  const [top, topScore] = sorted[0];
  const second = sorted[1];
  const confidence = Math.min(0.95, 0.45 + topScore * 0.15 - (second && second[1] >= topScore ? 0.15 : 0));
  return {
    domain: top,
    subdomain: topScore >= 2 ? sorted[0][0] + '/specific' : top + '/general',
    confidence: Math.round(confidence * 100) / 100,
    runner_up: second ? second[0] : null,
  };
}

function classifyQuestion(nq) {
  if (CHECK_PATTERNS.some((p) => nq.includes(p))) return { question_type: 'fact_check', task_type: 'verification' };
  if (COMPARE_PATTERNS.some((p) => nq.includes(p))) return { question_type: 'comparison', task_type: 'research' };
  if (HOWTO_PATTERNS.some((p) => nq.includes(p))) return { question_type: 'how_to', task_type: 'research' };
  if (FACT_PATTERNS.some((p) => nq.includes(p))) return { question_type: 'factual', task_type: 'lookup' };
  if (OPEN_PATTERNS.some((p) => nq.includes(p))) return { question_type: 'open', task_type: 'research' };
  return { question_type: 'exploratory', task_type: 'research' };
}

function complexitySignals(q, dom, qtype) {
  const nq = ' ' + normalize(q) + ' ';
  let c = 0.15;
  if (['ai', 'hardware', 'science', 'math', 'engineering', 'electronics'].includes(dom)) c += 0.25;
  if (['how_to', 'open', 'comparison'].includes(qtype)) c += 0.2;
  if (qtype === 'fact_check') c += 0.25;
  if (EXPERIMENT_PATTERNS.filter((p) => nq.includes(p)).length >= 2) c += 0.2;
  const words = nq.trim().split(/\s+/).length;
  if (words > 14) c += 0.1;
  return Math.min(1, Math.round(c * 100) / 100);
}

function analyze(question, opts = {}) {
  const q = String(question || '').trim();
  if (!q) throw new Error('question is required');
  const nq = normalize(q);

  const dom = scoreDomain(q);
  const { question_type, task_type } = classifyQuestion(nq);
  const complexity = complexitySignals(q, dom.domain, question_type);

  const freshness_critical = FRESH_PATTERNS.some((p) => nq.includes(p)) || dom.domain === 'news';
  const verification_required = question_type === 'fact_check' || dom.domain === 'news' || dom.domain === 'politics';
  const experimentation = opts.experimentation !== undefined
    ? opts.experimentation
    : (EXPERIMENT_PATTERNS.filter((p) => nq.includes(p)).length >= 2 && ['ai', 'programming', 'hardware', 'math', 'science', 'electronics'].includes(dom.domain));

  const political_analysis = ['politics', 'news'].includes(dom.domain) ||
    ['election', 'government', 'presidente', 'elecciones', 'partido'].some((p) => nq.includes(p));

  const profile = {
    id: opts.id || uid('rp'),
    question: q,
    domain: dom.domain,
    subdomain: dom.subdomain,
    domain_confidence: dom.confidence,
    runner_up_domain: dom.runner_up,
    entities: extractEntities(q),
    question_type,
    task_type,
    complexity,
    freshness_requirement: freshness_critical ? 'critical' : 'normal',
    verification_requirement: verification_required ? 'high' : 'standard',
    research_depth: complexity >= 0.7 ? 'deep' : complexity >= 0.45 ? 'standard' : 'quick',
    experiment_requirement: experimentation ? 'required' : 'none',
    political_analysis,
    source_types: defaultSourceTypes(dom.domain, political_analysis),
    required_evidence: verification_required ? 'E3_independent' : 'E1_single',
    budget: opts.budget || null,
    deadline: opts.deadline || null,
    created_at: nowIso(),
  };
  return profile;
}

function defaultSourceTypes(domain, political) {
  const base = ['web'];
  const perDomain = {
    ai: ['academic', 'github', 'documentation', 'community'],
    programming: ['documentation', 'github', 'community'],
    hardware: ['manufacturer', 'community', 'web'],
    science: ['academic', 'web'],
    ceramics: ['academic', 'community', 'web'],
    anime: ['wiki', 'community', 'web'],
    fiction: ['wiki', 'community', 'web'],
    news: ['news', 'primary', 'web'],
    politics: ['news', 'primary', 'academic'],
    products: ['community', 'manufacturer', 'web'],
  };
  const list = [...base, ...(perDomain[domain] || [])];
  if (political && !list.includes('news')) list.push('news');
  return [...new Set(list)];
}

module.exports = { analyze, scoreDomain, classifyQuestion, extractEntities };
