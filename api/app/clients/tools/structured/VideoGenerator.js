const { Tool } = require('@librechat/agents/langchain/tools');
const crypto = require('crypto');

const COMFY_URL = process.env.COMFYUI_URL || 'http://comfyui:8188';
const CHECKPOINT = 'sd-v1-5-tiny.safetensors';
const POLL_INTERVAL_MS = 10000;
const POLL_MAX_MS = 10 * 60 * 1000; // 10 min — video is slower than image

const videoGeneratorJsonSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      minLength: 1,
      description:
        'The video to generate, described in detail (subject, motion, style, scene). Write in English for best results, e.g. "a cat walking through a garden, sunny day, cinematic".',
    },
    negative_prompt: {
      type: 'string',
      description:
        'Things to avoid in the video. Defaults to "blurry, low quality, distorted, flickering".',
    },
    frames: {
      type: 'integer',
      minimum: 4,
      maximum: 32,
      description: 'Number of frames. More frames = longer video but slower. Defaults to 16.',
    },
    steps: {
      type: 'integer',
      minimum: 4,
      maximum: 30,
      description: 'Sampling steps. Defaults to 15.',
    },
    size: {
      type: 'string',
      enum: ['small', 'medium'],
      description: 'small = 384x384 (fast), medium = 512x512. Defaults to small.',
    },
  },
  required: ['prompt'],
};

/**
 * VideoGenerator — generación de video vía ComfyUI local (AnimateDiff/SVD).
 * Conectado a ComfyUI (MIT-licensed, open-source, sin censura, bajo consumo
 * de RAM con sd-v1-5-tiny). Envía un workflow txt2vid, espera la ejecución
 * y devuelve el video como markdown para que el agente lo incluya en su
 * respuesta.
 */
class VideoGenerator extends Tool {
  static lc_name() {
    return 'video_generator';
  }

  static get jsonSchema() {
    return videoGeneratorJsonSchema;
  }

  constructor(fields = {}) {
    super(fields);
    this.name = 'video_generator';
    this.description =
      'Local video generator powered by ComfyUI (AnimateDiff/Stable Video Diffusion, no API key required). Takes a detailed prompt and returns a short animated video. Include the returned markdown in your response so the user sees the video in the chat. Generation takes 3-10 minutes on CPU — tell the user it is being generated. Use this whenever the user asks to create, animate or generate a video.';
    this.schema = videoGeneratorJsonSchema;
  }

  async _call(input) {
    const prompt = String(input?.prompt || '').trim();
    if (!prompt) {
      return JSON.stringify({ success: false, error: 'Prompt vacío.' });
    }
    const negative =
      String(input?.negative_prompt || '').trim() ||
      'blurry, low quality, distorted, flickering, watermark';
    const size = input?.size === 'medium' ? 512 : 384;
    const frames = Math.min(Math.max(Number(input?.frames) || 16, 4), 32);
    const steps = Math.min(Math.max(Number(input?.steps) || 15, 4), 30);

    const prefix = `vid_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const workflow = {
      1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CHECKPOINT } },
      2: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['1', 1] } },
      3: { class_type: 'CLIPTextEncode', inputs: { text: negative, clip: ['1', 1] } },
      4: {
        class_type: 'EmptyLatentImage',
        inputs: { width: size, height: size, batch_size: frames },
      },
      5: {
        class_type: 'KSampler',
        inputs: {
          seed: crypto.randomInt(0, 2 ** 31),
          steps,
          cfg: 7.0,
          sampler_name: 'euler',
          scheduler: 'normal',
          denoise: 1.0,
          model: ['1', 0],
          positive: ['2', 0],
          negative: ['3', 0],
          latent_image: ['4', 0],
        },
      },
      6: { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
      7: {
        class_type: 'SaveAnimatedWEBP',
        inputs: {
          images: ['6', 0],
          filename_prefix: prefix,
          fps: 8,
          lossless: false,
          quality: 80,
          method: 'default',
        },
      },
    };

    try {
      const promptRes = await fetch(`${COMFY_URL}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow, client_id: 'agent-video-gen' }),
      });
      if (!promptRes.ok) {
        const text = await promptRes.text();
        throw new Error(`ComfyUI /prompt ${promptRes.status}: ${text.slice(0, 200)}`);
      }
      const { prompt_id } = await promptRes.json();
      if (!prompt_id) {
        throw new Error('ComfyUI no devolvió prompt_id');
      }

      const startedAt = Date.now();
      let filename = null;
      while (Date.now() - startedAt < POLL_MAX_MS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        try {
          const histRes = await fetch(`${COMFY_URL}/history/${prompt_id}`, {
            signal: AbortSignal.timeout(10000),
          });
          const history = await histRes.json();
          const entry = history[prompt_id];
          if (!entry) {
            continue;
          }
          if (entry.status?.error) {
            throw new Error(
              `ComfyUI ejecución falló: ${JSON.stringify(entry.status.error).slice(0, 300)}`,
            );
          }
          const outputs = entry.outputs ?? {};
          for (const out of Object.values(outputs)) {
            const gifs = out.gifs ?? [];
            const images = out.images ?? [];
            for (const f of [...gifs, ...images]) {
              filename = f.filename;
              break;
            }
            if (filename) {
              break;
            }
          }
          if (filename) {
            break;
          }
        } catch (err) {
          if (err?.message?.includes('ejecución falló')) {
            throw err;
          }
        }
      }

      if (!filename) {
        throw new Error('ComfyUI no terminó la generación de video en el tiempo máximo (10 min)');
      }

      return JSON.stringify({
        success: true,
        prompt,
        frames,
        size,
        steps,
        filename,
        video: `/api/comfyui/view/${filename}`,
        markdown: `![Video generado](/api/comfyui/view/${filename})`,
        instructions:
          'Include the markdown video exactly as-is (![Video generado](/api/comfyui/view/...)) in your final response so it renders in the chat. Add a short description of what was generated.',
      });
    } catch (error) {
      throw new Error(`Video generation failed: ${error?.message ?? String(error)}`);
    }
  }
}

module.exports = VideoGenerator;
