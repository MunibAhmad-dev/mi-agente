/**
 * CatalogService — catálogo de LLM abiertos explorables y descargables.
 *
 * FASE 17: la interfaz "Explorar" muestra modelos open-weight con datos
 * reales cuando están disponibles:
 *
 *   - Datos base (parámetros, licencia, contexto, repo HF) → catalog.json
 *     (datos públicos del modelo, curados).
 *   - Tamaño REAL en disco → manifest del registry de Ollama
 *     (https://registry.ollama.ai/v2/library/{model}/manifests/{tag}),
 *     sumando el tamaño de sus capas. Se cachea en memoria (TTL 1 h) para
 *     no martillar el registry.
 *
 * Si el registry no responde, se muestra el `sizeApprox` del catálogo
 * (marcado como aproximado). Nunca se inventan datos.
 */

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, 'catalog.json');
const REGISTRY_BASE = 'https://registry.ollama.ai/v2/library';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora
const FETCH_TIMEOUT_MS = 8000;

let _catalog = null;
const _sizeCache = new Map(); // ollamaTag -> { at, sizeBytes, sizeHuman }

function loadCatalog() {
  if (_catalog) return _catalog;
  try {
    _catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  } catch {
    _catalog = [];
  }
  return _catalog;
}

function humanSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n >= 100 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

/** Extrae model y tag de un ollamaTag ("qwen3:0.6b" → model=qwen3, tag=0.6b). */
function parseOllamaTag(ollamaTag) {
  if (!ollamaTag || typeof ollamaTag !== 'string') return null;
  const idx = ollamaTag.indexOf(':');
  if (idx <= 0) return null;
  return { model: ollamaTag.slice(0, idx), tag: ollamaTag.slice(idx + 1) || 'latest' };
}

/**
 * Tamaño real de un modelo vía manifest del registry (cacheado).
 * @returns {Promise<{sizeBytes:number, sizeHuman:string}|null>}
 */
