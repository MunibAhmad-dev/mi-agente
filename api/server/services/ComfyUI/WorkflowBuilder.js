/**
 * WorkflowBuilder
 * Builds ComfyUI workflows in API JSON format (numbered nodes with class_type + inputs).
 * This is the format accepted by ComfyUI's POST /prompt endpoint.
 */

class WorkflowBuilder {
  constructor() {
    this.nodeIdCounter = 1;
  }

  /**
   * Get next node ID (string, for API format compatibility)
   */
  nextId() {
    return `${this.nodeIdCounter++}`;
  }

  /**
   * Build Text-to-Image workflow (API JSON format).
   * Chain: CheckpointLoaderSimple → CLIPTextEncode (pos/neg) → EmptyLatentImage
   *        → KSampler → VAEDecode → SaveImage
   */
  buildTextToImage({
    prompt,
    negativePrompt = '',
    model = 'sd_xl_base_1.0.safetensors',
    loras = [],
    steps = 20,
    cfg = 7,
    seed = -1,
    width = 512,
    height = 512,
    sampler = 'euler',
    scheduler = 'normal',
  }) {
    const actualSeed = seed === -1 || seed == null ? Math.floor(Math.random() * 2 ** 31) : seed;

    const workflow = {
      1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: model } },
      2: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['1', 1] } },
      3: { class_type: 'CLIPTextEncode', inputs: { text: negativePrompt, clip: ['1', 1] } },
      4: { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
      5: {
        class_type: 'KSampler',
        inputs: {
          seed: actualSeed,
          steps,
          cfg,
          sampler_name: sampler,
          scheduler,
          denoise: 1.0,
          model: ['1', 0],
          positive: ['2', 0],
          negative: ['3', 0],
          latent_image: ['4', 0],
        },
      },
      6: { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
      7: {
        class_type: 'SaveImage',
        inputs: { images: ['6', 0], filename_prefix: `output_${Date.now()}` },
      },
    };

    this.nodeIdCounter = 8;

    if (loras.length > 0) {
      return this.addLoRAs(workflow, loras);
    }

    return workflow;
  }

  /**
   * Insert LoraLoader nodes into an API-format workflow.
   * Rewires the KSampler model/clip inputs to chain through the LoRA loaders.
   * Each LoraLoader takes MODEL+CLIP from the previous source and outputs
   * MODEL+CLIP, so we insert them between the checkpoint and the sampler.
   */
  addLoRAs(workflow, loras) {
    if (!loras.length) {
      return workflow;
    }

    let currentModelSource = ['1', 0];
    let currentClipSource = ['1', 1];

    loras.forEach((lora, idx) => {
      const loraId = `${this.nodeIdCounter++}`;
      workflow[loraId] = {
        class_type: 'LoraLoader',
        inputs: {
          lora_name: lora.name,
          strength_model: lora.strength ?? 1.0,
          strength_clip: lora.strength ?? 1.0,
          model: currentModelSource,
          clip: currentClipSource,
        },
      };
      currentModelSource = [loraId, 0];
      currentClipSource = [loraId, 1];
      void idx;
    });

    if (workflow[5] && workflow[5].class_type === 'KSampler') {
      workflow[5].inputs.model = currentModelSource;
    }
    workflow[2].inputs.clip = currentClipSource;
    workflow[3].inputs.clip = currentClipSource;

    return workflow;
  }

  /**
   * Build Image-to-Image workflow (API JSON format).
   * Chain: LoadImage → VAEEncode + CheckpointLoaderSimple → CLIPTextEncode (pos/neg)
   *        → KSampler (denoise=strength) → VAEDecode → SaveImage
   */
  buildImageToImage({
    inputImage,
    prompt,
    negativePrompt = '',
    model = 'sd_xl_base_1.0.safetensors',
    strength = 0.7,
    steps = 20,
    cfg = 7,
    seed = -1,
  }) {
    const actualSeed = seed === -1 || seed == null ? Math.floor(Math.random() * 2 ** 31) : seed;

    return {
      1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: model } },
      2: { class_type: 'LoadImage', inputs: { image: inputImage } },
      3: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['1', 1] } },
      4: { class_type: 'CLIPTextEncode', inputs: { text: negativePrompt, clip: ['1', 1] } },
      5: { class_type: 'VAEEncode', inputs: { pixels: ['2', 0], vae: ['1', 2] } },
      6: {
        class_type: 'KSampler',
        inputs: {
          seed: actualSeed,
          steps,
          cfg,
          sampler_name: 'euler',
          scheduler: 'normal',
          denoise: strength,
          model: ['1', 0],
          positive: ['3', 0],
          negative: ['4', 0],
          latent_image: ['5', 0],
        },
      },
      7: { class_type: 'VAEDecode', inputs: { samples: ['6', 0], vae: ['1', 2] } },
      8: {
        class_type: 'SaveImage',
        inputs: { images: ['7', 0], filename_prefix: `output_${Date.now()}` },
      },
    };
  }

  /**
   * Build custom workflow from a nodes object (must be API JSON format)
   */
  buildCustom(nodes) {
    return nodes;
  }

  /**
   * Build Text-to-Video workflow (AnimateDiff format — API JSON).
   * Uses CheckpointLoaderSimple + CLIPTextEncode + KSampler + VAEDecode +
   * SaveAnimatedWEBP. Produces a short animated clip from a text prompt.
   * Low-RAM friendly: defaults to 16 frames at 512x512.
   */
  buildTextToVideo({
    prompt,
    negativePrompt = '',
    model = 'sd_xl_base_1.0.safetensors',
    frames = 16,
    steps = 20,
    cfg = 7,
    seed = -1,
    width = 512,
    height = 512,
    sampler = 'euler',
    scheduler = 'normal',
  }) {
    const actualSeed = seed === -1 || seed == null ? Math.floor(Math.random() * 2 ** 31) : seed;

    return {
      1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: model } },
      2: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['1', 1] } },
      3: { class_type: 'CLIPTextEncode', inputs: { text: negativePrompt, clip: ['1', 1] } },
      4: {
        class_type: 'EmptyLatentImage',
        inputs: { width, height, batch_size: frames },
      },
      5: {
        class_type: 'KSampler',
        inputs: {
          seed: actualSeed,
          steps,
          cfg,
          sampler_name: sampler,
          scheduler,
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
          filename_prefix: `vid_${Date.now()}`,
          fps: 8,
          lossless: false,
          quality: 80,
          method: 'default',
        },
      },
    };
  }
}

module.exports = WorkflowBuilder;
