/**
 * Local Models Routes — FASE 14.
 *
 * Expone al dashboard los proveedores de modelos locales (Ollama hoy, LM
 * Studio/llama.cpp/vLLM mañana) vía la abstracción LocalModelProvider.
 *
 *   GET  /api/local-models                 → proveedores + estado + modelos
 *   GET  /api/local-models/:id/models      → solo modelos de un proveedor
 *   POST /api/local-models/:id/refresh     → re-consultar al runtime
 *   PATCH /api/local-models/:id            → { endpoint?, enabled? } (persistente)
 *
 * Seguridad:
 *  - requireJwtAuth en todas las rutas (mismo patrón que el resto del panel).
 *  - Los endpoints se validan con LocalModelProvider.validateEndpoint
 *    (solo http/https, sin credenciales, puertos válidos) — un endpoint
 *    malicioso no puede hacer SSRF fuera de http(s).
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');
const {
  discoverAll,
  refreshProvider,
  updateProvider,
  searchCatalog,
  searchExternal,
  getHfQuants,
  getOllamaDiskSpace,
  pullOllamaModel,
  deleteOllamaModel,
  resolveProjectUrl,
} = require('~/server/services/localProviders');

/** GET /api/local-models — estado y modelos de todos los proveedores locales. */
router.get('/', requireJwtAuth, async (_req, res) => {
  try {
    const providers = await discoverAll();
    res.json({ success: true, providers, at: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/local-models/hf-quants?repo=… — cuantizaciones GGUF de un repo de
 * Hugging Face (para elegir cuantización antes de descargar, FASE 19).
 */
router.get('/hf-quants', requireJwtAuth, async (req, res) => {
  try {
    const result = await getHfQuants(String(req.query.repo || ''));
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(502).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/local-models/resolve-url?url=… — FASE 31: resuelve la URL (o id)
 * de un proyecto/modelo pegado por el usuario (Hugging Face, GitHub o id de
 * Ollama) y devuelve su metadata real: peso, parámetros, licencia, MoE/Dense,
 * modalidad, descargas… Nunca inventa datos.
 */
router.get('/resolve-url', requireJwtAuth, async (req, res) => {
  try {
    const entry = await resolveProjectUrl(String(req.query.url || ''));
    res.json({ success: true, model: entry });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
      cause: error.cause ? String(error.cause.message || error.cause) : undefined,
    });
  }
});

/**
 * GET /api/local-models/ollama/space — espacio libre del volumen de Ollama
 * (FASE 20). Devuelve null si no se puede determinar (mount ausente).
 */
router.get('/ollama/space', requireJwtAuth, (_req, res) => {
  try {
    const space = getOllamaDiskSpace();
    res.json({ success: true, space });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** GET /api/local-models/:id/models — modelos de un proveedor puntual. */
router.get('/:id/models', requireJwtAuth, async (req, res) => {
  try {
    const result = await refreshProvider(req.params.id);
    res.json({ success: true, provider: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/** POST /api/local-models/:id/refresh — re-consultar el runtime. */
router.post('/:id/refresh', requireJwtAuth, async (req, res) => {
  try {
    const result = await refreshProvider(req.params.id);
    res.json({ success: true, provider: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/** PATCH /api/local-models/:id — { endpoint?, enabled? } persistente. */
router.patch('/:id', requireJwtAuth, async (req, res) => {
  try {
    const result = updateProvider(req.params.id, req.body || {});
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/local-models/search?source=catalog|huggingface|github&q=…
 * Búsqueda unificada: catálogo curado (con tamaño real) o fuentes externas
 * reales (Hugging Face API pública / GitHub repos). Cada fuente falla de
 * forma aislada para no romper el panel.
 */
router.get('/search', requireJwtAuth, async (req, res) => {
  try {
    const source = String(req.query.source || 'catalog');
    // FASE 26: categoría (llm | imagen | video | voz | audio | embeddings | multimodal)
    // filtra por pipeline_tag en Hugging Face para separar tipos de modelos.
    const category = String(req.query.category || 'llm');
    const result = await searchExternal(source, String(req.query.q || ''), category);
    res.json({ success: true, source, category, ...result });
  } catch (error) {
    res.status(502).json({
      success: false,
      source: String(req.query.source || 'catalog'),
      error: error.message,
    });
  }
});

/**
 * GET /api/local-models/catalog?q=… — catálogo de LLM abiertos explorables.
 * (Debe ir ANTES de '/:id/models' para no chocar con el parámetro.)
 */
router.get('/catalog', requireJwtAuth, async (req, res) => {
  try {
    const result = await searchCatalog(String(req.query.q || ''));
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/local-models/:id/pull — descarga un modelo (hoy Ollama).
 * Responde un stream SSE con el progreso de la descarga:
 *   data: {"status":"pulling manifest"}
 *   data: {"status":"pulling <digest>","digest":…,"total":…,"completed":…}
 *   data: {"status":"success"}
 *   data: {"status":"paused"}   ← el cliente abortó (pausa manual)
 *
 * FASE 19: si el cliente cierra la conexión (pausa), se aborta el pull en
 * Ollama (conserva blobs parciales); un nuevo POST REANUDA desde ahí.
 */
router.post('/:id/pull', requireJwtAuth, async (req, res) => {
  const { id } = req.params;
  if (id !== 'ollama') {
    return res.status(400).json({ success: false, error: 'solo se soporta descarga vía Ollama' });
  }
  const { model } = req.body || {};
  // Permite ids de Ollama (qwen3:0.6b) y GGUF de Hugging Face
  // (hf.co/owner/repo:quant). El string va solo en el body JSON del API de
  // Ollama (sin shell), así que la validación es un sanity check.
  if (typeof model !== 'string' || model.length > 200 || !/^[\w.\-:/]+$/.test(model)) {
    return res.status(400).json({ success: false, error: 'model inválido' });
  }
  const controller = new AbortController();
  // Pausa: solo si el cliente cortó la conexión ANTES de terminar la respuesta
  // (si la respuesta ya terminó normal, `writableEnded` es true y no abortamos).
  res.on('close', () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  try {
    for await (const line of pullOllamaModel(model, controller.signal)) {
      res.write(`data: ${JSON.stringify(line)}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ status: 'done', model })}\n\n`);
    res.end();
  } catch (error) {
    if (error && error.message === 'PULL_PAUSED') {
      res.write(`data: ${JSON.stringify({ status: 'paused', model })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ status: 'error', error: error.message })}\n\n`);
    }
    res.end();
  }
});

/**
 * POST /api/local-models/:id/delete — borra un modelo instalado (Ollama).
 * FASE 19: botón "Borrar" en la pestaña Instalados.
 */
router.post('/:id/delete', requireJwtAuth, async (req, res) => {
  const { id } = req.params;
  if (id !== 'ollama') {
    return res.status(400).json({ success: false, error: 'solo se soporta borrado vía Ollama' });
  }
  const { model } = req.body || {};
  if (typeof model !== 'string' || model.length > 200 || !/^[\w.\-:/]+$/.test(model)) {
    return res.status(400).json({ success: false, error: 'model inválido' });
  }
  try {
    const result = await deleteOllamaModel(model);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(502).json({ success: false, error: error.message });
  }
});

module.exports = router;