async function fetchRealSize(ollamaTag) {
  const parsed = parseOllamaTag(ollamaTag);
  if (!parsed) return null;

  const cached = _sizeCache.get(ollamaTag);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { sizeBytes: cached.sizeBytes, sizeHuman: cached.sizeHuman };
  }

  try {
    const url = `${REGISTRY_BASE}/${encodeURIComponent(parsed.model)}/manifests/${encodeURIComponent(parsed.tag)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let manifest;
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
      manifest = await res.json();
    } finally {
      clearTimeout(timer);
    }
    const layers = Array.isArray(manifest.layers) ? manifest.layers : [];
    const sizeBytes = layers.reduce((acc, l) => acc + (Number(l.size) || 0), 0);
    if (!sizeBytes) return null;
    const sizeHuman = humanSize(sizeBytes);
    _sizeCache.set(ollamaTag, { at: Date.now(), sizeBytes, sizeHuman });
    return { sizeBytes, sizeHuman };
  } catch {
    return null; // sin internet / registry caído → sizeApprox
  }
}

/** Enriquece un entry del catálogo con el tamaño real (si está disponible). */
async function enrichEntry(entry) {
  const { sizeBytes, sizeHuman } = (await fetchRealSize(entry.ollamaTag)) || {};
  return {
    ...entry,
    sizeBytes: sizeBytes || null,
    sizeHuman: sizeHuman || entry.sizeApprox || null,
    sizeReal: Boolean(sizeBytes),
  };
}

/**
 * Busca en el catálogo y devuelve las entradas enriquecidas.
 * @param {string} [query] — filtro por nombre/familia (case-insensitive).
 */
async function searchCatalog(query = '') {
  const catalog = loadCatalog();
  const q = String(query || '')
    .trim()
    .toLowerCase();
  let entries = catalog;
  if (q) {
    entries = catalog.filter(
      (e) =>
        (e.name || '').toLowerCase().includes(q) ||
        (e.family || '').toLowerCase().includes(q) ||
        (e.id || '').toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q),
    );
  }
  // Enriquecimiento en paralelo con límite de 8 (evita latencia excesiva).
  const slice = entries.slice(0, 8);
  const enriched = await Promise.all(slice.map((e) => enrichEntry(e)));
  return {
    total: entries.length,
    returned: enriched.length,
    models: enriched,
  };
}

/* ------------------------------------------------------------------ */
/* Búsqueda externa — FASE 18                                          */
/* ------------------------------------------------------------------ */

const HF_API = 'https://huggingface.co/api/models';
const GITHUB_SEARCH_API = 'https://api.github.com/search/repositories';
const EXTERNAL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min (rate limits de HF/GitHub)

const _externalCache = new Map(); // `${source}:${q}` -> { at, data }

function formatParams(total) {
  const n = Number(total);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1e9) {
    const b = n / 1e9;
    return `${b >= 10 ? Math.round(b) : b.toFixed(1)}B`;
  }
  const m = n / 1e6;
  return `${m >= 10 ? Math.round(m) : m.toFixed(1)}M`;
}

function hfLicense(tags, cardData) {
  if (cardData && typeof cardData.license === 'string' && cardData.license) {
    return cardData.license;
  }
  const lic = (tags || []).find((t) => t.startsWith('license:'));
  return lic ? lic.slice('license:'.length) : null;
}

function hfParams(model) {
  try {
    const total = model?.safetensors?.total;
    if (total) return formatParams(total);
  } catch {
    /* ignore */
  }
  const tag = (model?.tags || []).find((t) => /\d+(\.\d+)?b/i.test(t));
  if (tag) {
    const m = tag.match(/(\d+(\.\d+)?b)/i);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

/**
 * Arquitectura del modelo (MoE vs Dense) desde datos REALES de HF:
 * el array `architectures` (p. ej. ["Qwen2MoeForCausalLM"]) o el tag
 * "moe". Nunca se asume: sin evidencia → null (desconocido).
 */
function hfArchitecture(model) {
  const archs = Array.isArray(model?.architectures) ? model.architectures : [];
  const tags = Array.isArray(model?.tags) ? model.tags : [];
  const joined = archs.join(' ');
  if (joined.toLowerCase().includes('moe') || tags.includes('moe')) {
    return 'MoE';
  }
  if (archs.length > 0) {
    return 'Dense';
  }
  return null;
}

function hfModality(pipelineTag) {
  switch (pipelineTag) {
    case 'image-text-to-text':
      return 'Multimodal';
    case 'text-to-image':
    case 'image-to-image':
      return 'Imagen';
    case 'image-to-text':
      return 'Visión';
    case 'text-to-video':
    case 'image-to-video':
    case 'video-to-video':
      return 'Video';
    case 'text-to-speech':
    case 'text-to-audio':
      return 'TTS';
    case 'automatic-speech-recognition':
    case 'audio-to-text':
      return 'STT';
    case 'audio-text-to-text':
    case 'audio-to-audio':
      return 'Audio';
    case 'feature-extraction':
    case 'sentence-similarity':
    case 'text-embedding':
      return 'Embeddings';
    case 'translation':
      return 'Traducción';
    case 'reranking':
      return 'Reranking';
    case 'text-to-3d':
      return '3D';
    default:
      return 'Texto';
  }
}

/**
 * Categorías del Explorar (FASE 26): separa LLM de modelos de imagen, video,
 * voz/audio y embeddings para que no aparezcan todos mezclados. Mapea cada
 * categoría al pipeline_tag que filtra la API pública de Hugging Face.
 * `llm`/`todos` no filtran (la búsqueda ya devuelve texto/chat por defecto).
 */
const CATEGORY_PIPELINES = {
  llm: null,
  imagen: 'text-to-image',
  video: 'text-to-video',
  animacion: 'text-to-video',
  voz: 'text-to-speech',
  stt: 'automatic-speech-recognition',
  audio: 'text-to-audio',
  musica: 'text-to-audio',
  embeddings: 'feature-extraction',
  multimodal: 'image-text-to-text',
  vision: 'image-to-text',
  ocr: 'image-to-text',
  traduccion: 'translation',
  '3d': null,
  reranking: null,
  codigo: null,
  agentes: null,
  robotica: null,
};

/** Estimación honesta del peso en disco (~Q4_K_M) a partir de parámetros.
 *  Etiquetada siempre como estimación (la API de HF no expone tamaño de
 *  archivo en la búsqueda; el real se conoce al listar cuantizaciones). */
function estimateHfSizeGB(paramsStr) {
  const m = (paramsStr || '').match(/([\d.]+)(B|M)/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const paramsB = m[2].toUpperCase() === 'B' ? n : n / 1000;
  const gb = ((paramsB * 4.5) / 8) * 1.08; // ~Q4_K_M + overhead
  return gb >= 10 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`;
}

