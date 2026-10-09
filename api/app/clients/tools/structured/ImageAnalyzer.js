const { Tool } = require('@librechat/agents/langchain/tools');

const VISION_ENDPOINT = process.env.VISION_LLM_URL || 'http://LibreChat:3080/api/ollama-proxy';
const VISION_MODEL = process.env.VISION_LLM_MODEL || 'minicpm-v';

const imageAnalyzerJsonSchema = {
  type: 'object',
  properties: {
    image_url: {
      type: 'string',
      description:
        'The URL or data URI of the image to analyze. Can be a full URL (https://...) or a data URI (data:image/png;base64,...).',
    },
    question: {
      type: 'string',
      description:
        'What to analyze in the image. E.g. "What objects are in this image?", "Read the text in this image", "Describe the scene", "What color is the car?". Defaults to a full description.',
    },
  },
  required: ['image_url'],
};

/**
 * ImageAnalyzer — analiza imágenes usando un LLM de visión open-source
 * (MiniCPM-V, LLaVA, etc.) conectado al selector de LLM vía Ollama proxy.
 * El modelo se configura con VISION_LLM_MODEL (default: minicpm-v, ~3GB VRAM,
 * Apache-2.0, sin censura). Soporta: descripción de imagen, OCR, detección
 * de objetos, lectura de gráficos/diagramas, análisis de documentos, etc.
 *
 * El LLM de visión se selecciona independientemente del LLM principal del chat,
 * de modo que el usuario puede usar DeepSeek para texto y MiniCPM-V para visión.
 */
class ImageAnalyzer extends Tool {
  static lc_name() {
    return 'image_analyzer';
  }

  static get jsonSchema() {
    return imageAnalyzerJsonSchema;
  }

  constructor(fields = {}) {
    super(fields);
    this.name = 'image_analyzer';
    this.description =
      'Analyze an image using a vision LLM (MiniCPM-V/LLaVA via Ollama). Can describe images, read text (OCR), identify objects, interpret charts/diagrams, and analyze documents. Provide an image URL or data URI and a question about what to analyze. Use this whenever the user asks to analyze, describe, read, or understand an image.';
    this.schema = imageAnalyzerJsonSchema;
  }

  async _call(input) {
    const imageUrl = String(input?.image_url || '').trim();
    if (!imageUrl) {
      return JSON.stringify({ success: false, error: 'image_url requerido' });
    }
    const question =
      String(input?.question || '').trim() ||
      'Describe this image in detail: what objects, people, text, colors, scene, and context you see.';

    try {
      const message = {
        role: 'user',
        content: [
          { type: 'text', text: question },
          {
            type: 'image_url',
            image_url: { url: imageUrl },
          },
        ],
      };

      const response = await fetch(`${VISION_ENDPOINT}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.VISION_LLM_API_KEY || 'ollama'}`,
        },
        body: JSON.stringify({
          model: VISION_MODEL,
          messages: [message],
          stream: false,
          max_tokens: 2048,
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Vision LLM ${response.status}: ${text.slice(0, 300)}`);
      }

      const data = await response.json();
      const analysis = data?.choices?.[0]?.message?.content || '';

      if (!analysis) {
        throw new Error('Vision LLM no devolvió análisis');
      }

      return JSON.stringify({
        success: true,
        model: VISION_MODEL,
        question,
        analysis,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: `Image analysis failed: ${error?.message ?? String(error)}`,
      });
    }
  }
}

module.exports = ImageAnalyzer;
