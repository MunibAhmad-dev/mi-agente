'use strict';

/**
 * ImageGenerator - Generate images using free APIs (pollinations.ai, HuggingFace)
 */
class ImageGenerator {
  constructor(config = {}) {
    this.hfToken = config.hfToken || process.env.HF_API_TOKEN;
    this.outputDir = config.outputDir || './generated_images';
  }

  async generate(prompt, options = {}) {
    const { width = 1024, height = 1024, model = 'flux', seed } = options;

    // Try pollinations.ai first (free, no key)
    try {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed || Math.floor(Math.random() * 999999)}&nologo=true`;
      const response = await fetch(url);
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const path = `${this.outputDir}/img_${Date.now()}.png`;
        const fs = require('fs');
        if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
        fs.writeFileSync(path, buffer);
        return { success: true, path, source: 'pollinations.ai', prompt };
      }
    } catch (e) {}

    // Try HuggingFace Inference API
    if (this.hfToken) {
      try {
        const response = await fetch(
          'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${this.hfToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputs: prompt, parameters: { width, height } }),
          }
        );
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          const path = `${this.outputDir}/img_${Date.now()}.png`;
          const fs = require('fs');
          if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
          fs.writeFileSync(path, buffer);
          return { success: true, path, source: 'huggingface', prompt };
        }
      } catch (e) {}
    }

    return { success: false, error: 'No image generation provider available' };
  }

  async generateVariations(prompt, count = 4) {
    const results = [];
    for (let i = 0; i < count; i++) {
      const result = await this.generate(prompt, { seed: i * 1000 });
      results.push(result);
    }
    return results;
  }

  getStats() {
    return { hasHfToken: !!this.hfToken, providers: ['pollinations.ai', 'huggingface'] };
  }
}

module.exports = ImageGenerator;
