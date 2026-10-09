const { Tool } = require('@librechat/agents/langchain/tools');
const crypto = require('crypto');

const COMFY_URL = process.env.COMFYUI_URL || 'http://comfyui:8188';
const CHECKPOINT = 'sd-v1-5-tiny.safetensors';
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_MS = 6 * 60 * 1000; // 6 min en CPU

const imageGeneratorJsonSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      minLength: 1,
      description:
        'The image to generate, described in detail (subject, style, lighting, composition). Write it in English for best results, e.g. "a cute corgi dog wearing sunglasses on a sunny beach, highly detailed".',
    },
    negative_prompt: {
      type: 'string',
      description:
        'Things to avoid in the image. Defaults to "blurry, low quality, distorted, ugly, deformed".',
    },
    size: {
      type: 'string',
      enum: ['small', 'medium'],
      description:
        'small = 384x384 (fast, ~2 min on CPU), medium = 512x512 (~4-5 min). Defaults to small.',
    },
    steps: {
      type: 'integer',
      minimum: 4,
      maximum: 30,
      description: 'Sampling steps. Defaults to 15.',
    },
  },
  required: ['prompt'],
};

/**
 * ImageGenerator — generación de imágenes vía ComfyUI local para agentes
 * (FASE 42/43). Envía un workflow txt2img (checkpoint sd-v1-5-tiny, sin API
 * keys), espera la ejecución y devuelve la imagen en markdown para que el
 * agente la incluya en su respuesta (el chat la renderiza como <img>, igual
 * que GPT/Grok). El nombre de archivo usa un prefijo aleatorio no adivinable
 * (la URL funciona como enlace tipo "capability").
 */
class ImageGenerator extends Tool {
  static lc_name() {
    return 'image_generator';
  }

  static get jsonSchema() {
    return imageGeneratorJsonSchema;
  }

  constructor(fields = {}) {
    super(fields);
    this.name = 'image_generator';
    this.description =
      'Local image generator powered by ComfyUI (Stable Diffusion, no API key required). Takes a detailed prompt and returns a generated image. Include the returned markdown image (![](/api/comfyui/view/...)) in your response so the user sees the image in the chat. Generation takes 1-5 minutes on CPU — tell the user it is being generated. Use this whenever the user asks to create, draw or generate an image.';
    this.schema = imageGeneratorJsonSchema;
  }

  async _call(input) {
    const prompt = String(input?.prompt || '').trim();
    if (!prompt) {
      return JSON.stringify({ success: false, error: 'Prompt vacío.' });
    }
    const negative =
      String(input?.negative_prompt || '').trim() ||
      'blurry, low quality, distorted, ugly, deformed, watermark';
    const size = input?.size === 'medium' ? 512 : 384;
    const steps = Math.min(Math.max(Number(input?.steps) || 15, 4), 30);

    const prefix = `gen_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const workflow = {
      1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CHECKPOINT } },
      2: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['1', 1] } },
      3: { class_type: 'CLIPTextEncode', inputs: { text: negative, clip: ['1', 1] } },
      4: { class_type: 'EmptyLatentImage', inputs: { width: size, height: size, batch_size: 1 } },
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
      7: { class_type: 'SaveImage', inputs: { filename_prefix: prefix, images: ['6', 0] } },
    };

    try {
      const promptRes = await fetch(`${COMFY_URL}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow, client_id: 'agent-image-gen' }),
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
            const images = out.images ?? [];
            if (images.length > 0) {
              filename = images[0].filename;
              break;
            }
          }
          if (filename) {
            break;
          }
        } catch (err) {
          // AbortSignal/red transitoria: sigue esperando
          if (err?.message?.includes('ejecución falló')) {
            throw err;
          }
        }
      }

      if (!filename) {
        throw new Error('ComfyUI no terminó la generación en el tiempo máximo (6 min)');
      }

      return JSON.stringify({
        success: true,
        prompt,
        size,
        steps,
        filename,
        image: `/api/comfyui/view/${filename}`,
        markdown: `![Imagen generada](/api/comfyui/view/${filename})`,
        instructions:
          'Include the markdown image exactly as-is (![Imagen generada](/api/comfyui/view/...)) in your final response so it renders in the chat. Add a short description of what was generated.',
      });
    } catch (error) {
      throw new Error(`Image generation failed: ${error?.message ?? String(error)}`);
    }
  }
}

module.exports = ImageGenerator;
