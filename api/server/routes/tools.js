/**
 * Tools Routes — Fase D del freelancer (D1/D2/D3), 12-ago-2026.
 *
 * Proxy hacia el servidor REAL de mi-opencode (Session API) para exponer al
 * Panel Enterprise:
 *   - D1: el catálogo completo de tools (ids + descripción + schema de
 *         parámetros) en formato legible para el frontend.
 *   - D2: sesiones reales y sus mensajes (para ver resultados de
 *         browser-control / sandbox).
 *   - D3: lectura y actualización de la config (enable/disable de tools,
 *         skills, mcp) vía PATCH /config de mi-opencode.
 *
 * Regla de honestidad: no hay placeholders. Si mi-opencode no responde, el
 * endpoint devuelve 503 con el motivo real (no datos falsos).
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');

// URL del servidor de mi-opencode. Dentro de la red docker es
// http://mi-opencode:4096; en desarrollo local se puede sobreescribir con
// OPENCODE_SERVER_URL=http://localhost:4096
const OPENCODE_SERVER_URL = process.env.OPENCODE_SERVER_URL || 'http://mi-opencode:4096';
const OPENCODE_SERVER_PASSWORD = process.env.OPENCODE_SERVER_PASSWORD || '';

function authHeaders() {
  if (!OPENCODE_SERVER_PASSWORD) return {};
  const token = Buffer.from(`opencode:${OPENCODE_SERVER_PASSWORD}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

/**
 * GET interno: fetch con timeout hacia mi-opencode.
 * Devuelve { ok, status, data } — nunca lanza por el error del upstream.
 */
