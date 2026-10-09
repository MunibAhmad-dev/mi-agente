/**
 * Image Runtime - Generación de Imágenes con IA (JavaScript)
 *
 * Usa Hugging Face Inference API (gratuito ~30 req/min)
 * y DALL-E Mini como alternativa gratuita.
 *
 * FLUJO:
 * ExecutionEngine → ImageRuntime.execute() → HuggingFace API → Imagen
 */

const { getEventBus, EventType } = require('../EventBus');
const { Capability } = require('../RuntimeRegistry');
const https = require('https');
const http = require('http');

const logger = {
  debug: (...args) => console.log('[ImageRuntime]', ...args),
  info: (...args) => console.log('[ImageRuntime]', ...args),
  warn: (...args) => console.warn('[ImageRuntime]', ...args),
  error: (...args) => console.error('[ImageRuntime]', ...args),
};

// Proveedores de imágenes
const ImageProviders = {
  HUGGINGFACE: 'huggingface',
  DALLMINI: 'dallemini',
};

/**
 * Hugging Face Image Provider (Gratuito ~30 req/min)
 */
class HuggingFaceProvider {
  constructor(config = {}) {
    this.name = ImageProviders.HUGGINGFACE;
    this.apiToken = config.huggingfaceApiToken || process.env.HUGGINGFACE_API_TOKEN;
    this.config = config;
  }

  async generate(prompt, options = {}) {
    const model = options.model || 'stabilityai/stable-diffusion-xl-base-1.0';

    logger.debug(`[HuggingFace] Generating image with model: ${model}`);

    // Si no hay token, usar modelo público
    const usePublicModel = !this.apiToken;

    try {
      if (usePublicModel) {
        // Usar DALL-E Mini público (sin API key)
        return await this.generateWithDalleMini(prompt);
      } else {
        // Usar SDXL con API token
        return await this.generateWithSDXL(prompt, options);
      }
    } catch (error) {
      logger.error('[HuggingFace] Generation failed:', error.message);
      throw error;
    }
  }

  async generateWithDalleMini(prompt) {
    // DALL-E Mini via Hugging Face Spaces público
    const response = await this.httpPost(
      'https://api-inference.huggingface.co/models/dalle-mini/dalle-mari',
      {
        inputs: prompt,
      },
      this.apiToken,
    );

    return {
      image: `data:image/png;base64,${response.toString('base64')}`,
      model: 'dalle-mini',
      provider: this.name,
    };
  }

  async generateWithSDXL(prompt, options) {
    const model = options.model || 'stabilityai/stable-diffusion-xl-base-1.0';

    const response = await this.httpPost(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        inputs: prompt,
        parameters: {
          negative_prompt: options.negativePrompt,
          num_inference_steps: options.steps || 30,
          guidance_scale: options.guidanceScale || 7.5,
          width: options.width || 1024,
          height: options.height || 1024,
        },
      },
      this.apiToken,
    );

    return {
      image: `data:image/png;base64,${response.toString('base64')}`,
      model,
      provider: this.name,
    };
  }

  async httpPost(url, body, token) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const lib = isHttps ? https : http;

      const data = JSON.stringify(body);

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      };

      if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
      }

      const req = lib.request(options, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(buffer);
          } else {
            try {
              const error = JSON.parse(buffer.toString());
              reject(new Error(error.error || `HTTP ${res.statusCode}`));
            } catch {
              reject(new Error(`HTTP ${res.statusCode}`));
            }
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
}

/**
 * Mock Provider para desarrollo
 */
class MockImageProvider {
  constructor(config = {}) {
    this.name = 'mock';
    this.config = config;
  }

  async generate(prompt, options = {}) {
    logger.debug(`[MockImage] Generating for: ${prompt.substring(0, 50)}`);

    // Simular latencia
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Generar placeholder SVG
    const svg = this.generatePlaceholderSVG(prompt);
    const base64 = Buffer.from(svg).toString('base64');

    return {
      image: `data:image/svg+xml;base64,${base64}`,
      model: 'mock-image-generator',
      provider: 'mock',
      prompt,
    };
  }