/**
 * Busca modelos en Hugging Face (API pública, sin clave). Devuelve datos
 * REALES: descargas, likes, trendingScore, pipeline_tag, licencia y
 * parámetros (safetensors.total cuando existe). No inventa nada.
 */
async function searchHuggingFace(query = '', category = 'llm') {
  const q = String(query || '').trim();
  const pipeline = CATEGORY_PIPELINES[category] ?? null;
  const cacheKey = `hf:${q}:${pipeline ?? 'llm'}`;
  const cached = _externalCache.get(cacheKey);
  if (cached && Date.now() - cached.at < EXTERNAL_CACHE_TTL_MS) {
    return cached.data;
  }

  const pipelineParam = pipeline ? `&pipeline_tag=${encodeURIComponent(pipeline)}` : '';
  const url = `${HF_API}?search=${encodeURIComponent(q)}&limit=20&sort=downloads&direction=-1&full=true${pipelineParam}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`HF respondió HTTP ${res.status}`);
    }
    let list = [];
    try {
      const parsed = await res.json();
      list = Array.isArray(parsed) ? parsed : [];
    } catch {
      list = [];
    }
    const models = list
      .filter((m) => m && !m.private && !m.gated)
      .slice(0, 15)
      .map((m) => {
        const params = hfParams(m);
        const pipelineTag = m.pipeline_tag || null;
        return {
          id: m.id,
          name: m.id,
          source: 'huggingface',
          family: (m.id || '').split('/')[0] || 'HF',
          hfRepo: m.id,
          params,
          contextMax: null,
          sizeHuman: estimateHfSizeGB(params),
          sizeBytes: null,
          sizeReal: false,
          license: hfLicense(m.tags, m.cardData),
          modality: hfModality(pipelineTag),
          // FASE 28: arquitectura real (MoE/Dense) para el filtro y la tarjeta.
          architecture: hfArchitecture(m),
          capabilities: ['Texto'],
          downloads: Number(m.downloads) || 0,
          likes: Number(m.likes) || 0,
          trendingScore: Number(m.trendingScore) || 0,
          pipelineTag,
          description: m.cardData?.short_description || null,
        };
      });
    const data = { total: models.length, returned: models.length, models };
    _externalCache.set(cacheKey, { at: Date.now(), data });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Busca repositorios de GitHub con modelos GGUF (API pública de búsqueda de
 * repos). Representado correctamente: son REPOS que contienen modelos, NO el
 * catálogo oficial "GitHub Models" (ese requiere token — ver informe FASE 18).
 */
async function searchGitHubRepos(query = '') {
  const q = String(query || '').trim();
  const cacheKey = `gh:${q}`;
  const cached = _externalCache.get(cacheKey);
  if (cached && Date.now() - cached.at < EXTERNAL_CACHE_TTL_MS) {
    return cached.data;
  }

  const searchQuery = q ? `${q} gguf` : 'gguf llm';
  const url = `${GITHUB_SEARCH_API}?q=${encodeURIComponent(searchQuery)}&sort=stars&order=desc&per_page=12`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'mi-libre-chat' },
    });
    if (!res.ok) {
      throw new Error(`GitHub respondió HTTP ${res.status}`);
    }
    const body = await res.json();
    const items = Array.isArray(body.items) ? body.items : [];
    const repos = items.slice(0, 12).map((r) => ({
      id: r.full_name,
      name: r.full_name,
      source: 'github',
      family: (r.full_name || '').split('/')[0] || 'GitHub',
      hfRepo: null,
      params: null,
      contextMax: null,
      sizeHuman: null,
      sizeBytes: null,
      sizeReal: false,
      license: r.license?.spdx_id || null,
      modality: 'Texto',
      capabilities: ['Texto'],
      stars: Number(r.stargazers_count) || 0,
      downloads: 0,
      likes: 0,
      trendingScore: 0,
      description: r.description || null,
      htmlUrl: r.html_url,
    }));
    const data = { total: repos.length, returned: repos.length, models: repos };
    _externalCache.set(cacheKey, { at: Date.now(), data });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Lista las cuantizaciones GGUF de un repo de Hugging Face (FASE 19).
 * Consulta la API pública de HF (siblings) y extrae { quant, file, size }.
 * Sirve para dejar elegir cuantización antes de descargar con Ollama.
 */
async function getHfQuants(repo = '') {
  const clean = String(repo || '')
    .trim()
    .replace(/^hf\.co\//, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(clean)) {
    throw new Error('repo HF inválido');
  }
  const cacheKey = `quants:${clean}`;
  const cached = _externalCache.get(cacheKey);
  if (cached && Date.now() - cached.at < EXTERNAL_CACHE_TTL_MS) {
    return cached.data;
  }
  const url = `${HF_API}/${clean}?blobs=true`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`HF respondió HTTP ${res.status}`);
    }
    const body = await res.json().catch(() => ({}));
    const siblings = Array.isArray(body.siblings) ? body.siblings : [];
    const quants = [];
    const seen = new Set();
    for (const s of siblings) {
      const name = s && typeof s.rfilename === 'string' ? s.rfilename : s && s.name;
      if (!name || !name.toLowerCase().endsWith('.gguf')) continue;
      const base = name.slice(0, -5);
      // El token de cuantización suele ser la última parte (Q4_K_M, q4_k_m, fp16…)
      const m = base.match(/[_-]([\w.]+)$/);
      const quant = m ? m[1] : base.split('/').pop();
      if (!quant || seen.has(quant)) continue;
      seen.add(quant);
      quants.push({ quant, file: name, size: Number(s.size) || null });
    }
    // Orden preferido: quants comunes primero, luego por tamaño.
    const order = ['Q4_K_M', 'Q4_0', 'Q5_K_M', 'Q5_0', 'Q6_K', 'Q8_0', 'F16', 'FP16', 'BF16'];
    quants.sort((a, b) => {
      const ia = order.indexOf(a.quant.toUpperCase());
      const ib = order.indexOf(b.quant.toUpperCase());
      if (ia === -1 && ib === -1) return (a.size || 0) - (b.size || 0);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    const data = { repo: clean, quants };
    _externalCache.set(cacheKey, { at: Date.now(), data });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * FASE 31 — Resuelve la URL (o id) de un proyecto/modelo que el usuario pega
 * en el explorador. Acepta:
 *   · https://huggingface.co/owner/repo   (o id "owner/repo")
 *   · https://github.com/owner/repo       (repo que contiene modelos)
 *   · id de Ollama (qwen3:0.6b, hf.co/owner/repo:quant)
 * Devuelve UN CatalogEntry con metadata REAL de la fuente (peso, params,
 * licencia, MoE/Dense, modalidad, descargas…). Nunca inventa datos.
 */
async function resolveProjectUrl(rawUrl = '') {
  const input = String(rawUrl || '').trim();
  if (!input) {
    throw new Error('URL vacía');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // 1) Ollama: id con ':' (qwen3:0.6b, hf.co/owner/repo:Q4_K_M)
    if (/^[\w.-]+:[\w.-]+$/.test(input) || /^hf\.co\/[\w.-]+\/[\w.-]+/.test(input)) {
      return {
        id: input,
        name: input,
        source: 'catalog',
        family: input.split(':')[0].split('/').pop() || 'Ollama',
        ollamaTag: input,
        params: null,
        contextMax: null,
        sizeHuman: null,
        sizeBytes: null,
        sizeReal: false,
        license: null,
        architecture: null,
        modality: 'Texto',
        capabilities: ['Texto'],
        description: 'Modelo de Ollama (descarga directa con el tag indicado).',
      };
    }

    // 2) GitHub — el dominio va FUERA del grupo (si no, el regex captura
    //    "github.com/owner" como repo y la API devuelve 404)
    const ghMatch = input.match(/github\.com\/([\w.-]+\/[\w.-]+)/);
    if (ghMatch) {
      const repo = ghMatch[1].replace(/\.git$/, '');
      const url = `https://api.github.com/repos/${repo}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'mi-libre-chat' },
      });
      if (!res.ok) {
        throw new Error(`GitHub respondió HTTP ${res.status} (¿existe el repo?)`);
      }
      const r = await res.json();
      return {
        id: r.full_name,
        name: r.full_name,
        source: 'github',
        family: (r.full_name || '').split('/')[0] || 'GitHub',
        hfRepo: null,
        params: null,
        contextMax: null,
        sizeHuman: null,
        sizeBytes: null,
        sizeReal: false,
        license: r.license?.spdx_id || null,
        architecture: null,
        modality: 'Texto',
        capabilities: ['Texto'],
        stars: Number(r.stargazers_count) || 0,
        downloads: 0,
        likes: 0,
        trendingScore: 0,
        description: r.description || null,
        htmlUrl: r.html_url,
      };
    }

    // 2.5) Civitai (civitai.com/models/123 o civitai.red/models/123)
    const civitaiMatch = input.match(/(?:civitai\.(?:com|red))\/models\/(\d+)/);
    if (civitaiMatch) {
      const id = civitaiMatch[1];
      const url = `${CIVITAI_API}/${id}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'mi-libre-chat/1.0' },
      });
      if (!res.ok) {
        throw new Error(`Civitai respondió HTTP ${res.status} (¿existe el modelo?)`);
      }
      const m = await res.json().catch(() => ({}));
      if (!m || !m.id) {
        throw new Error('No se pudo leer el modelo de Civitai');
      }
      const version = Array.isArray(m.modelVersions) ? m.modelVersions[0] : null;
      const files = Array.isArray(version?.files) ? version.files : [];
      const sizeKB = files.reduce((acc, f) => acc + (Number(f.sizeKB) || 0), 0);
      let sizeHuman = null;
      if (sizeKB >= 1048576) {
        sizeHuman = `${(sizeKB / 1048576).toFixed(2)} GB`;
      } else if (sizeKB > 0) {
        sizeHuman = `${Math.round(sizeKB / 1024)} MB`;
      }
      return {
        id: `civitai-${m.id}`,
        name: m.name,
        source: 'civitai',
        family: civitaiBaseModel(m.baseModel) || 'Civitai',
        hfRepo: null,
        params: null,
        contextMax: null,
        sizeHuman,
        sizeBytes: sizeKB > 0 ? Math.round(sizeKB * 1024) : null,
        sizeReal: sizeKB > 0,
        license: null,
        architecture: null,
        modality: civitaiModality(m.type),
        capabilities: [String(m.type || 'Checkpoint')],
        civitaiType: m.type,
        baseModel: civitaiBaseModel(m.baseModel),
        downloads: Number(m.stats?.downloadCount) || 0,
        rating: Number(m.stats?.rating) || null,
        ratingCount: Number(m.stats?.ratingCount) || 0,
        tags: Array.isArray(m.tags) ? m.tags.slice(0, 6) : [],
        description: m.description ? String(m.description).slice(0, 300) : null,
        htmlUrl: `https://civitai.com/models/${m.id}`,
      };
    }

    // 3) Hugging Face (URL completa o id owner/repo)
    const hfMatch =
      input.match(/huggingface\.co\/([\w.-]+\/[\w.-]+)/) || input.match(/^([\w.-]+\/[\w.-]+)$/);
    if (hfMatch) {
      const repo = hfMatch[1];
      // La barra del repo NO se codifica (HF rechaza %2F en el path)
      const url = `${HF_API}/${repo}?full=true`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`Hugging Face respondió HTTP ${res.status} (¿existe el repo?)`);
      }
      const m = await res.json().catch(() => ({}));
      if (!m || !m.id) {
        throw new Error('No se pudo leer el modelo de Hugging Face');
      }
      const params = hfParams(m);
      const pipelineTag = m.pipeline_tag || null;
      return {
        id: m.id,
        name: m.id,
        source: 'huggingface',
        family: (m.id || '').split('/')[0] || 'HF',
        hfRepo: m.id,
        params,
        contextMax: null,
        sizeHuman: estimateHfSizeGB(params),
        sizeBytes: null,
        sizeReal: false,
        license: hfLicense(m.tags, m.cardData),
        architecture: hfArchitecture(m),
        modality: hfModality(pipelineTag),
        capabilities: ['Texto'],
        downloads: Number(m.downloads) || 0,
        likes: Number(m.likes) || 0,
        trendingScore: Number(m.trendingScore) || 0,
        pipelineTag,
        description: m.cardData?.short_description || null,
      };
    }

    throw new Error(
      'URL no reconocida. Usa una de Hugging Face, GitHub o un id de Ollama (modelo:tag).',
    );
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Civitai — FASE 34 (imagen / video / animación / LORA…)             */
/* ------------------------------------------------------------------ */

