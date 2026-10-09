'use strict';

/**
 * HuggingFaceAdapter — discovers models from Hugging Face Hub.
 * Uses the public HF API. Optional HF_TOKEN for higher rate limits.
 */

const https = require('https');

function hfGet(path, token) {
  return new Promise((resolve) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = https.get({ hostname: 'huggingface.co', path, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data: null }); }
      });
    });
    req.setTimeout(10000, () => { req.destroy(); resolve({ status: 0, data: null }); });
    req.on('error', () => resolve({ status: 0, data: null }));
  });
}

function estimateVRAM(params) {
  if (!params) return null;
  // rough estimate: 2 bytes per param (fp16) → params * 2 bytes
  const billions = parseFloat(params);
  if (isNaN(billions)) return null;
  return +(billions * 2).toFixed(1); // GB in fp16
}

function mapModel(m) {
  const params = m.safetensors?.total
    ? (m.safetensors.total / 1e9).toFixed(1) + 'B'
    : m.cardData?.['model-index']?.[0]?.results?.[0]?.metrics?.[0]?.value || null;
  const vramEstimate = estimateVRAM(params);

  return {
    id: m.id || m.modelId,
    name: m.id || m.modelId,
    organization: m.id?.includes('/') ? m.id.split('/')[0] : null,
    description: m.description || m.cardData?.description || null,
    architecture: m.config?.architectures?.[0] || m.cardData?.architectures?.[0] || null,
    params,
    context: m.config?.max_position_embeddings || null,
    license: m.cardData?.license || null,
    downloads: m.downloads || 0,
    likes: m.likes || 0,
    lastUpdated: m.lastModified || null,
    tags: m.tags || [],
    pipeline: m.pipeline_tag || null,
    vramEstimateGB: vramEstimate,
    url: `https://huggingface.co/${m.id || m.modelId}`,
    source: 'huggingface',
  };
}

/**
 * Search Hugging Face models.
 * @param {string} query
 * @param {object} options - { task, limit, sort }
 */
async function searchModels(query = '', options = {}) {
  const token = process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN;
  const { task = 'text-generation', limit = 20, sort = 'downloads' } = options;

  let path = `/api/models?pipeline_tag=${task}&sort=${sort}&direction=-1&limit=${limit}`;
  if (query) path += `&search=${encodeURIComponent(query)}`;

  const { status, data } = await hfGet(path, token);
  if (status !== 200 || !data) {
    return { error: `HuggingFace API returned ${status}`, results: [] };
  }

  const items = Array.isArray(data) ? data : data.models || [];
  return {
    query,
    total: items.length,
    results: items.map(mapModel),
  };
}

/**
 * Get details for a specific HF model.
 */
async function getModel(modelId) {
  const token = process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN;
  const { status, data } = await hfGet(`/api/models/${modelId}`, token);
  if (status !== 200 || !data) return null;
  return mapModel(data);
}

/**
 * Curated list of well-known free HF models suitable for local use (GGUF / small).
 */
const CURATED_HF_MODELS = [
  { id: 'bartowski/Llama-3.2-3B-Instruct-GGUF', name: 'Llama 3.2 3B GGUF', params: '3B', vramEstimateGB: 2.5, license: 'llama3', downloads: 500000, tags: ['gguf', 'llama', 'instruct'], source: 'huggingface' },
  { id: 'microsoft/Phi-3.5-mini-instruct', name: 'Phi-3.5 Mini Instruct', params: '3.8B', vramEstimateGB: 3.5, license: 'MIT', downloads: 400000, tags: ['phi', 'small', 'instruct'], source: 'huggingface' },
  { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen 2.5 7B Instruct', params: '7B', vramEstimateGB: 7, license: 'Apache-2.0', downloads: 350000, tags: ['qwen', 'instruct'], source: 'huggingface' },
  { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B IT', params: '9B', vramEstimateGB: 9, license: 'gemma', downloads: 300000, tags: ['gemma', 'instruct'], source: 'huggingface' },
  { id: 'mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B Instruct v0.3', params: '7B', vramEstimateGB: 7, license: 'Apache-2.0', downloads: 600000, tags: ['mistral', 'instruct'], source: 'huggingface' },
  { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B Instruct', params: '8B', vramEstimateGB: 8, license: 'llama3', downloads: 800000, tags: ['llama', 'instruct'], source: 'huggingface' },
  { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B', name: 'DeepSeek R1 Distill 7B', params: '7B', vramEstimateGB: 7, license: 'MIT', downloads: 200000, tags: ['deepseek', 'reasoning'], source: 'huggingface' },
  { id: 'bartowski/deepseek-r1-0528-qwen3-8b-GGUF', name: 'DeepSeek R1 Qwen3 8B GGUF', params: '8B', vramEstimateGB: 5, license: 'MIT', downloads: 150000, tags: ['gguf', 'deepseek', 'reasoning'], source: 'huggingface' },
];

module.exports = { searchModels, getModel, CURATED_HF_MODELS };
