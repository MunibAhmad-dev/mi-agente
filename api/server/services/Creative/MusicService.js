'use strict';

/**
 * MusicService — Face 22-23: Music Generation Integration.
 *
 * Provider priority (first available wins):
 *   1. Suno API (commercial, high quality) — requires SUNO_API_KEY
 *   2. HuggingFace MusicGen (facebook/musicgen-small, free) — requires HUGGINGFACE_TOKEN or HF_TOKEN
 *
 * Note: Ollama does NOT support audio/music generation (text-only LLM inference).
 * If neither key is present, the service throws a clear error with setup instructions.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const logger = {
  info: (...a) => console.log('[MusicService]', ...a),
  warn: (...a) => console.warn('[MusicService]', ...a),
  error: (...a) => console.error('[MusicService]', ...a),
};

const MUSICGEN_MODEL = 'facebook/musicgen-small';
const HF_API_BASE = 'https://api-inference.huggingface.co/models';
// Suno API endpoint — subject to change; update if Suno releases v3+
const SUNO_GENERATE_URL = 'https://studio-api.suno.ai/api/generate/v2/';

/* ──────────────────────────────────────────────────────────
   Provider detection
────────────────────────────────────────────────────────── */

function _detectProvider() {
  if (process.env.SUNO_API_KEY) return 'suno';
  if (process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN) return 'huggingface';
  return null;
}

/** List providers that are configured (have the necessary key). */
function getAvailableProviders() {
  const list = [];
  if (process.env.SUNO_API_KEY) {
    list.push({ name: 'suno', model: 'chirp-v3-5', priority: 1, free: false });
  }
  if (process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN) {
    list.push({ name: 'huggingface', model: MUSICGEN_MODEL, priority: 2, free: true });
  }
  return list;
}

/* ──────────────────────────────────────────────────────────
   HuggingFace MusicGen
────────────────────────────────────────────────────────── */

async function _generateWithHuggingFace(prompt, durationSeconds) {
  const token = process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN;
  if (!token) throw new Error('HUGGINGFACE_TOKEN or HF_TOKEN required for MusicGen');

  // max_new_tokens ≈ 50 tokens per second for musicgen-small
  const maxNewTokens = Math.max(50, Math.round(durationSeconds * 50));

  logger.info(`HuggingFace MusicGen: "${prompt.slice(0, 80)}" (~${durationSeconds}s)`);

  const res = await fetch(`${HF_API_BASE}/${MUSICGEN_MODEL}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: maxNewTokens } }),
    signal: AbortSignal.timeout(180_000), // HF can be slow on cold start
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // HF returns 503 while the model is loading — surface a friendly message
    if (res.status === 503) {
      throw new Error('MusicGen model is loading on HuggingFace (cold start). Retry in ~30s.');
    }
    throw new Error(`HuggingFace MusicGen failed: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }

  const audioBuffer = Buffer.from(await res.arrayBuffer());
  const outputPath = path.join(os.tmpdir(), `music-${crypto.randomUUID()}.flac`);
  fs.writeFileSync(outputPath, audioBuffer);

  logger.info(`Music saved: ${outputPath} (${audioBuffer.length} bytes)`);
  return {
    audioPath: outputPath,
    format: 'flac',
    provider: 'huggingface',
    model: MUSICGEN_MODEL,
    prompt,
    duration: durationSeconds,
  };
}

/* ──────────────────────────────────────────────────────────
   Suno API
────────────────────────────────────────────────────────── */

async function _generateWithSuno(prompt, durationSeconds) {
  const key = process.env.SUNO_API_KEY;
  if (!key) throw new Error('SUNO_API_KEY required for Suno music generation');

  logger.info(`Suno API: "${prompt.slice(0, 80)}" (~${durationSeconds}s)`);

  const res = await fetch(SUNO_GENERATE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      gpt_description_prompt: prompt,
      make_instrumental: true,
      mv: 'chirp-v3-5',
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Suno API failed: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const clips = data.clips || [];
  if (!clips.length) throw new Error('Suno returned no clips');

  const audioUrl = clips[0].audio_url;
  if (!audioUrl) throw new Error('Suno clip missing audio_url');

  // Download the audio file
  const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(60_000) });
  if (!audioRes.ok) throw new Error(`Could not download Suno audio: HTTP ${audioRes.status}`);

  const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
  const outputPath = path.join(os.tmpdir(), `music-${crypto.randomUUID()}.mp3`);
  fs.writeFileSync(outputPath, audioBuffer);

  logger.info(`Suno music saved: ${outputPath} (${audioBuffer.length} bytes)`);
  return {
    audioPath: outputPath,
    format: 'mp3',
    provider: 'suno',
    model: 'chirp-v3-5',
    prompt,
    duration: durationSeconds,
    sunoClipId: clips[0].id,
    sunoTitle: clips[0].title,
  };
}

/* ──────────────────────────────────────────────────────────
   Public API
────────────────────────────────────────────────────────── */

/**
 * Generate music from a text description.
 *
 * @param {object} opts
 * @param {string}  opts.prompt           - description of the music (e.g. "upbeat jazz piano")
 * @param {number}  [opts.durationSeconds=10] - target duration
 * @param {string}  [opts.genre]          - prepended to prompt (e.g. "ambient", "jazz")
 * @param {string}  [opts.provider]       - force 'suno' or 'huggingface'
 * @returns {Promise<{audioPath, format, provider, model, prompt, duration, ...}>}
 */
async function generateMusic(opts = {}) {
  const { prompt, durationSeconds = 10, genre, provider: forced } = opts;
  if (!prompt) throw new Error('prompt required');

  const enriched = genre ? `${genre} music, ${prompt}` : prompt;
  const provider = forced || _detectProvider();

  if (!provider) {
    throw new Error(
      'No music provider configured. Set HUGGINGFACE_TOKEN (free, MusicGen) or SUNO_API_KEY in your .env',
    );
  }

  switch (provider) {
    case 'suno':
      return _generateWithSuno(enriched, durationSeconds);
    case 'huggingface':
      return _generateWithHuggingFace(enriched, durationSeconds);
    default:
      throw new Error(`Unknown music provider: "${provider}". Use "suno" or "huggingface".`);
  }
}

module.exports = { generateMusic, getAvailableProviders };
