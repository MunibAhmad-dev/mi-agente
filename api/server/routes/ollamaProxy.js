/**
 * Ollama Fast Proxy — FASE 26.
 *
 * El endpoint OpenAI-compatible de Ollama (/v1/chat/completions) IGNORA el
 * parámetro `think` y por defecto los modelos de razonamiento (Qwen3,
 * DeepSeek-R1) emiten decenas/cientos de tokens de "thinking" antes de
 * responder. En CPU eso se siente como latencia excesiva (medido:
 * qwen3:0.6b "Di hola" → 2.5–6.6 s con thinking; 0.39 s con `think: false`
 * vía API nativa).
 *
 * Este proxy convierte el formato OpenAI-compatible al formato NATIVO de
 * Ollama (/api/chat) forzando:
 *   - think: false           → sin razonamiento previo
 *   - options.num_ctx: 16384 → contexto por defecto amplio (Ollama usa 2048)
 *   - mapeo de max_tokens → num_predict, y passthrough de los parámetros
 *     que el dashboard envía (temperature, top_p, stop, seed, ...).
 *
 * Rutas (montadas en /api/ollama-proxy):
 *   GET  /models             → lista OpenAI-format (para fetch:true del selector)
 *   POST /chat/completions   → streaming o no, OpenAI-format (para el chat)
 *
 * Seguridad:
 *   - Solo acepta llamadas con `Authorization: Bearer ollama` (la apiKey que
 *     LibreChat envía desde librechat.yaml para este endpoint). Sin ella → 401.
 *   - El `model` se valida con regex estricta (nunca se interpola en URLs ni
 *     shell) y se envía solo como campo JSON al API nativo de Ollama.
 *   - No expone credenciales: nada se reenvía fuera del stack.
 */

const express = require('express');
const router = express.Router();

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
const EXPECTED_AUTH = process.env.OLLAMA_PROXY_APIKEY || 'Bearer ollama';
const DEFAULT_NUM_CTX = 16384;
const MODEL_RE = /^[\w.\-:/]+$/;

function isAuthorized(req) {
  try {
    return req.headers.authorization === EXPECTED_AUTH;
  } catch {
    return false;
  }
}

function unauthorized(res) {
  return res.status(401).json({
    error: {
      message: 'Invalid API key provided',
      type: 'invalid_request_error',
      code: 'invalid_api_key',
    },
  });
}

function modelListOpenAI(models) {
  return {
    object: 'list',
    data: models.map((m) => ({
      id: m.name,
      object: 'model',
      created: Math.floor(new Date(m.modified_at || Date.now()).getTime() / 1000),
      owned_by: 'ollama',
    })),
  };
}

/** Mapea el body OpenAI → body nativo de Ollama. */
function toNativeBody(body) {
  // Procesar messages: convertir formato OpenAI (content[].image_url) →
  // formato nativo de Ollama (images: [base64]). Sin esto, los modelos de
  // visión de Ollama (llava, minicpm-v, etc.) nunca reciben las imágenes.
  let messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length > 0) {
    messages = messages.map((msg) => {
      const native = { ...msg };
      // Si content es un array (formato OpenAI multimodal), procesar las partes
      if (Array.isArray(msg.content)) {
        const textParts = [];
        const images = [];
        for (const part of msg.content) {
          if (part && part.type === 'text' && typeof part.text === 'string') {
            textParts.push(part.text);
          } else if (part && part.type === 'image_url' && part.image_url) {
            const url = typeof part.image_url === 'string' ? part.image_url : part.image_url.url;
            if (url && url.startsWith('data:')) {
              // Extraer base64 del data URI: "data:image/png;base64,XXXX"
              const base64 = url.split(',')[1];
              if (base64) {
                images.push(base64);
              }
            }
          }
        }
        native.content = textParts.join('\n') || '';
        if (images.length > 0) {
          native.images = images;
        }
        // Limpiar campos OpenAI que Ollama no espera
        delete native.image_url;
      }
      return native;
    });
  }
  const native = {
    model: body.model,
    messages,
    stream: body.stream === true,
    think: false, // ← el motivo de existir de este proxy
    options: {
      num_ctx: DEFAULT_NUM_CTX,
    },
  };
  const map = {
    temperature: 'temperature',
    top_p: 'top_p',
    top_k: 'top_k',
    seed: 'seed',
    stop: 'stop',
    repeat_penalty: 'repeat_penalty',
  };
  for (const [from, to] of Object.entries(map)) {
    if (body[from] !== undefined && body[from] !== null) {
      native[to] = body[from];
    }
  }
  if (typeof body.max_tokens === 'number' && body.max_tokens > 0) {
    native.options.num_predict = body.max_tokens;
  }
  // FASE 39 — propagar `tools` (function calling) al API nativo de Ollama.
  // Sin esto, el runtime de agentes envía el schema pero el proxy lo descarta
  // y el modelo local nunca ve las herramientas → responde de memoria sin
  // invocarlas. El formato OpenAI `{type:'function', function:{...}}` es el
  // mismo que espera Ollama en /api/chat. Solo se pasa una lista plana
  // validada (cada tool debe ser objeto con function.name string).
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    const tools = [];
    for (const t of body.tools) {
      const fn = t && typeof t === 'object' ? t.function : null;
      if (fn && typeof fn.name === 'string' && fn.name.length <= 200) {
        tools.push({ type: 'function', function: fn });
      }
    }
    if (tools.length > 0) {
      native.tools = tools;
    }
  }
  return native;
}

