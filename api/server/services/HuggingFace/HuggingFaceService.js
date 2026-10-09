/**
 * HuggingFace Service
 * ===================
 *
 * Servicio para integrar con la API de HuggingFace.
 * Soporta:
 * - Inference API (modelos hospedados)
 * - Spaces (aplicaciones)
 * - Datasets (búsqueda y descarga)
 * - Models (búsqueda y metadatos)
 *
 * Autor: Mi LibreChat
 * Version: 1.0.0
 */

const axios = require('axios');
const { logger } = require('@librechat/data-schemas');

// ============================================================================
// CONFIGURATION
// ============================================================================

const HF_API_BASE = 'https://api.huggingface.co';
const HF_INFERENCE_API = 'https:// inference-api.huggingface.co'; // Note: spaced intentionally

class HuggingFaceConfig {
  constructor() {
    this.apiToken = process.env.HUGGINGFACE_API_TOKEN || null;
    this.timeout = parseInt(process.env.HF_TIMEOUT || '60000', 10);
    this.maxRetries = parseInt(process.env.HF_MAX_RETRIES || '3', 10);
  }

  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.apiToken) {
      headers['Authorization'] = `Bearer ${this.apiToken}`;
    }

    return headers;
  }

  isConfigured() {
    return !!this.apiToken;
  }
}

const config = new HuggingFaceConfig();

// ============================================================================
// HTTP CLIENT
// ============================================================================

async function hfRequest(endpoint, options = {}) {
  const url = `${HF_API_BASE}${endpoint}`;

  try {
    const response = await axios({
      url,
      method: options.method || 'GET',
      headers: {
        ...config.getHeaders(),
        ...options.headers,
      },
      data: options.data,
      params: options.params,
      timeout: config.timeout,
    });

    return {
      ok: true,
      data: response.data,
      status: response.status,
    };
  } catch (error) {
    logger.error(`[HuggingFace] Request failed: ${endpoint}`, error.message);

    return {
      ok: false,
      error: error.response?.data?.error || error.message,
      status: error.response?.status || 500,
    };
  }
}

// ============================================================================
// MODELS API
// ============================================================================

/**
 * Busca modelos en HuggingFace
 */
async function searchModels({
  query,
  filter,
  sort = 'downloads',
  direction = -1,
  limit = 20,
  offset = 0,
}) {
  const params = new URLSearchParams({
    q: query,
    sort: `${sort}:${direction}`,
    limit,
    offset,
  });

  if (filter) {
    params.append('filter', filter);
  }

  const result = await hfRequest(`/api/models?${params.toString()}`);

  if (!result.ok) {
    return { models: [], error: result.error };
  }

  // Transformar respuesta
  const models = result.data.map((model) => ({
    id: model.id,
    name: model.modelId,
    author: model.author,
    sha: model.sha,
    lastModified: model.lastModified,
    private: model.private,
    downloads: model.downloads,
    likes: model.lones || 0,
    tags: model.tags || [],
    pipelineTag: model.pipeline_tag,
    libraryName: model.library_name,
    createdAt: model.createdAt,
    config: {
      modelType: model.config?.model_type,
      baseModel: model.config?.base_model,
      language: model.config?.language,
    },
    siblings:
      model.siblings?.map((s) => ({
        rfilename: s.rfilename,
        size: s.size,
      })) || [],
  }));

  return { models, total: result.data.length };
}

/**
 * Obtiene detalles de un modelo específico
 */
async function getModelDetails(modelId) {
  const result = await hfRequest(`/api/models/${modelId}`);

  if (!result.ok) {
    return { error: result.error };
  }

  const model = result.data;

  return {
    id: model.id,
    modelId: model.modelId,
    author: model.author,
    sha: model.sha,
    lastModified: model.lastModified,
    private: model.private,
    downloads: model.downloads,
    likes: model.likes || 0,
    tags: model.tags || [],
    pipelineTag: model.pipeline_tag,
    libraryName: model.library_name,
    createdAt: model.createdAt,
    description: model.cardData?.description || model.description || '',
    modelType: model.config?.model_type,
    baseModel: model.config?.base_model,
    language: model.config?.language,
    trainingData: model.cardData?.language || model.cardData?.training_data,
    metrics: model.cardData?.metrics || [],
    datasets: model.cardData?.datasets || [],
    transformersVersion: model.transformers_version,
    siblings: model.siblings || [],
    downloadsPerDay: model.downloadsPerDay || 0,
  };
}