const CIVITAI_API = 'https://civitai.com/api/v1/models';
/** Mirror alternativo (misma API): se usa como fallback si civitai.com no
 *  responde (bloqueo regional / caída). Nunca como fuente primaria. */
const CIVITAI_MIRROR = 'https://civitai.red/api/v1/models';

/** Traducción de la categoría interna del Explorar al filtro de Civitai. */
const CIVITAI_CATEGORY_TYPES = {
  imagen: ['Checkpoint', 'LoRA'],
  video: ['MotionModule', 'Locomotion', 'Workflows'],
  animacion: ['MotionModule', 'Locomotion', 'Workflows'],
  voz: null, // Civitai no tiene TTS — sin filtro
  stt: null,
  audio: null,
  musica: null,
  embeddings: ['TextualInversion'],
  multimodal: ['Checkpoint'],
  vision: ['Checkpoint'],
  ocr: null,
  traduccion: null,
  '3d': null,
  reranking: null,
  codigo: null,
  agentes: null,
  robotica: null,
};

/** Mapea el `type` de Civitai a nuestra modalidad interna. */
function civitaiModality(type) {
  switch (String(type || '').toLowerCase()) {
    case 'motionmodule':
    case 'locomotion':
      return 'Video';
    case 'textualinversion':
      return 'Embeddings';
    case 'controlnet':
      return 'Imagen';
    case 'lora':
    case 'checkpoint':
    case 'upscaler':
    default:
      return 'Imagen';
  }
}