async function opencodeFetch(path, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OPENCODE_SERVER_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    let data = null;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { ok: res.ok, status: res.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: null, error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

function upstreamError(res, upstream, fallback) {
  if (upstream.error) {
    return res.status(503).json({
      success: false,
      error: `mi-opencode no responde (${upstream.error})`,
      upstream: true,
    });
  }
  if (!upstream.ok) {
    return res.status(upstream.status || 502).json({
      success: false,
      error: `mi-opencode devolvió HTTP ${upstream.status}`,
      upstream: true,
      detail: upstream.data,
    });
  }
  return res.status(502).json({ success: false, error: fallback, upstream: true });
}

/**
 * GET /api/tools
 * Catálogo completo de tools del agente (D1):
 *   - /experimental/tool/ids            → todos los ids (builtin + dinámicas)
 *   - /experimental/tool?provider&model → detalle (descripción + schema params)
 *   - /config                           → estado enabled/disabled + modelo default
 */
router.get('/', requireJwtAuth, async (req, res) => {
  const [idsRes, configRes] = await Promise.all([
    opencodeFetch('/experimental/tool/ids'),
    opencodeFetch('/config'),
  ]);

  // Los ids son la fuente canónica de qué tools existen.
  if (!idsRes.ok) {
    return upstreamError(res, idsRes, 'No se pudo listar las tools de mi-opencode');
  }
  const ids = Array.isArray(idsRes.data) ? idsRes.data : [];

  // Detalle con descripción + parámetros: requiere provider/model del default.
  // Fuente 1: config.model ("provider/model"). Fuente 2 (fallback real):
  // /config/providers → default: { provider: model }.
  const config = configRes.ok && typeof configRes.data === 'object' ? configRes.data : {};
  let modelRef = config.model || '';
  let [provider, model] = modelRef.split('/');
  if (!provider || !model) {
    const providersRes = await opencodeFetch('/config/providers');
    if (providersRes.ok && providersRes.data && typeof providersRes.data.default === 'object') {
      const first = Object.entries(providersRes.data.default)[0];
      if (first) {
        provider = first[0];
        model = first[1];
        modelRef = `${provider}/${model}`;
      }
    }
  }

  let details = [];
  if (provider && model) {
    const detailRes = await opencodeFetch(
      `/experimental/tool?provider=${encodeURIComponent(provider)}&model=${encodeURIComponent(model)}`,
    );
    if (detailRes.ok && Array.isArray(detailRes.data)) {
      details = detailRes.data;
    }
  }

  // tools: { id: true|false } — qué está deshabilitado en la config
  const toolsConfig = config.tools && typeof config.tools === 'object' ? config.tools : {};
  const disabled = new Set(
    Object.entries(toolsConfig)
      .filter(([, value]) => value === false)
      .map(([id]) => id),
  );

  const detailById = new Map(details.map((d) => [d.id, d]));
  const tools = ids.map((id) => {
    const detail = detailById.get(id) || {};
    return {
      id,
      description: detail.description || '',
      parameters: detail.parameters || null,
      enabled: !disabled.has(id),
      hasDetail: Boolean(detail.description || detail.parameters),
    };
  });

  // Orden alfabético estable
  tools.sort((a, b) => a.id.localeCompare(b.id));

  res.json({
    success: true,
    tools,
    total: tools.length,
    enabledCount: tools.filter((t) => t.enabled).length,
    source: {
      server: OPENCODE_SERVER_URL,
      model: modelRef || null,
      hasDetails: details.length > 0,
    },
  });
});

/**
 * PATCH /api/tools/:id   body: { enabled: boolean }
 * Habilita / deshabilita una tool de verdad: lee /config, actualiza
 * config.tools[id], y escribe con PATCH /config (mi-opencode recarga).
 */
router.patch('/:id', requireJwtAuth, async (req, res) => {
  const toolId = req.params.id;
  const enabled = Boolean(req.body?.enabled);
  if (!toolId) {
    return res.status(400).json({ success: false, error: 'tool id is required' });
  }

  const configRes = await opencodeFetch('/config');
  if (!configRes.ok) {
    return upstreamError(res, configRes, 'No se pudo leer la config de mi-opencode');
  }
  const config = configRes.data && typeof configRes.data === 'object' ? configRes.data : {};

  const tools = config.tools && typeof config.tools === 'object' ? { ...config.tools } : {};
  if (enabled) {
    // true = explícitamente habilitado (o quitar el false)
    delete tools[toolId];
  } else {
    tools[toolId] = false;
  }
  config.tools = tools;

  const updateRes = await opencodeFetch('/config', {
    method: 'PATCH',
    body: JSON.stringify(config),
  });
  if (!updateRes.ok) {
    return upstreamError(res, updateRes, 'mi-opencode rechazó la actualización de config');
  }

  // Verificación honesta: mi-opencode escribe la config a disco (config.json de
  // la instancia) pero puede NO recargar la instancia en caliente. Comprobamos
  // si el runtime ya refleja el cambio (GET /config) para avisar al usuario.
  let applied = false;
  const checkRes = await opencodeFetch('/config');
  if (checkRes.ok && typeof checkRes.data === 'object') {
    const toolsAfter =
      checkRes.data.tools && typeof checkRes.data.tools === 'object' ? checkRes.data.tools : {};
    applied = enabled ? toolsAfter[toolId] !== false : toolsAfter[toolId] === false;
  }

  res.json({
    success: true,
    id: toolId,
    enabled,
    persisted: true,
    applied,
    note: applied
      ? undefined
      : 'Cambio guardado en la config de mi-opencode. Se aplica cuando el servidor recargue la instancia (reinicio).',
  });
});

/**
 * GET /api/tools/config
 * Resumen de la config actual para la vista de gestión (D3):
 * tools (enabled/disabled), skills (paths/urls) y mcp (servers + enabled).
 */
router.get('/config', requireJwtAuth, async (req, res) => {
  const configRes = await opencodeFetch('/config');
  if (!configRes.ok) {
    return upstreamError(res, configRes, 'No se pudo leer la config de mi-opencode');
  }
  const config = configRes.data && typeof configRes.data === 'object' ? configRes.data : {};

  // Modelo efectivo: config.model o el default de /config/providers
  let modelRef = config.model || null;
  if (!modelRef) {
    const providersRes = await opencodeFetch('/config/providers');
    if (providersRes.ok && providersRes.data && typeof providersRes.data.default === 'object') {
      const first = Object.entries(providersRes.data.default)[0];
      if (first) modelRef = `${first[0]}/${first[1]}`;
    }
  }

  const toolsConfig = config.tools && typeof config.tools === 'object' ? config.tools : {};
  const mcpConfig = config.mcp && typeof config.mcp === 'object' ? config.mcp : {};
  const skillsConfig = config.skills && typeof config.skills === 'object' ? config.skills : {};

  res.json({
    success: true,
    config: {
      model: modelRef,
      defaultAgent: config.default_agent || null,
      tools: toolsConfig,
      skills: {
        paths: Array.isArray(skillsConfig.paths) ? skillsConfig.paths : [],
        urls: Array.isArray(skillsConfig.urls) ? skillsConfig.urls : [],
      },
      mcp: Object.entries(mcpConfig).map(([name, spec]) => ({
        name,
        enabled: spec && typeof spec === 'object' ? spec.enabled !== false : true,
        type: spec && typeof spec === 'object' ? spec.type || null : null,
      })),
    },
  });
});

/**
 * POST /api/tools/skills   body: { action: 'add'|'remove', kind: 'path'|'url', value }
 * Gestiona las rutas/urls de skills en la config real de mi-opencode (D3).
 */
router.post('/skills', requireJwtAuth, async (req, res) => {
  const { action, kind, value } = req.body || {};
  if (!['add', 'remove'].includes(action) || !['path', 'url'].includes(kind) || !value) {
    return res.status(400).json({
      success: false,
      error: "body { action: 'add'|'remove', kind: 'path'|'url', value } is required",
    });
  }

  const configRes = await opencodeFetch('/config');
  if (!configRes.ok) {
    return upstreamError(res, configRes, 'No se pudo leer la config de mi-opencode');
  }
  const config = configRes.data && typeof configRes.data === 'object' ? configRes.data : {};

  const skills = config.skills && typeof config.skills === 'object' ? { ...config.skills } : {};
  const list = Array.isArray(skills[kind]) ? [...skills[kind]] : [];
  const index = list.indexOf(value);
  if (action === 'add' && index === -1) list.push(value);
  if (action === 'remove' && index !== -1) list.splice(index, 1);
  skills[kind] = list;
  config.skills = skills;

  const updateRes = await opencodeFetch('/config', {
    method: 'PATCH',
    body: JSON.stringify(config),
  });
  if (!updateRes.ok) {
    return upstreamError(res, updateRes, 'mi-opencode rechazó la actualización de config');
  }

  res.json({ success: true, action, kind, value, [kind]: list });
});

/**
 * GET /api/tools/sessions?limit=N
 * Sesiones reales de mi-opencode (para D2 — resultados de browser/sandbox).
 */
router.get('/sessions', requireJwtAuth, async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const sessionRes = await opencodeFetch(`/experimental/session?limit=${limit}`);
  if (!sessionRes.ok) {
    return upstreamError(res, sessionRes, 'No se pudieron listar las sesiones');
  }
  const sessions = Array.isArray(sessionRes.data) ? sessionRes.data : [];
  res.json({
    success: true,
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title || '(sin título)',
      time: s.time || null,
      directory: s.directory || null,
    })),
    total: sessions.length,
  });
});

