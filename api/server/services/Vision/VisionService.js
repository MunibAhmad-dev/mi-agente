/**
 * VisionService — Visión por computadora FASE 31/35.
 *
 * Sistema de análisis de imágenes conectado a TODOS los LLM:
 *   · Local  — modelos de visión de Ollama (llava, qwen2.5vl, gemma3,
 *              moondream…) con su capability real de /api/tags.
 *   · Cloud  — cualquier proveedor configurado (OpenAI, OpenRouter, LiteLLM,
 *              Anthropic, Google…) cuando el modelo es multimodal, usando la
 *              clave del usuario (getUserKey) o la apiKey del endpoint.
 *
 *   GET  /api/vision/status            → modelos de visión disponibles
 *   POST /api/vision/analyze           → analizar imagen (describir/OCR/detectar)
 *
 * Reglas:
 *  - Solo usa modelos REALMENTE disponibles (instalados o configurados).
 *  - No inventa resultados: si no hay modelo de visión, devuelve un estado
 *    informativo (nunca un error crítico).
 *  - Las imágenes van como base64 en el body (validado en tamaño y tipo).
 */
const OLLAMA_BASE = process.env.OLLAMA_HOST || 'http://chat-ollama:11434';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const FETCH_TIMEOUT_MS = 120000;

/** Patrones de modelos multimodales (visión) por proveedor — honesto: solo
 *  marca coincidencias conocidas; el resto queda como 'desconocido'. */
const VISION_MODEL_PATTERNS = [
  /gpt-4o/i,
  /gpt-4\.1/i,
  /gpt-5/i,
  /gemini/i,
  /claude-(3|4)/i,
  /qwen.*(-vl|vision|2\.5vl)/i,
  /llava/i,
  /bakllava/i,
  /minicpm-v/i,
  /moondream/i,
  /gemma3/i,
  /phi-3-vision/i,
  /phi-4.*vision/i,
  /idefics/i,
  /internvl/i,
  /pixtral/i,
  /o1/i,
  /o3/i,
  /o4/i,
  /grok-.*vision/i,
  /llama-3\.2.*vision/i,
  /llama-4/i,
  /smolvlm/i,
  /paligemma/i,
  /qwen2\.5-vl/i,
];

/** Detecta el MIME de una imagen base64 por magic bytes (PNG/JPEG/WebP/GIF). */
function detectMime(base64) {
  try {
    const b = Buffer.from(base64, 'base64');
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
      return 'image/png';
    }
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
      return 'image/jpeg';
    }
    if (
      b.length >= 12 &&
      b.slice(0, 4).toString('ascii') === 'RIFF' &&
      b.slice(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp';
    }
    if (b.length >= 4 && b.slice(0, 4).toString('ascii') === 'GIF8') {
      return 'image/gif';
    }
  } catch {
    /* ignore */
  }
  return 'image/jpeg'; // fallback seguro
}

/** Modelos de visión conocidos por Ollama (por orden de preferencia).
 * Solo se usan como fallback cuando /api/tags NO reporta capabilities
 * (versiones antiguas de Ollama). Cuando el runtime reporta capabilities,
 * la detección real gana: un modelo solo se considera de visión si su
 * capability incluye 'vision'. */
const VISION_MODELS = [
  'qwen2.5vl',
  'llava',
  'llava-llama3',
  'bakllava',
  'minicpm-v',
  'moondream',
  'gemma3',
];

function hasVisionCapability(model) {
  return Array.isArray(model.capabilities) && model.capabilities.includes('vision');
}

function isVisionTag(tag) {
  const t = String(tag || '').toLowerCase();
  return VISION_MODELS.some((m) => t.startsWith(m));
}