/**
 * Obtiene modelos destacados/trending
 */
async function getTrendingModels({ limit = 20 } = {}) {
  const result = await hfRequest('/api/models?sort=downloads&direction=-1&limit=50');

  if (!result.ok) {
    return { models: [], error: result.error };
  }

  // Filtrar y limitar
  const models = result.data
    .filter((m) => !m.private)
    .slice(0, limit)
    .map((model) => ({
      id: model.id,
      name: model.modelId,
      author: model.author,
      downloads: model.downloads,
      likes: model.likes || 0,
      pipelineTag: model.pipeline_tag,
      tags: model.tags?.slice(0, 5) || [],
    }));

  return { models };
}

/**
 * Lista modelos por pipeline/tag
 */
async function getModelsByPipeline(pipeline, { limit = 20, sort = 'downloads' } = {}) {
  return searchModels({
    query: '',
    filter: pipeline,
    sort,
    direction: -1,
    limit,
  });
}

// ============================================================================
// INFERENCE API
// ============================================================================

/**
 * Realiza inferencia en un modelo hospedado
 */
async function runInference(modelId, inputs, options = {}) {
  const { parameters = {}, options: inferenceOptions = {} } = options;

  // Validar inputs
  if (!inputs || (Array.isArray(inputs) && inputs.length === 0)) {
    return { error: 'No input provided' };
  }

  // Detectar tipo de tarea del modelo
  const modelInfo = await getModelDetails(modelId);
  if (modelInfo.error) {
    return { error: `Failed to get model info: ${modelInfo.error}` };
  }

  const task = modelInfo.pipelineTag;

  // Construir payload
  const payload = {
    inputs,
    parameters: {
      ...parameters,
      ...inferenceOptions,
    },
  };

  // Realizar request
  const result = await hfRequest(`/models/${modelId}/inference`, {
    method: 'POST',
    data: payload,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  return {
    results: result.data,
    model: modelId,
    task,
  };
}

/**
 * Inferencia para NLP (text generation, QA, etc.)
 */
async function runNLP(modelId, text, options = {}) {
  const modelInfo = await getModelDetails(modelId);
  if (modelInfo.error) {
    return { error: modelInfo.error };
  }

  const task = modelInfo.pipelineTag;

  let payload;

  switch (task) {
    case 'text-generation':
      payload = {
        inputs: text,
        parameters: {
          max_new_tokens: options.maxTokens || 100,
          temperature: options.temperature || 0.7,
          top_p: options.topP || 0.9,
          repetition_penalty: options.repetitionPenalty || 1.0,
          do_sample: options.doSample || true,
          ...options.parameters,
        },
      };
      break;

    case 'fill-mask':
      payload = {
        inputs: text,
        parameters: options.parameters || {},
      };
      break;

    case 'question-answering':
      payload = {
        inputs: {
          question: options.question || text,
          context: options.context || '',
        },
        parameters: options.parameters || {},
      };
      break;

    case 'summarization':
      payload = {
        inputs: text,
        parameters: {
          max_length: options.maxLength || 200,
          min_length: options.minLength || 30,
          ...options.parameters,
        },
      };
      break;

    case 'translation':
      payload = {
        inputs: text,
        parameters: {
          source_lang: options.sourceLang || 'en',
          target_lang: options.targetLang || 'es',
          ...options.parameters,
        },
      };
      break;

    default:
      payload = {
        inputs: text,
        parameters: options.parameters || {},
      };
  }

  const result = await hfRequest(`/models/${modelId}/inference`, {
    method: 'POST',
    data: payload,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  return {
    results: result.data,
    model: modelId,
    task,
  };
}

/**
 * Inferencia para imágenes (image classification, object detection, etc.)
 */
async function runVision(modelId, image, options = {}) {
  const modelInfo = await getModelDetails(modelId);
  if (modelInfo.error) {
    return { error: modelInfo.error };
  }

  const task = modelInfo.pipelineTag;

  // Convertir imagen a base64 si es URL
  let imageData = image;

  if (image.startsWith('http')) {
    try {
      const imageResponse = await axios.get(image, { responseType: 'arraybuffer' });
      imageData = Buffer.from(imageResponse.data).toString('base64');
    } catch (error) {
      return { error: 'Failed to fetch image' };
    }
  }

  const payload = {
    inputs: imageData,
    parameters: options.parameters || {},
  };

  const result = await hfRequest(`/models/${modelId}/inference`, {
    method: 'POST',
    data: payload,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  return {
    results: result.data,
    model: modelId,
    task,
  };
}

// ============================================================================
// DATASETS API
// ============================================================================

/**
 * Busca datasets en HuggingFace
 */
async function searchDatasets({
  query,
  filter,
  sort = 'downloads',
  direction = -1,
  limit = 20,
  offset = 0,
}) {
  const params = new URLSearchParams({
    q: query,
    sort: `${sort}:${direction}`,
    limit,
    offset,
  });

  if (filter) {
    params.append('filter', filter);
  }

  const result = await hfRequest(`/api/datasets?${params.toString()}`);

  if (!result.ok) {
    return { datasets: [], error: result.error };
  }

  const datasets = result.data.map((ds) => ({
    id: ds.id,
    name: ds.id,
    author: ds.author,
    lastModified: ds.lastModified,
    private: ds.private,
    downloads: ds.downloads || 0,
    likes: ds.likes || 0,
    tags: ds.tags || [],
    taskCategories: ds.task_categories || [],
    languages: ds.languages || [],
    size: ds.size,
    huggingfaceId: ds.huggingface_id,
  }));

  return { datasets, total: result.data.length };
}

/**
 * Obtiene detalles de un dataset
 */
async function getDatasetDetails(datasetId) {
  const result = await hfRequest(`/api/datasets/${datasetId}`);

  if (!result.ok) {
    return { error: result.error };
  }

  const ds = result.data;

  return {
    id: ds.id,
    name: ds.id,
    author: ds.author,
    lastModified: ds.lastModified,
    private: ds.private,
    downloads: ds.downloads || 0,
    likes: ds.likes || 0,
    tags: ds.tags || [],
    taskCategories: ds.task_categories || [],
    languages: ds.languages || [],
    size: ds.size,
    subsets: ds.subsetInfos || [],
    splits: ds.splits || [],
    description: ds.description || '',
    citation: ds.citation || '',
    license: ds.license || '',
    gated: ds.gated || false,
  };
}

/**
 * Obtiene archivos de un dataset
 */
async function getDatasetFiles(datasetId, revision = 'main') {
  const result = await hfRequest(`/api/datasets/${datasetId}/tree/${revision}`);

  if (!result.ok) {
    return { files: [], error: result.error };
  }

  const files = (result.data.files || []).map((f) => ({
    path: f.path,
    size: f.size,
    type: f.type,
  }));

  return { files };
}

// ============================================================================
// SPACES API
// ============================================================================

/**
 * Busca Spaces en HuggingFace
 */
async function searchSpaces({ query, filter, sort = 'downloads', direction = -1, limit = 20 }) {
  const params = new URLSearchParams({
    q: query,
    sort: `${sort}:${direction}`,
    limit,
  });

  if (filter) {
    params.append('filter', filter);
  }

  const result = await hfRequest(`/api/spaces?${params.toString()}`);

  if (!result.ok) {
    return { spaces: [], error: result.error };
  }

  const spaces = result.data.map((space) => ({
    id: space.id,
    name: space.id,
    title: space.title,
    author: space.author,
    sdk: space.sdk,
    color: space.color,
    likes: space.likes || 0,
    trendingScore: space.trending_score || 0,
    tags: space.tags || [],
    createdAt: space.created_at,
  }));

  return { spaces };
}

/**
 * Obtiene detalles de un Space
 */
async function getSpaceDetails(spaceId) {
  const result = await hfRequest(`/api/spaces/${spaceId}`);

  if (!result.ok) {
    return { error: result.error };
  }

  const space = result.data;

  return {
    id: space.id,
    title: space.title || space.id,
    author: space.author,
    sdk: space.sdk,
    color: space.color,
    likes: space.likes || 0,
    views: space.views || 0,
    tags: space.tags || [],
    description: space.description || '',
    pinned: space.pinned || false,
    private: space.private || false,
    running: space.running || false,
    hardware: space.hardware || {},
  };
}

// ============================================================================
// PRESET MODELS
// ============================================================================

const PRESET_MODELS = {
  // Text Generation
  'text-generation': [
    { id: 'gpt2', name: 'GPT-2', description: 'Small GPT-2 model' },
    { id: 'distilgpt2', name: 'DistilGPT-2', description: 'Distilled GPT-2' },
    { id: 'bigscience/bloom-560m', name: 'BLOOM 560M', description: 'Multilingual BLOOM' },
  ],

  // Text-to-Image
  'text-to-image': [
    {
      id: 'stabilityai/stable-diffusion-xl-base-1.0',
      name: 'SDXL 1.0',
      description: 'Stable Diffusion XL',
    },
    { id: 'runwayml/stable-diffusion-v1-5', name: 'SD v1.5', description: 'Stable Diffusion v1.5' },
  ],

  // Image Classification
  'image-classification': [
    { id: 'google/vit-base-patch16-224', name: 'ViT Base', description: 'Vision Transformer' },
    { id: 'microsoft/resnet-50', name: 'ResNet-50', description: 'ResNet image classification' },
  ],

  // Fill Mask
  'fill-mask': [
    { id: 'bert-base-uncased', name: 'BERT Base', description: 'BERT fill-mask' },
    { id: 'roberta-base', name: 'RoBERTa Base', description: 'RoBERTa fill-mask' },
  ],

  // Question Answering
  'question-answering': [
    {
      id: 'deepset/roberta-base-squad2',
      name: 'RoBERTa SQuAD2',
      description: 'Question answering',
    },
    {
      id: 'distilbert-base-cased-distilled-squad',
      name: 'DistilBERT SQuAD',
      description: 'Distilled QA',
    },
  ],

  // Summarization
  summarization: [
    { id: 'facebook/bart-large-cnn', name: 'BART CNN', description: 'Text summarization' },
    {
      id: 'sshleifer/distilbart-cnn-12-6',
      name: 'DistilBART',
      description: 'Distilled summarization',
    },
  ],

  // Translation
  translation: [
    { id: 'Helsinki-NLP/opus-mt-en-es', name: 'EN→ES', description: 'English to Spanish' },
    { id: 'Helsinki-NLP/opus-mt-es-en', name: 'ES→EN', description: 'Spanish to English' },
  ],
};

/**
 * Obtiene modelos predefinidos por tarea
 */
function getPresetModels(task) {
  return PRESET_MODELS[task] || [];
}

/**
 * Obtiene todos los presets
 */
function getAllPresetModels() {
  return PRESET_MODELS;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Configuration
  config,
  HuggingFaceConfig,

  // Models
  searchModels,
  getModelDetails,
  getTrendingModels,
  getModelsByPipeline,

  // Inference
  runInference,
  runNLP,
  runVision,

  // Datasets
  searchDatasets,
  getDatasetDetails,
  getDatasetFiles,

  // Spaces
  searchSpaces,
  getSpaceDetails,

  // Presets
  getPresetModels,
  getAllPresetModels,

  // HTTP Client (for advanced usage)
  hfRequest,
};