/** Convierte un chunk del stream nativo a OpenAI-format. */
function openAIChunk(model, id, createdAt, delta) {
  // FASE 44 — el protocolo de streaming de OpenAI exige `role: assistant` en
  // el delta del primer chunk: LangChain (@langchain/openai) lo usa para
  // clasificar el mensaje como AIMessageChunk. Sin él, un chunk con
  // tool_calls se convierte en ChatMessageChunk y el runtime de agentes
  // DESCARTA la invocación → el modelo local respondía vacío sin ejecutar
  // la herramienta. Se incluye en todos los chunks (inocuo y robusto).
  return `data: ${JSON.stringify({
    id,
    object: 'chat.completion.chunk',
    created: createdAt,
    model,
    choices: [{ index: 0, delta: { role: 'assistant', ...delta }, finish_reason: null }],
  })}\n\n`;
}

/**
 * GET /health — connectivity probe for the UI to poll Ollama status.
 * Returns { ok: true, models: number } or { ok: false, error: string }.
 * No auth required — used by the status indicator in Mission Control.
 */
router.get('/health', async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) {
      return res.status(200).json({ ok: false, error: `HTTP ${r.status}` });
    }
    const data = await r.json();
    return res.json({ ok: true, models: (data.models || []).length, url: OLLAMA_URL });
  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/tags — lista de modelos en formato NATIVO de Ollama.
 *
 * El pipeline de agentes (`fetchOllamaModels` en @librechat/api) hace
 * `GET {baseURL}/api/tags` y espera `{ models: [{ name }] }`. Antes esta ruta
 * no existía en el proxy: el request caía en el auth global de la app → 401
 * "No auth token" → `endpoint_models_not_loaded` al validar el modelo de un
 * agente con proveedor local. El fetch nativo NO envía el Bearer `ollama`
 * (solo headers del config), así que esta ruta devuelve únicamente nombres de
 * modelos (sin exponer nada sensible ni permitir ejecución).
 */
router.get('/api/tags', async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      return res.status(502).json({
        error: { message: `Ollama no disponible (HTTP ${r.status})`, type: 'api_error' },
      });
    }
    const data = await r.json();
    return res.json({ models: data.models || [] });
  } catch (err) {
    return res.status(502).json({
      error: { message: `Ollama no disponible: ${err.message}`, type: 'api_error' },
    });
  }
});

/** GET /models — lista de modelos en formato OpenAI (fetch:true). */
router.get('/models', async (req, res) => {
  if (!isAuthorized(req)) {
    return unauthorized(res);
  }
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      return res.status(502).json({
        error: { message: `Ollama no disponible (HTTP ${r.status})`, type: 'api_error' },
      });
    }
    const data = await r.json();
    return res.json(modelListOpenAI(data.models || []));
  } catch (err) {
    return res.status(502).json({
      error: { message: `Ollama no disponible: ${err.message}`, type: 'api_error' },
    });
  }
});