async function ollamaFetch(path, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OLLAMA_BASE}${path}`, {
      ...options,
      signal: controller.signal,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: null, error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Lista los modelos de visión instalados en Ollama, con su metadata real
 * (tamaño, familia, cuantización, parámetros).
 */
async function listVisionModels() {
  const { ok, status, data, error } = await ollamaFetch('/api/tags', { method: 'GET' });
  if (!ok) {
    return {
      available: false,
      error: error ? `Ollama no responde (${error})` : `Ollama respondió HTTP ${status}`,
      models: [],
    };
  }
  const tags = Array.isArray(data?.models) ? data.models : [];
  // Prioridad 1: capabilities reales de /api/tags (fuente de verdad cuando existe).
  // Prioridad 2 (fallback Ollama antiguo): heurística por nombre de familia.
  const hasCapabilityField = tags.some((m) => Array.isArray(m.capabilities));
  const models = tags
    .filter((m) => (hasCapabilityField ? hasVisionCapability(m) : isVisionTag(m.name)))
    .map((m) => ({
      id: m.name,
      name: m.name,
      sizeBytes: Number(m.size) || null,
      sizeHuman: null,
      family: m.details?.family || null,
      families: Array.isArray(m.details?.families) ? m.details.families : [],
      parameterSize: m.details?.parameter_size || null,
      quantization: m.details?.quantization_level || null,
      contextLength: m.details?.context_length || null,
      capabilities: Array.isArray(m.capabilities) ? m.capabilities : [],
      modifiedAt: m.modified_at || null,
    }));
  return { available: models.length > 0, models, error: null };
}

/** Valida y normaliza una imagen base64. */
function normalizeImage(base64) {
  if (typeof base64 !== 'string' || base64.length === 0) {
    throw new Error('imagen requerida (base64)');
  }
  const withoutPrefix = base64.replace(/^data:image\/[a-z0-9+.-]+;base64,/, '');
  const bytes = Buffer.from(withoutPrefix, 'base64');
  if (bytes.length === 0) {
    throw new Error('imagen vacía o inválida');
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`imagen demasiado grande (máx ${MAX_IMAGE_BYTES / 1024 / 1024} MB)`);
  }
  return bytes.toString('base64');
}

/**
 * Analiza una imagen con el mejor modelo de visión instalado.
 *
 * @param {string} base64 - Imagen en base64 (data-uri o cruda).
 * @param {object} options
 * @param {string} [options.task] - 'describe' | 'ocr' | 'detect' | 'classify' | 'all'
 * @param {string} [options.prompt] - Prompt personalizado (sustituye al de la tarea).
 * @param {string} [options.model] - Id de modelo concreto (opcional).
 */
/* ------------------------------------------------------------------ */
/* Proveedores externos (FASE 35) — Visión con TODOS los LLM            */
/* ------------------------------------------------------------------ */

/** ¿El modelo es (probablemente) multimodal? Solo marca coincidencias
 *  conocidas; sin coincidencia devuelve null (desconocido, honesto). */
function modelIsVisionCapable(modelName = '') {
  const m = String(modelName || '');
  if (!m) return null;
  const hit = VISION_MODEL_PATTERNS.find((re) => re.test(m));
  if (hit) {
    return true;
  }
  return null; // desconocido, no se asume
}

/**
 * Lista modelos de visión disponibles: locales (Ollama, capability real) +
 * modelos multimodales de los proveedores configurados (patrón conocido).
 * @param {object} [endpointsConfig] — req.config.endpoints
 */
async function listAllVisionModels(endpointsConfig = null) {
  const local = await listVisionModels();
  const external = [];
  if (endpointsConfig && typeof endpointsConfig === 'object') {
    for (const [provider, cfg] of Object.entries(endpointsConfig)) {
      if (!cfg || typeof cfg !== 'object') continue;
      const baseURL = cfg.baseURL || cfg.apiEndpoint || null;
      if (!baseURL) continue;
      let models = [];
      if (Array.isArray(cfg.models?.default)) {
        models = cfg.models.default;
      } else if (Array.isArray(cfg.models)) {
        models = cfg.models;
      }
      for (const model of models) {
        const vision = modelIsVisionCapable(model);
        if (vision === true) {
          external.push({
            id: `${provider}:${model}`,
            provider,
            model,
            name: `${model} (${provider})`,
            source: 'provider',
            sizeBytes: null,
            sizeHuman: null,
            family: provider,
            parameterSize: null,
            quantization: null,
            contextLength: null,
            capabilities: ['vision'],
            modifiedAt: null,
          });
        }
      }
    }
  }
  return { ...local, local: local.models, external, models: [...local.models, ...external] };
}

/** Resuelve la clave real de un endpoint (apiKey del config o clave del usuario). */
async function resolveEndpointKey(provider, cfg, resolveUserKey) {
  const apiKey = cfg.apiKey;
  if (apiKey && apiKey !== 'user_provided' && !String(apiKey).startsWith('${')) {
    return apiKey;
  }
  if (typeof resolveUserKey === 'function') {
    try {
      const key = await resolveUserKey({ userId: null, name: provider });
      if (key) return key;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Prompt por tarea (reutilizado para todos los proveedores). */
function buildPrompt(task, customPrompt) {
  if (customPrompt) return customPrompt;
  const PROMPTS = {
    describe:
      'Describe esta imagen en detalle: qué se ve, objetos, personas, escena, colores, texto visible y cualquier detalle relevante. Responde en español.',
    ocr: 'Extrae TODO el texto que aparece en esta imagen, exactamente como está escrito, respetando el orden. Responde SOLO con el texto extraído, sin comentarios. Si no hay texto, responde "(sin texto)".',
    detect:
      'Detecta y lista los objetos y personas que aparecen en esta imagen, con una ubicación aproximada (izquierda/centro/derecha, arriba/abajo) y una estimación de confianza. Responde en español.',
    detect_boxes:
      'Detect objects in this image. Return a JSON array where each element is {"label": "object name in Spanish", "box_2d": [x1, y1, x2, y2]} with coordinates normalized between 0 and 1 (0,0 = top-left, 1,1 = bottom-right). Include 2 to 10 objects. Respond ONLY with the JSON array, no commentary.',
    classify:
      'Clasifica esta imagen: tipo de contenido (foto, dibujo, diagrama, captura de pantalla, documento…), categoría general, tema y estado de calidad. Responde en español.',
    all: 'Analiza esta imagen de forma completa: descripción general, objetos detectados, texto extraído (si hay), categoría y cualquier otra observación útil. Responde en español.',
  };
  return PROMPTS[task] || PROMPTS.describe;
}

/**
 * Analiza la imagen con un proveedor externo (OpenAI-compatible, Anthropic
 * o Google) usando el modelo multimodal indicado.
 */
async function analyzeWithProvider(base64, options, cfg, resolveUserKey) {
  const { provider, model, task, prompt: customPrompt } = options;
  const prompt = buildPrompt(task, customPrompt);
  const mime = detectMime(base64);
  const baseURL = String(cfg.baseURL || cfg.apiEndpoint || '').replace(/\/$/, '');
  const apiKey = await resolveEndpointKey(provider, cfg, resolveUserKey);
  if (!apiKey) {
    return {
      success: false,
      available: true,
      provider,
      error: `El proveedor «${provider}» requiere una API key configurada.`,
    };
  }

  const isAnthropic = /anthropic/i.test(provider) || /api\.anthropic\.com/.test(baseURL);
  const isGoogle =
    /google|gemini|vertexai/i.test(provider) || /generativelanguage|googleapis\.com/.test(baseURL);

  let url;
  let headers;
  let body;

  if (isAnthropic) {
    const apiBase = baseURL || 'https://api.anthropic.com';
    url = `${apiBase.replace(/\/v1$/, '')}/v1/messages`;
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
    body = {
      model,
      max_tokens: task === 'ocr' ? 1024 : 512,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
          ],
        },
      ],
    };
  } else if (isGoogle) {
    const key = apiKey;
    const apiBase = baseURL || 'https://generativelanguage.googleapis.com';
    const ver = /generativelanguage/.test(apiBase) ? '/v1beta' : '';
    url = `${apiBase}${ver}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    headers = { 'Content-Type': 'application/json' };
    body = {
      contents: [
        {
          parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: base64 } }],
        },
      ],
    };
  } else {
    // OpenAI-compatible (openai, openrouter, litellm, groq, mistral, custom)
    const apiBase = baseURL || 'https://api.openai.com/v1';
    const slash = apiBase.endsWith('/v1') ? '' : '/v1';
    url = `${apiBase}${slash}/chat/completions`;
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
    body = {
      model,
      max_tokens: task === 'ocr' ? 1024 : 512,
      temperature: 0.4,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:${mime};base64,${base64}` },
            },
          ],
        },
      ],
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      return {
        success: false,
        available: true,
        provider,
        model,
        error: `${provider} respondió HTTP ${res.status}: ${typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data || {}).slice(0, 200)}`,
      };
    }
    // Extraer texto de la respuesta de cada formato
    let textOut = '';
    if (isAnthropic && data?.content) {
      textOut = (Array.isArray(data.content) ? data.content : [])
        .filter((c) => c?.type === 'text')
        .map((c) => c.text)
        .join('\n');
    } else if (isGoogle && data?.candidates?.[0]?.content?.parts) {
      textOut = data.candidates[0].content.parts
        .filter((p) => p?.text)
        .map((p) => p.text)
        .join('\n');
    } else if (data?.choices?.[0]?.message?.content) {
      const c = data.choices[0].message.content;
      textOut = Array.isArray(c)
        ? c
            .filter((x) => x?.type === 'text')
            .map((x) => x.text)
            .join('\n')
        : String(c);
    }
    if (!textOut) {
      return {
        success: false,
        available: true,
        provider,
        model,
        error: 'El proveedor no devolvió texto',
      };
    }
    return {
      success: true,
      available: true,
      provider,
      model,
      task,
      text: textOut,
      usage: data?.usage || null,
    };
  } catch (error) {
    return {
      success: false,
      available: true,
      provider,
      model,
      error: `Error de inferencia: ${error.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Analiza una imagen con el mejor modelo de visión disponible: local
 * (Ollama) o cualquier proveedor configurado (FASE 35).
 *
 * @param {string} base64 - Imagen en base64.
 * @param {object} options
 * @param {string} [options.task]
 * @param {string} [options.prompt]
 * @param {string} [options.model] - id completo (local o `${provider}:${model}`).
 * @param {string} [options.provider] - 'ollama' (default) o nombre de endpoint.
 * @param {object} [endpointsConfig] - req.config.endpoints (para externos).
 * @param {Function} [resolveUserKey] - ({userId,name}) => clave del usuario.
 */
async function analyzeImage(base64, options = {}, endpointsConfig = null, resolveUserKey = null) {
  const image = normalizeImage(base64);
  const task = options.task || 'describe';
  const provider = options.provider;

  // Proveedor externo explícito
  if (provider && provider !== 'ollama' && provider !== 'local' && provider !== 'Ollama (local)') {
    const cfg = endpointsConfig?.[provider];
    if (!cfg) {
      return {
        success: false,
        available: true,
        error: `Proveedor «${provider}» no configurado`,
        provider,
      };
    }
    let model = options.model;
    // El model puede venir como `provider:model`
    if (model && model.includes(':')) {
      const [p, ...rest] = model.split(':');
      if (p === provider) model = rest.join(':');
    }
    if (!model) {
      const defaults = Array.isArray(cfg.models?.default) ? cfg.models.default : [];
      model = defaults.find((m) => modelIsVisionCapable(m)) || defaults[0];
    }
    if (!model) {
      return {
        success: false,
        available: true,
        provider,
        error: 'El proveedor no tiene modelos configurados',
      };
    }
    return analyzeWithProvider(
      image,
      { provider, model, task, prompt: options.prompt },
      cfg,
      resolveUserKey,
    );
  }

  const { available, models, error: listError } = await listVisionModels();
  if (!available) {
    return {
      success: false,
      available: false,
      error:
        listError ||
        'No hay modelos de visión instalados. Instala uno: ollama pull qwen2.5vl:3b o llava:7b',
      installHint: 'ollama pull qwen2.5vl:3b',
      models: [],
    };
  }

  let modelId = options.model;
  if (!modelId) {
    const preferred = models.find((m) => m.name.startsWith('qwen2.5vl')) || models[0];
    modelId = preferred.name;
  } else if (!models.some((m) => m.name === modelId)) {
    return {
      success: false,
      available: true,
      error: `Modelo «${modelId}» no está instalado`,
      models,
    };
  }

  const prompt = buildPrompt(task, options.prompt);
  const isBoxTask = task === 'detect_boxes';

  // FASE 38: detección con cajas — flujo en 2 pasos para moondream y
  // modelos similares: 1) lista de objetos presentes, 2) cabecera de
  // detección nativa `Detect: <objeto>` que devuelve cajas normalizadas
  // para TODOS los objetos detectados (verificado con moondream real).
  if (isBoxTask) {
    const boxes = await detectBoxesWithMoondream(image, modelId);
    return {
      success: boxes !== null,
      available: true,
      task,
      model: modelId,
      text: boxes
        ? boxes
            .map(
              (b) =>
                `${b.label} (${Math.round(b.x1 * 100)}-${Math.round(b.x2 * 100)}% x, ${Math.round(b.y1 * 100)}-${Math.round(b.y2 * 100)}% y)`,
            )
            .join('\n')
        : 'No se pudieron obtener cajas de detección (el modelo no devolvió coordenadas válidas).',
      boxes,
      models,
    };
  }

  const payload = {
    model: modelId,
    messages: [
      {
        role: 'user',
        content: prompt,
        images: [image],
      },
    ],
    stream: false,
    options: {
      temperature: 0.4,
      num_predict: task === 'ocr' ? 1024 : 512,
    },
  };

  const { ok, status, data, error } = await ollamaFetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!ok) {
    return {
      success: false,
      available: true,
      error: error ? `Error de inferencia: ${error}` : `Ollama respondió HTTP ${status}`,
      model: modelId,
      models,
    };
  }

  const text = data?.message?.content || '';
  if (!text) {
    return {
      success: false,
      available: true,
      error: 'El modelo no devolvió texto',
      model: modelId,
      models,
    };
  }

  return {
    success: true,
    available: true,
    task,
    model: modelId,
    text,
    usage:
      data?.prompt_eval_count != null
        ? {
            promptTokens: data.prompt_eval_count,
            completionTokens: data.eval_count,
            totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
          }
        : null,
    models,
  };
}

/**
 * Parsea la salida JSON de `detect_boxes` en cajas normalizadas.
 * Acepta dos formatos reales de moondream:
 *   A) Array:   [{"label":"...","box_2d":[x1,y1,x2,y2]}, ...]
 *   B) Mapa:    {"cat":[x1,y1,x2,y2], "botella":[...]}  (cabecera Detect:)
 * Devuelve [{label,x1,y1,x2,y2}] normalizado (0..1) o null si no hay cajas
 * válidas (no se inventan coordenadas).
 */
function parseBoxes(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const arrMatch = raw.match(/\[\s*\{[^]*?\}\]/);
    if (arrMatch) {
      try {
        parsed = JSON.parse(arrMatch[0]);
      } catch {
        /* no-op */
      }
    }
  }
  if (!parsed) {
    // Fallback para JSON truncado (moondream corta con num_predict): extrae
    // pares "etiqueta": [n,n,n,n] directamente del texto crudo.
    const re =
      /"([^"]{1,40})"\s*:\s*\[\s*([-\d.,eE]+)\s*,\s*([-\d.,eE]+)\s*,\s*([-\d.,eE]+)\s*,\s*([-\d.,eE]+)\s*\]/g;
    const found = [];
    let m;
    while ((m = re.exec(raw)) !== null) {
      found.push({ label: m[1], box: [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])] });
    }
    if (found.length > 0) {
      const boxes = [];
      const seen = new Set();
      for (const f of found) {
        const nums = f.box;
        if (nums.some((n) => !Number.isFinite(n))) continue;
        const [x1, y1, x2, y2] = nums;
        if (x2 <= x1 || y2 <= y1) continue;
        const key = `${f.label}|${nums.map((n) => n.toFixed(2)).join(',')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        boxes.push({
          label: f.label.slice(0, 60),
          x1: Math.max(0, Math.min(1, x1)),
          y1: Math.max(0, Math.min(1, y1)),
          x2: Math.max(0, Math.min(1, x2)),
          y2: Math.max(0, Math.min(1, y2)),
        });
      }
      return boxes.length > 0 ? boxes.slice(0, 12) : null;
    }
    return null;
  }
  const boxes = [];
  const seen = new Set();
  const pushBox = (label, arr) => {
    if (!Array.isArray(arr) || arr.length < 4) return;
    const nums = arr.slice(0, 4).map(Number);
    if (nums.some((n) => !Number.isFinite(n))) return;
    const [x1, y1, x2, y2] = nums;
    // Descarta cajas degeneradas (más grandes que la imagen o fuera de rango)
    if (x2 <= x1 || y2 <= y1) return;
    const key = `${label}|${nums.map((n) => n.toFixed(2)).join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);
    boxes.push({
      label: String(label || 'objeto').slice(0, 60),
      x1: Math.max(0, Math.min(1, x1)),
      y1: Math.max(0, Math.min(1, y1)),
      x2: Math.max(0, Math.min(1, x2)),
      y2: Math.max(0, Math.min(1, y2)),
    });
  };
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      let box = null;
      if (Array.isArray(item.box_2d)) {
        box = item.box_2d;
      } else if (Array.isArray(item.box)) {
        box = item.box;
      }
      if (box) pushBox(item.label || item.name, box);
    }
  } else if (Array.isArray(parsed.boxes)) {
    for (const item of parsed.boxes) {
      if (!item || typeof item !== 'object') continue;
      pushBox(item.label || item.name, Array.isArray(item.box_2d) ? item.box_2d : item.box);
    }
  } else if (Array.isArray(parsed.objects)) {
    for (const item of parsed.objects) {
      if (!item || typeof item !== 'object') continue;
      pushBox(item.label || item.name, Array.isArray(item.box_2d) ? item.box_2d : item.box);
    }
  } else {
    // Formato mapa: {"cat":[x1,y1,x2,y2], ...}
    for (const [label, box] of Object.entries(parsed)) {
      pushBox(label, box);
    }
  }
  return boxes.length > 0 ? boxes.slice(0, 12) : null;
}