  generatePlaceholderSVG(prompt) {
    const truncatedPrompt = prompt.substring(0, 30);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <rect fill="#1a1a2e" width="512" height="512"/>
      <text x="256" y="240" font-family="Arial" font-size="24" fill="white" text-anchor="middle">AI Generated Image</text>
      <text x="256" y="280" font-family="Arial" font-size="16" fill="#888" text-anchor="middle">${truncatedPrompt}...</text>
      <text x="256" y="320" font-family="Arial" font-size="12" fill="#666" text-anchor="middle">(Mock Mode - Configure HuggingFace API)</text>
    </svg>`;
  }
}

/**
 * Image Runtime - Clase principal
 */
class ImageRuntime {
  constructor(config = {}) {
    this.eventBus = getEventBus();
    this.name = 'ImageRuntime';
    this.capabilities = [Capability.IMAGE_GENERATION, Capability.IMAGE_EDITING];
    this.status = 'initializing';

    // Inicializar proveedor
    const apiToken = config.huggingfaceApiToken || process.env.HUGGINGFACE_API_TOKEN;

    if (apiToken) {
      this.provider = new HuggingFaceProvider(config);
      logger.info('[ImageRuntime] Using HuggingFace provider');
    } else {
      this.provider = new MockImageProvider(config);
      logger.info('[ImageRuntime] Using Mock provider (set HUGGINGFACE_API_TOKEN for real images)');
    }

    this.config = {
      defaultModel: config.defaultModel || 'stabilityai/stable-diffusion-xl-base-1.0',
      defaultSteps: config.defaultSteps || 30,
      defaultGuidanceScale: config.defaultGuidanceScale || 7.5,
      defaultWidth: config.defaultWidth || 1024,
      defaultHeight: config.defaultHeight || 1024,
      timeout: config.timeout || 120000,
      ...config,
    };
  }

  /**
   * Inicializar el runtime
   */
  async initialize() {
    this.status = 'ready';

    logger.info('[ImageRuntime] Initialized');

    this.eventBus.publish(
      'runtime.ready',
      {
        runtime: this.name,
        capabilities: this.capabilities,
        provider: this.provider.name,
      },
      'ImageRuntime',
    );

    return true;
  }

  /**
   * Ejecutar generación de imagen
   */
  async execute(task) {
    const startTime = Date.now();
    const { intent, prompt, options = {} } = task;

    const imagePrompt = prompt || intent;

    logger.debug('[ImageRuntime] Generating image:', imagePrompt.substring(0, 50));

    this.eventBus.publish(
      EventType.EXECUTION_STARTED,
      {
        runtime: this.name,
        prompt: imagePrompt,
      },
      'ImageRuntime',
    );

    try {
      const result = await Promise.race([
        this.provider.generate(imagePrompt, {
          model: options.model || this.config.defaultModel,
          negativePrompt: options.negativePrompt,
          steps: options.steps || this.config.defaultSteps,
          guidanceScale: options.guidanceScale || this.config.defaultGuidanceScale,
          width: options.width || this.config.defaultWidth,
          height: options.height || this.config.defaultHeight,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Image generation timeout')), this.config.timeout),
        ),
      ]);

      const duration = Date.now() - startTime;

      this.eventBus.publish(
        EventType.EXECUTION_COMPLETED,
        {
          runtime: this.name,
          duration,
          model: result.model,
        },
        'ImageRuntime',
      );

      return {
        text: `Imagen generada: "${imagePrompt}"`,
        imageUrl: result.image,
        base64: result.image,
        model: result.model,
        provider: result.provider,
        prompt: imagePrompt,
        latency: duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.eventBus.publish(
        EventType.EXECUTION_FAILED,
        {
          runtime: this.name,
          error: error.message,
          duration,
        },
        'ImageRuntime',
      );

      logger.error('[ImageRuntime] Generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Verificar salud del runtime
   */
  async healthCheck() {
    return this.status === 'ready';
  }

  /**
   * Obtener capacidades del runtime
   */
  getCapabilities() {
    return this.capabilities;
  }

  /**
   * Apagar el runtime
   */
  async shutdown() {
    this.status = 'shutdown';
    logger.info('[ImageRuntime] Shutdown complete');
  }
}

// Singleton
let runtimeInstance = null;

function getImageRuntime(config) {
  if (!runtimeInstance) {
    runtimeInstance = new ImageRuntime(config);
  }
  return runtimeInstance;
}

function createImageRuntime(config) {
  runtimeInstance = new ImageRuntime(config);
  return runtimeInstance;
}

module.exports = {
  ImageRuntime,
  HuggingFaceProvider,
  MockImageProvider,
  ImageProviders,
  getImageRuntime,
  createImageRuntime,
};
