const express = require('express');
const fs = require('fs').promises;
const { speechToText } = require('~/server/services/Files/Audio');

const router = express.Router();

// Runtime local TTS/STT (faster-whisper) — FASE 45.
// Corre en el puerto 8500 (AI_RUNTIMES_PORT, ver api/ai_runtimes/tts_stt.py),
// NO en el 8000 (RAG API con auth → 401). Si el runtime local responde, el
// audio grabado con el micrófono se transcribe con faster-whisper (sin API
// keys); si no está disponible, se usa el STTService estándar (OpenAI/Azure
// configurado en librechat.yaml) como fallback.
const RUNTIME_URL =
  process.env.AI_RUNTIMES_URL || `http://rag_api:${process.env.AI_RUNTIMES_PORT || 8500}`;
const STT_TIMEOUT_MS = 120000;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

router.post('/', async (req, res) => {
  // El audio lo guarda multer en req.file.path (ver routes/files/index.js).
  const audioPath = req.file?.path;
  const audioMime = req.file?.mimetype || '';
  const language = req.body?.language || '';

  const tryLocalRuntime = async () => {
    if (!audioPath) {
      return null;
    }
    const raw = await fs.readFile(audioPath);
    if (!raw.length || raw.length > MAX_AUDIO_BYTES) {
      return null;
    }
    // Detectar extensión real por cabecera para que faster-whisper decodifique
    // correctamente (webm/ogg/wav/mp4 según el navegador).
    let ext = 'webm';
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
    } else if (raw.subarray(4, 8).toString('latin1') === 'ftyp') {
      ext = 'm4a';
    }

    const boundary = `----ai${Date.now()}${Math.random().toString(16).slice(2)}`;
    const sep = Buffer.from(`--${boundary}\r\n`);
    const head = Buffer.from(
      `Content-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${audioMime || 'application/octet-stream'}\r\n\r\n`,
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([sep, head, raw, tail]);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);
    try {
      const r = await fetch(`${RUNTIME_URL}/stt`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body,
        signal: controller.signal,
      });
      const json = await r.json().catch(() => ({}));
      if (r.ok) {
        // El runtime respondió correctamente. Aunque el texto esté vacío
        // (silencio / voz baja) es un resultado VÁLIDO del runtime local:
        // devolverlo tal cual evita caer al fallback cloud sin schema
        // (que lanzaba "No STT schema is set" → 500).
        return { text: String(json?.text ?? '').trim(), fromLocal: true };
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  // 1) Intentar runtime local (faster-whisper).
  const local = await tryLocalRuntime().catch(() => null);
  if (local) {
    try {
      if (audioPath) {
        await fs.unlink(audioPath);
      }
    } catch {
      /* noop */
    }
    return res.json({ text: local.text });
  }

  // 2) Fallback: STTService estándar (OpenAI/Azure).
  //    speechToText() ya borra req.file.path internamente.
  return speechToText(req, res);
});

module.exports = router;