/** Parsea la lista de objetos del paso 1. moondream responde con JSON variado:
 *  - array: ["perro","botella"]
 *  - mapa de traducción: {"perro":"dog", "botella":"cat"} (clave ES, valor EN)
 *  La cabecera `Detect:` nativa funciona mejor con etiquetas en inglés, así que
 *  en el mapa se prefieren los VALORES (EN). */
function parseLabelList(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const arrMatch = raw.match(/\[[^\]]*\]/);
    if (arrMatch) {
      try {
        parsed = JSON.parse(arrMatch[0]);
      } catch {
        /* no-op */
      }
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const labels = [];
  const push = (l) => {
    const s = String(l || '')
      .trim()
      .slice(0, 40);
    if (s.length > 1 && s.length < 40) labels.push(s);
  };
  if (Array.isArray(parsed)) {
    parsed.forEach(push);
  } else {
    // Mapa: valores primero (EN para Detect:), luego claves (ES) como respaldo.
    Object.values(parsed).forEach(push);
    Object.keys(parsed).forEach((k) => {
      if (!labels.includes(k)) push(k);
    });
  }
  return labels.length > 0 ? labels.slice(0, 6) : null;
}

/**
 * Detecta objetos con cajas (moondream nativo). Paso 1: lista de objetos
 * presentes. Paso 2: cabecera de detección `Detect: <objeto>` que devuelve
 * cajas normalizadas de todos los objetos que ve. Sin claves, 100% local.
 */
