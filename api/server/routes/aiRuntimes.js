/**
 * AI Runtimes routes — FASE 29.
 * Proxy del dashboard hacia el runtime local TTS/STT que corre dentro del
 * contenedor `rag_api` (puerto 8500). El cliente nunca habla directamente
 * con el runtime: todo pasa por aquí (SSRF controlado, sin exponer puertos).
 *
 *   GET  /api/ai-runtimes/health → estado de los motores
 *   POST /api/ai-runtimes/tts     { text, voice?, speed?, lang? } → WAV
 *   POST /api/ai-runtimes/stt     multipart file=audio → { text }
 */

const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');

// El runtime TTS/STT (Kokoro + faster-whisper) corre dentro de rag_api en el
// puerto 8500 (AI_RUNTIMES_PORT, ver api/ai_runtimes/tts_stt.py). El puerto
// 8000 es el RAG API (con auth) — apuntar ahí daba falso positivo de health
// y 401 en /stt (FASE 45).
const RUNTIME_URL =
  process.env.AI_RUNTIMES_URL || `http://rag_api:${process.env.AI_RUNTIMES_PORT || 8500}`;
const TTS_TIMEOUT_MS = 120000;
const STT_TIMEOUT_MS = 120000;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_CHARS = 2000;

router.get('/health', requireJwtAuth, async (_req, res) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(`${RUNTIME_URL}/health`, { signal: controller.signal });
    clearTimeout(timer);
    const json = await r.json();
    // Normalizamos la forma: el runtime responde {"status":"UP"} y el
    // frontend espera `ok` (FASE 36 — estados de runtimes correctos).
    const up = json?.status === 'UP' || json?.ok === true || json?.status === 'ok';
    if (up) {
      return res.json({ ok: true, service: 'tts_stt', status: 'UP', ...json });
    }
    res
      .status(r.status)
      .json({ ok: false, service: 'tts_stt', error: 'runtime no disponible', ...json });
  } catch (error) {
    res
      .status(503)
      .json({ ok: false, service: 'tts_stt', error: 'runtime no disponible: ' + error.message });
  }
});

router.post('/tts', requireJwtAuth, async (req, res) => {
  try {
    const text = String(req.body?.text || '')
      .trim()
      .slice(0, MAX_TEXT_CHARS);
    if (!text) {
      return res.status(400).json({ error: 'text vacío' });
    }
    const params = new URLSearchParams({ text });
    if (req.body?.voice) params.set('voice', String(req.body.voice));
    if (req.body?.speed != null) params.set('speed', String(req.body.speed));
    if (req.body?.lang) params.set('lang', String(req.body.lang));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
    const r = await fetch(`${RUNTIME_URL}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const buf = Buffer.from(await r.arrayBuffer());
    if (!r.ok) {
      return res.status(r.status).json({ error: buf.toString() });
    }
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
  } catch (error) {
    res.status(502).json({ error: 'TTS local no disponible: ' + error.message });
  }
});

router.post('/stt', requireJwtAuth, async (req, res) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_AUDIO_BYTES) {
        return res.status(413).json({ error: 'audio demasiado grande (máx 25 MB)' });
      }
      chunks.push(chunk);
    }
    let raw = Buffer.concat(chunks);
    if (!raw.length) {
      return res.status(400).json({ error: 'audio vacío' });
    }
    // El cliente envía multipart/form-data: extraemos el contenido del primer
    // part (el archivo de audio). Si llega raw (octet-stream) se usa tal cual.
    const ctype = String(req.headers['content-type'] || '');
    const bmatch = ctype.match(/boundary=(.+)$/i);
    if (bmatch) {
      const boundary = bmatch[1].trim().replace(/^"|"$/g, '');
      const marker = Buffer.from(`--${boundary}`);
      const start = raw.indexOf(marker);
      if (start === -1) {
        return res.status(400).json({ error: 'multipart inválido: no se encontró el boundary' });
      }
      const headerEnd = raw.indexOf(Buffer.from('\r\n\r\n'), start);
      if (headerEnd === -1) {
        return res.status(400).json({ error: 'multipart inválido: sin cabeceras de part' });
      }
      const contentStart = headerEnd + 4;
      const endMarker = raw.indexOf(Buffer.from(`\r\n--${boundary}`), contentStart);
      raw = endMarker === -1 ? raw.subarray(contentStart) : raw.subarray(contentStart, endMarker);
    }
    if (!raw.length) {
      return res.status(400).json({ error: 'audio vacío' });
    }
    // Detectar formato real por cabecera (la extensión ayuda a decodificar).
    let ext = 'bin';
    if (
      raw.length > 12 &&
      raw.subarray(0, 4).toString('latin1') === 'RIFF' &&
      raw.subarray(8, 12).toString('latin1') === 'WAVE'
    ) {
      ext = 'wav';
    } else if (raw.subarray(0, 4).toString('latin1') === 'OggS') {
      ext = 'ogg';
    } else if (raw[0] === 0xff && (raw[1] & 0xe0) === 0xe0) {
      ext = 'mp3';
    }
    const boundary = `----ai${Date.now()}${Math.random().toString(16).slice(2)}`;
    const sep = Buffer.from(`--${boundary}\r\n`);
    const head = Buffer.from(
      `Content-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([sep, head, raw, tail]);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);
    const r = await fetch(`${RUNTIME_URL}/stt`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const json = await r.json();
    res.status(r.status).json(json);
  } catch (error) {
    res.status(502).json({ error: 'STT local no disponible: ' + error.message });
  }
});

module.exports = router;