/** POST /chat/completions — chat con Ollama nativo (think:false), stream o no. */
router.post('/chat/completions', async (req, res) => {
  if (!isAuthorized(req)) {
    return unauthorized(res);
  }
  const body = req.body || {};
  if (typeof body.model !== 'string' || !MODEL_RE.test(body.model) || body.model.length > 200) {
    return res.status(400).json({
      error: { message: 'model inválido', type: 'invalid_request_error', code: 'invalid_model' },
    });
  }

  // DEBUG (FASE 44): capturar qué envía realmente el runtime de agentes
  try {
    const toolNames = Array.isArray(body.tools)
      ? body.tools.map(
          (t) =>
            (t && typeof t === 'object' && t.function && t.function.name) || (t && t.name) || '?',
        )
      : [];
    console.log(
      `[OllamaProxy] REQ model=${body.model} stream=${body.stream === true} tools=${toolNames.join(',')} tool_choice=${JSON.stringify(body.tool_choice)} msgs=${Array.isArray(body.messages) ? body.messages.length : 0} max_tokens=${body.max_tokens}`,
    );
  } catch (e) {
    /* noop */
  }

  const native = toNativeBody(body);
  const id = `chatcmpl-${Date.now().toString(36)}`;
  const createdAt = Math.floor(Date.now() / 1000);

  let upstream;
  try {
    upstream = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(native),
      signal: AbortSignal.timeout(600000),
    });
  } catch (err) {
    return res.status(502).json({
      error: { message: `Ollama no disponible: ${err.message}`, type: 'api_error' },
    });
  }

  if (!upstream.ok || !upstream.body) {
    let msg = `HTTP ${upstream.status}`;
    try {
      const e = await upstream.json();
      msg = e.error || msg;
    } catch {
      /* cuerpo no-JSON */
    }
    return res.status(502).json({
      error: { message: msg, type: 'upstream_error', code: upstream.status },
    });
  }

  /* ---------- No streaming: respuesta completa OpenAI-format ---------- */
  if (!native.stream) {
    try {
      const data = await upstream.json();
      if (data.error) {
        return res.status(502).json({ error: data.error });
      }
      // FASE 39 — mapear tool_calls nativas de Ollama → formato OpenAI para
      // que el runtime de agentes reciba la invocación (antes se descartaban
      // y el agente respondía de memoria sin usar la herramienta).
      const rawCalls = Array.isArray(data.message?.tool_calls) ? data.message.tool_calls : [];
      const toolCalls = rawCalls
        .filter((c) => c && c.function && typeof c.function.name === 'string')
        .map((c, i) => ({
          id: c.id || `call_${createdAt}_${i}`,
          type: 'function',
          function: {
            name: c.function.name,
            arguments:
              typeof c.function.arguments === 'string'
                ? c.function.arguments
                : JSON.stringify(c.function.arguments ?? {}),
          },
        }));
      const message = {
        role: 'assistant',
        content: data.message?.content ?? '',
      };
      if (toolCalls.length > 0) {
        message.tool_calls = toolCalls;
      }
      // DEBUG (FASE 44)
      try {
        console.log(
          `[OllamaProxy] RESP nonstream model=${body.model} content_len=${message.content?.length ?? 0} tool_calls=${toolCalls.length} eval=${data.eval_count}`,
        );
      } catch (e) {
        /* noop */
      }
      return res.json({
        id,
        object: 'chat.completion',
        created: createdAt,
        model: body.model,
        choices: [
          {
            index: 0,
            message,
            finish_reason: toolCalls.length > 0 ? 'tool_calls' : data.done_reason || 'stop',
          },
        ],
        usage: data.prompt_eval_count
          ? {
              prompt_tokens: data.prompt_eval_count,
              completion_tokens: data.eval_count || 0,
              total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
            }
          : undefined,
      });
    } catch (err) {
      return res.status(502).json({
        error: { message: `error leyendo Ollama: ${err.message}`, type: 'upstream_error' },
      });
    }
  }

  /* ---------- Streaming: convertir SSE nativo → SSE OpenAI ---------- */
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let usage = null;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let evt;
        try {
          evt = JSON.parse(line);
        } catch {
          continue;
        }
        if (evt.error) {
          res.write(`data: ${JSON.stringify({ error: evt.error })}\n\n`);
          res.end();
          return;
        }
        if (evt.message?.content) {
          content += evt.message.content;
          res.write(
            openAIChunk(body.model, id, createdAt, {
              role: 'assistant',
              content: evt.message.content,
            }),
          );
        }
        // FASE 39 — propagar tool_calls en streaming (mismo mapeo que el
        // modo no-streaming) para que el runtime de agentes reciba la
        // invocación del modelo local.
        if (Array.isArray(evt.message?.tool_calls) && evt.message.tool_calls.length > 0) {
          const streamCalls = evt.message.tool_calls
            .filter((c) => c && c.function && typeof c.function.name === 'string')
            .map((c, i) => ({
              index: i,
              id: c.id || `call_${createdAt}_${i}`,
              type: 'function',
              function: {
                name: c.function.name,
                arguments:
                  typeof c.function.arguments === 'string'
                    ? c.function.arguments
                    : JSON.stringify(c.function.arguments ?? {}),
              },
            }));
          if (streamCalls.length > 0) {
            res.write(
              `data: ${JSON.stringify({
                id,
                object: 'chat.completion.chunk',
                created: createdAt,
                model: body.model,
                choices: [
                  {
                    index: 0,
                    delta: { role: 'assistant', tool_calls: streamCalls },
                    finish_reason: null,
                  },
                ],
              })}\n\n`,
            );
            // DEBUG (FASE 44)
            try {
              console.log(
                `[OllamaProxy] RESP stream tool_calls=${streamCalls.map((c) => c.function.name).join(',')}`,
              );
            } catch (e) {
              /* noop */
            }
          }
        }
        if (evt.done) {
          // DEBUG (FASE 44)
          try {
            console.log(
              `[OllamaProxy] RESP stream done model=${body.model} content_len=${content.length} eval=${evt.eval_count}`,
            );
          } catch (e) {
            /* noop */
          }
          if (evt.prompt_eval_count) {
            usage = {
              prompt_tokens: evt.prompt_eval_count,
              completion_tokens: evt.eval_count || 0,
              total_tokens: (evt.prompt_eval_count || 0) + (evt.eval_count || 0),
            };
          }
          break;
        }
      }
    }
    if (usage) {
      res.write(
        `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: createdAt, model: body.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage })}\n\n`,
      );
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    try {
      res.write(
        `data: ${JSON.stringify({ error: { message: err.message, type: 'stream_error' } })}\n\n`,
      );
      res.end();
    } catch {
      /* cliente desconectado */
    }
  }
});

module.exports = router;