async function detectBoxesWithMoondream(image, modelId) {
  // Paso 1 — lista de objetos presentes
  const listPayload = {
    model: modelId,
    messages: [
      {
        role: 'user',
        content:
          'List the main objects in this image. Respond ONLY with a JSON array of object names in Spanish, maximum 6 items. Example: ["perro","botella"]. No commentary.',
        images: [image],
      },
    ],
    stream: false,
    format: 'json',
    options: { temperature: 0.1, num_predict: 256 },
  };
  const listRes = await ollamaFetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(listPayload),
  });
  const step1Text = listRes.data?.message?.content || '';
  // A veces moondream devuelve las cajas DIRECTAMENTE en el paso 1
  // (mapa {etiqueta: [x1,y1,x2,y2]}). Si es así, ya terminamos.
  const directBoxes = parseBoxes(step1Text);
  if (directBoxes) {
    return directBoxes;
  }
  const labels = parseLabelList(step1Text);
  if (!labels || labels.length === 0) {
    return null;
  }
  // Paso 2 — detección nativa. moondream solo produce cajas para los objetos
  // de los que está seguro (los demás devuelven salida degenerada), así que se
  // prueban hasta 4 etiquetas y se usa la primera que dé cajas parseables.
  for (const label of labels.slice(0, 4)) {
    const detPayload = {
      model: modelId,
      prompt: `Detect: ${label}`,
      images: [image],
      stream: false,
      format: 'json',
      options: { temperature: 0.1, num_predict: 512 },
    };
    const detRes = await ollamaFetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(detPayload),
    });
    const raw = detRes.data?.response || detRes.data?.message?.content || '';
    const boxes = parseBoxes(raw);
    if (boxes) {
      return boxes;
    }
  }
  return null;
}

module.exports = {
  listVisionModels,
  listAllVisionModels,
  analyzeImage,
  normalizeImage,
  detectMime,
  modelIsVisionCapable,
  parseBoxes,
  parseLabelList,
  VISION_MODELS,
  VISION_MODEL_PATTERNS,
};
