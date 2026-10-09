/**
 * ComfyUI proxy — FASE 29 + Video (FASE V).
 * Puente controlado del dashboard hacia el servidor ComfyUI local (MIT-licensed,
 * open-source). El cliente nunca habla directo con ComfyUI; aquí se validan los
 * workflows (máximo de nodos, sin clases de red, timeouts) para evitar abusos/SSRF.
 *
 *   GET  /api/comfyui/health        → estado (devices, versión)
 *   POST /api/comfyui/prompt         → { workflow } → { prompt_id }
 *   GET  /api/comfyui/history/:id    → estado de una generación
 *   GET  /api/comfyui/view/:file     → imagen/video generado (solo output local)
 *   POST /api/comfyui/video          → generar video desde texto (AnimateDiff/SVD)
 *   GET  /api/comfyui/models         → modelos disponibles (checkpoints)
 *   GET  /api/comfyui/loras          → LoRAs disponibles
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');

const COMFY_URL = process.env.COMFYUI_URL || 'http://comfyui:8188';
const PROMPT_TIMEOUT_MS = 15000;
const MAX_NODES = 200;
const ALLOWED_CLASSES = new Set([
  'CheckpointLoaderSimple',
  'CLIPTextEncode',
  'EmptyLatentImage',
  'KSampler',
  'VAEDecode',
  'SaveImage',
  'SaveAnimatedWEBP',
  'SaveVideo',
  'LoadImage',
  'ImageScale',
  'VAEEncode',
  'VAEEncodeForInpaint',
  'CLIPSetLastLayer',
  'LoraLoader',
  'ControlNetLoader',
  // Video nodes (AnimateDiff, SVD)
  'ADE_AnimateDiffLoaderGen1',
  'ADE_AnimateDiffCombine',
  'ADE_AnimateDiffSampler',
  'AnimateDiffLoader',
  'AnimateDiffSampler',
  'AnimateDiffCombine',
  'SVD_img2vid_Conditioning',
  'ImageBatchNSetSize',
  'EmptyLatentImageBatch',
  'VAEAnimateDiffDecode',
  'VHS_VideoCombine',
  'VHS_LoadVideo',
  'FrameCombine',
]);

router.get('/health', requireJwtAuth, async (_req, res) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(`${COMFY_URL}/system_stats`, { signal: controller.signal });
    clearTimeout(timer);
    res.status(r.status).json(await r.json());
  } catch (error) {
    res.status(503).json({
      error: 'ComfyUI no disponible: ' + error.message,
      cause: error.cause ? String(error.cause.message || error.cause) : null,
    });
  }
});

router.post('/prompt', requireJwtAuth, async (req, res) => {
  try {
    const prompt = req.body?.workflow;
    if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)) {
      return res.status(400).json({ error: 'workflow requerido' });
    }
    const nodes = Object.values(prompt);
    if (nodes.length === 0 || nodes.length > MAX_NODES) {
      return res.status(400).json({ error: `workflow inválido (0 < nodos <= ${MAX_NODES})` });
    }
    for (const node of nodes) {
      if (!node || typeof node !== 'object' || typeof node.class_type !== 'string') {
        return res.status(400).json({ error: 'nodo inválido' });
      }
      if (!ALLOWED_CLASSES.has(node.class_type)) {
        return res.status(400).json({ error: `clase de nodo no permitida: ${node.class_type}` });
      }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROMPT_TIMEOUT_MS);
    const r = await fetch(`${COMFY_URL}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, client_id: 'dashboard' }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const json = await r.json();
    res.status(r.status).json(json);
  } catch (error) {
    res.status(502).json({ error: 'ComfyUI no disponible: ' + error.message });
  }
});

router.get('/history/:promptId', requireJwtAuth, async (req, res) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(`${COMFY_URL}/history/${encodeURIComponent(req.params.promptId)}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    res.status(r.status).json(await r.json());
  } catch (error) {
    res.status(502).json({ error: 'ComfyUI no disponible: ' + error.message });
  }
});

// R42: /view es PÚBLICO (sin auth) para que las imágenes generadas puedan
// renderizarse en el chat con <img> (los tags <img> no pueden enviar el header
// Authorization, por eso daba "No auth token"). Mitigación de seguridad: los
// nombres de archivo generados usan prefijos aleatorios no adivinables
// (gen_<timestamp>_<random>), así que la URL funciona como un enlace tipo
// "capability" (solo quien conoce la URL puede ver la imagen). El fetch solo
// va a ComfyUI local con el filename sanitizado [A-Za-z0-9._-] — sin SSRF.
router.get('/view/:file', async (req, res) => {
  try {
    const file = String(req.params.file || '').replace(/[^A-Za-z0-9._-]/g, '');
    if (!file) {
      return res.status(400).json({ error: 'archivo inválido' });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const r = await fetch(
      `${COMFY_URL}/view?filename=${encodeURIComponent(file)}&subfolder=&type=output`,
      {
        signal: controller.signal,
      },
    );
    clearTimeout(timer);
    if (!r.ok) {
      return res.status(r.status).json({ error: 'imagen no encontrada' });
    }
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/png');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (error) {
    res.status(502).json({ error: 'ComfyUI no disponible: ' + error.message });
  }
});

// POST /api/comfyui/video — generar video desde texto vía ComfyUI (AnimateDiff/SVD).
// Usa el servicio ComfyUIService para construir y ejecutar el workflow.
router.post('/video', requireJwtAuth, async (req, res) => {
  try {
    const { prompt, negative_prompt, model, frames, steps, cfg, seed, width, height } =
      req.body ?? {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt requerido' });
    }
    const comfyService = require('~/server/services/ComfyUI').getService();
    const result = await comfyService.generateVideo({
      prompt,
      negativePrompt: negative_prompt || '',
      model: model || 'animatediff',
      frames: Math.min(Math.max(Number(frames) || 16, 4), 64),
      steps: Math.min(Math.max(Number(steps) || 20, 4), 40),
      cfg: Math.min(Math.max(Number(cfg) || 7, 1), 20),
      seed: seed ? Number(seed) : undefined,
      width: Math.min(Math.max(Number(width) || 512, 256), 1024),
      height: Math.min(Math.max(Number(height) || 512, 256), 1024),
    });
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: 'ComfyUI video no disponible: ' + error.message });
  }
});

// GET /api/comfyui/models — lista de checkpoints disponibles
router.get('/models', requireJwtAuth, async (_req, res) => {
  try {
    const comfyService = require('~/server/services/ComfyUI').getService();
    const models = await comfyService.getModels();
    res.json({ models });
  } catch (error) {
    res.status(502).json({ error: 'ComfyUI no disponible: ' + error.message });
  }
});

// GET /api/comfyui/loras — lista de LoRAs disponibles
router.get('/loras', requireJwtAuth, async (_req, res) => {
  try {
    const comfyService = require('~/server/services/ComfyUI').getService();
    const loras = await comfyService.getLoRAs();
    res.json({ loras });
  } catch (error) {
    res.status(502).json({ error: 'ComfyUI no disponible: ' + error.message });
  }
});

// Exportado como { router } porque el agregado de rutas (routes/index.js) lo
// consume así: app.use('/api/comfyui', routes.comfyui.router).
module.exports = { router };