/** Traduce el baseModel de Civitai a algo legible (SDXL 1.0, Pony, Flux…). */
function civitaiBaseModel(baseModel) {
  return String(baseModel || '').trim() || null;
}

/**
 * Busca modelos en Civitai (API pública, sin clave). Devuelve datos REALES:
 * tipo (Checkpoint/LORA/…), baseModel, descargas, rating, tamaño de archivo
 * y tags. Civitai no expone parámetros ni licencia vía API de búsqueda — se
 * omite (desconocido) en lugar de inventar. Los resultados son modelos de
 * imagen/video/animación (la categoría natural de la plataforma).
 */
async function searchCivitai(query = '', category = 'llm') {
  const q = String(query || '').trim();
  const types = CIVITAI_CATEGORY_TYPES[category] || null;
  const cacheKey = `civitai:${q}:${category}`;
  const cached = _externalCache.get(cacheKey);
  if (cached && Date.now() - cached.at < EXTERNAL_CACHE_TTL_MS) {
    return cached.data;
  }

  /** La API de Civitai SOLO acepta UN valor en `types` (una lista separada
   *  por comas devuelve 400). Se consulta cada tipo por separado (límite 2
   *  por categoría) y se fusionan resultados sin duplicados. */
  let typeList = [null];
  if (types && types.length > 0) {
    typeList = types.slice(0, 2);
  } else if (category === 'llm') {
    typeList = ['Checkpoint'];
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS * typeList.length);
  try {
    const seen = new Set();
    const models = [];
    let usedMirror = false;

    const fetchOne = async (type) => {
      const params = new URLSearchParams({
        limit: '12',
        sort: 'Most Downloaded',
      });
      if (q) params.set('query', q);
      if (type) params.set('types', type);

      let res = null;
      try {
        const firstRes = await fetch(`${CIVITAI_API}?${params}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json', 'User-Agent': 'mi-libre-chat/1.0' },
        });
        if (!firstRes.ok) {
          throw new Error(`Civitai respondió HTTP ${firstRes.status}`);
        }
        res = firstRes;
      } catch {
        // Fallback al mirror (misma forma de la API)
        const mirrorRes = await fetch(`${CIVITAI_MIRROR}?${params}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json', 'User-Agent': 'mi-libre-chat/1.0' },
        });
        usedMirror = true;
        if (!mirrorRes.ok) {
          return;
        }
        res = mirrorRes;
      }
      const body = await res.json().catch(() => ({}));
      const items = Array.isArray(body.items) ? body.items : [];
      for (const m of items) {
        if (!m || !m.id || seen.has(m.id)) continue;
        seen.add(m.id);
        const version = Array.isArray(m.modelVersions) ? m.modelVersions[0] : null;
        const files = Array.isArray(version?.files) ? version.files : [];
        const sizeKB = files.reduce((acc, f) => acc + (Number(f.sizeKB) || 0), 0);
        let sizeHuman = null;
        if (sizeKB >= 1048576) {
          sizeHuman = `${(sizeKB / 1048576).toFixed(2)} GB`;
        } else if (sizeKB > 0) {
          sizeHuman = `${Math.round(sizeKB / 1024)} MB`;
        }
        models.push({
          id: `civitai-${m.id}`,
          name: m.name,
          source: 'civitai',
          family: civitaiBaseModel(m.baseModel) || 'Civitai',
          hfRepo: null,
          params: null, // Civitai no expone parámetros en la API de búsqueda
          contextMax: null,
          sizeHuman,
          sizeBytes: sizeKB > 0 ? Math.round(sizeKB * 1024) : null,
          sizeReal: sizeKB > 0,
          license: null, // no expuesto por la API pública
          architecture: null,
          modality: civitaiModality(m.type),
          capabilities: [String(m.type || 'Checkpoint')],
          civitaiType: m.type,
          baseModel: civitaiBaseModel(m.baseModel),
          downloads: Number(m.stats?.downloadCount) || 0,
          likes: 0,
          rating: Number(m.stats?.rating) || null,
          ratingCount: Number(m.stats?.ratingCount) || 0,
          trendingScore: 0,
          tags: Array.isArray(m.tags) ? m.tags.slice(0, 6) : [],
          description: m.description ? String(m.description).slice(0, 300) : null,
          htmlUrl: `https://civitai.com/models/${m.id}`,
          usedMirror,
        });
      }
    };

    await Promise.all(typeList.map(fetchOne));
    models.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    const data = { total: models.length, returned: models.length, models: models.slice(0, 12) };
    _externalCache.set(cacheKey, { at: Date.now(), data });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Dispatcher de búsqueda externa: 'catalog' | 'huggingface' | 'github' | 'civitai'.
 * Cada fuente falla de forma aislada (una caída no rompe el panel).
 */
async function searchExternal(source, query, category = 'llm') {
  if (source === 'huggingface') {
    return await searchHuggingFace(query, category);
  }
  if (source === 'github') {
    return await searchGitHubRepos(query);
  }
  if (source === 'civitai') {
    return await searchCivitai(query, category);
  }
  return searchCatalog(query);
}

module.exports = {
  searchCatalog,
  searchExternal,
  searchHuggingFace,
  searchGitHubRepos,
  searchCivitai,
  getHfQuants,
  fetchRealSize,
  humanSize,
  resolveProjectUrl,
  loadCatalog,
};