/**
 * GET /api/tools/sessions/:sessionID/messages?limit=N
 * Mensajes de una sesión (partes de tool incluidas) para D2.
 */
router.get('/sessions/:sessionID/messages', requireJwtAuth, async (req, res) => {
  const sessionID = req.params.sessionID;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  const msgRes = await opencodeFetch(
    `/session/${encodeURIComponent(sessionID)}/message?limit=${limit}`,
  );
  if (!msgRes.ok) {
    return upstreamError(res, msgRes, 'No se pudieron leer los mensajes de la sesión');
  }

  const messages = Array.isArray(msgRes.data) ? msgRes.data : [];
  res.json({
    success: true,
    sessionID,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.info && m.info.role ? m.info.role : 'assistant',
      time: m.info && m.info.time ? m.info.time : null,
      parts: Array.isArray(m.parts)
        ? m.parts.map((p) => {
            // La API real de mi-opencode expone el estado de la tool dentro de
            // `state` ({ status, input, output, time }) — no como campos planos.
            const st = p.state && typeof p.state === 'object' ? p.state : null;
            return {
              type: p.type,
              // text parts
              text: p.text !== undefined ? p.text : undefined,
              // tool parts
              tool: p.tool !== undefined ? p.tool : undefined,
              state: st ? st.status : p.state,
              input: st && st.input !== undefined ? st.input : p.input,
              output: st && st.output !== undefined ? st.output : p.output,
            };
          })
        : [],
    })),
    total: messages.length,
  });
});

module.exports = router;
