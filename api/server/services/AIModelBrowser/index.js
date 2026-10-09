#!/usr/bin/env node
/**
 * AI Model Browser Service
 * 
 * Universal search engine for AI models across:
 * - HuggingFace Hub (LLMs, Image, Audio, etc.)
 * - GitHub repos
 * - Ollama library
 * - LM Studio models
 * - Stable Diffusion / Flux / Wan checkpoints
 * - LoRAs, embeddings, VAEs
 * 
 * 100% FREE - No API keys needed for basic search
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class AIModelBrowser extends EventEmitter {
  constructor() {
    super();
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 min cache
    this.categories = {
      'llm': { label: 'LLM', icon: '🧠', subcategories: ['text-generation', 'code', 'chat', 'instruct', 'base'] },
      'image': { label: 'Image Gen', icon: '🎨', subcategories: ['stable-diffusion', 'flux', 'wan', 'sdxl', 'controlnet', 'loras'] },
      'audio': { label: 'Audio', icon: '🔊', subcategories: ['tts', 'stt', 'music', 'sound-effects'] },
      'video': { label: 'Video', icon: '🎬', subcategories: ['text-to-video', 'image-to-video'] },
      'embedding': { label: 'Embeddings', icon: '📐', subcategories: ['text-embedding', 'image-embedding'] },
      'vision': { label: 'Vision', icon: '👁️', subcategories: ['image-classification', 'object-detection', 'segmentation', 'ocr'] },
      'multimodal': { label: 'Multimodal', icon: '🌐', subcategories: ['vision-language', 'audio-language'] },
      'quantized': { label: 'Quantized', icon: '📦', subcategories: ['gguf', 'awq', 'gptq', 'exl2'] },
      'lora': { label: 'LoRA', icon: '🔧', subcategories: ['style', 'character', 'concept', 'technical'] }
    };
    
    this.providers = {
      'huggingface': { name: 'HuggingFace', url: 'https://huggingface.co', api: 'https://huggingface.co/api', free: true },
      'ollama': { name: 'Ollama', url: 'https://ollama.com', api: 'https://ollama.com/api', free: true },
      'github': { name: 'GitHub', url: 'https://github.com', api: 'https://api.github.com', free: true },
      'civitai': { name: 'CivitAI', url: 'https://civitai.com', api: 'https://civitai.com/api/v1', free: true },
      'lmstudio': { name: 'LM Studio', url: 'https://lmstudio.ai', api: 'http://localhost:1234', free: true }
    };
  }

  // ============================================================
  // HTTP Helper
  // ============================================================
  fetch(url, options = {}) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, {
        timeout: options.timeout || 15000,
        headers: {
          'User-Agent': 'AIModelBrowser/1.0',
          'Accept': 'application/json',
          ...options.headers
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, data: data });
          }
        });
      });
      req.on('error', (e) => reject(e));
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
  }

  // ============================================================
  // HuggingFace Search (FREE, no API key)
  // ============================================================
  async searchHuggingFace(query, options = {}) {
    const { sort = 'downloads', direction = -1, limit = 50, filter = '' } = options;
    
    let url = `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&sort=${sort}&direction=${direction}&limit=${limit}`;
    if (filter) url += `&filter=${filter}`;
    
    const cacheKey = `hf_${query}_${sort}_${limit}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.time < this.cacheTimeout) return cached.data;
    }
    
    try {
      const result = await this.fetch(url);
      const models = (result.data || []).map(m => ({
        id: m.id || m.modelId,
        name: (m.id || m.modelId).split('/').pop(),
        author: (m.id || m.modelId).split('/')[0],
        downloads: m.downloads || 0,
        likes: m.likes || 0,
        tags: m.tags || [],
        pipeline_tag: m.pipeline_tag || 'unknown',
        library_name: m.library_name || 'unknown',
        lastModified: m.lastModified,
        source: 'huggingface',
        url: `https://huggingface.co/${m.id || m.modelId}`,
        category: this.categorizeModel(m.pipeline_tag, m.tags),
        sizes: m.siblings ? m.siblings.filter(s => s.rfilename && s.rfilename.endsWith('.safetensors')).length : 0
      }));
      
      this.cache.set(cacheKey, { data: models, time: Date.now() });
      return models;
    } catch (e) {
      console.error(`HuggingFace search error: ${e.message}`);
      return [];
    }
  }

  // ============================================================
  // Ollama Library Search (FREE)
  // ============================================================
  async searchOllama(query = '') {
    try {
      // Ollama doesn't have a search API, but we can list available models
      const result = await this.fetch('https://ollama.com/api/tags');
      if (result.data && result.data.models) {
        return result.data.models
          .filter(m => !query || m.name.toLowerCase().includes(query.toLowerCase()))
          .map(m => ({
            id: m.name,
            name: m.name,
            author: 'Ollama',
            size: m.size,
            sizeGB: (m.size / 1073741824).toFixed(1) + 'GB',
            modified: m.modified_at,
            source: 'ollama',
            url: `https://ollama.com/library/${m.name}`,
            category: 'llm',
            available: true
          }));
      }
    } catch (e) {}
    
    // Fallback: list of popular Ollama models
    return this.getOllamaPopular().filter(m => 
      !query || m.name.toLowerCase().includes(query.toLowerCase())
    );
  }

  getOllamaPopular() {
    return [
      { id: 'qwen3:1.7b', name: 'Qwen3 1.7B', author: 'Alibaba', source: 'ollama', category: 'llm', sizeGB: '1.0', url: 'https://ollama.com/library/qwen3:1.7b', tags: ['fast', 'coding', 'chinese', 'english'] },
      { id: 'qwen3:8b', name: 'Qwen3 8B', author: 'Alibaba', source: 'ollama', category: 'llm', sizeGB: '5.0', url: 'https://ollama.com/library/qwen3:8b', tags: ['coding', 'reasoning'] },
      { id: 'llama3.2:3b', name: 'LLaMA 3.2 3B', author: 'Meta', source: 'ollama', category: 'llm', sizeGB: '2.0', url: 'https://ollama.com/library/llama3.2:3b', tags: ['fast', 'general'] },
      { id: 'llama3.1:8b', name: 'LLaMA 3.1 8B', author: 'Meta', source: 'ollama', category: 'llm', sizeGB: '4.7', url: 'https://ollama.com/library/llama3.1:8b', tags: ['general', 'reasoning'] },
      { id: 'phi4-mini', name: 'Phi-4 Mini', author: 'Microsoft', source: 'ollama', category: 'llm', sizeGB: '2.3', url: 'https://ollama.com/library/phi4-mini', tags: ['fast', 'coding'] },
      { id: 'deepseek-r1:8b', name: 'DeepSeek R1 8B', author: 'DeepSeek', source: 'ollama', category: 'llm', sizeGB: '5.0', url: 'https://ollama.com/library/deepseek-r1:8b', tags: ['reasoning', 'math'] },
      { id: 'gemma3:4b', name: 'Gemma3 4B', author: 'Google', source: 'ollama', category: 'llm', sizeGB: '3.0', url: 'https://ollama.com/library/gemma3:4b', tags: ['general', 'multilingual'] },
      { id: 'mistral:7b', name: 'Mistral 7B', author: 'Mistral AI', source: 'ollama', category: 'llm', sizeGB: '4.1', url: 'https://ollama.com/library/mistral:7b', tags: ['general', 'fast'] },
      { id: 'codellama:7b', name: 'CodeLlama 7B', author: 'Meta', source: 'ollama', category: 'llm', sizeGB: '3.8', url: 'https://ollama.com/library/codellama:7b', tags: ['coding'] },
      { id: 'minicpm-v', name: 'MiniCPM-V', author: 'OpenBMB', source: 'ollama', category: 'multimodal', sizeGB: '5.5', url: 'https://ollama.com/library/minicpm-v', tags: ['vision', 'multimodal'] },
      { id: 'llava:7b', name: 'LLaVA 7B', author: 'LLaVA Team', source: 'ollama', category: 'multimodal', sizeGB: '4.5', url: 'https://ollama.com/library/llava:7b', tags: ['vision'] },
      { id: 'nomic-embed-text', name: 'Nomic Embed Text', author: 'Nomic AI', source: 'ollama', category: 'embedding', sizeGB: '0.3', url: 'https://ollama.com/library/nomic-embed-text', tags: ['embedding', 'fast'] },
    ];
  }

  // ============================================================
  // CivitAI Search (Stable Diffusion / Flux / LoRA) - FREE API
  // ============================================================
  async searchCivitAI(query = '', options = {}) {
    const { limit = 30, types = '' } = options;
    
    let url = `https://civitai.com/api/v1/models?limit=${limit}&sort=Highest%20Rated`;
    if (query) url += `&query=${encodeURIComponent(query)}`;
    if (types) url += `&types=${types}`;
    
    try {
      const result = await this.fetch(url);
      if (result.data && result.data.items) {
        return result.data.items.map(m => ({
          id: m.id,
          name: m.name,
          author: m.creator?.username || 'Unknown',
          type: m.type,
          stats: m.stats || {},
          downloads: m.stats?.downloadCount || 0,
          rating: m.stats?.rating || 0,
          images: (m.modelVersions || []).flatMap(v => v.images || []).slice(0, 3),
          versions: (m.modelVersions || []).map(v => ({
            id: v.id,
            name: v.name,
            baseModel: v.baseModel,
            size: v.sizeKB ? `${(v.sizeKB / 1024).toFixed(0)}MB` : 'Unknown',
            format: v.files?.[0]?.metadata?.size || 'safetensors'
          })),
          tags: m.tags || [],
          category: this.categorizeCivitAI(m.type),
          source: 'civitai',
          url: `https://civitai.com/models/${m.id}`
        }));
      }
    } catch (e) {
      console.error(`CivitAI search error: ${e.message}`);
    }
    return [];
  }

  categorizeCivitAI(type) {
    const map = {
      'Checkpoint': 'image',
      'LORA': 'lora',
      'TextualInversion': 'embedding',
      'Hypernetwork': 'image',
      'AestheticGradient': 'lora',
      'Controlnet': 'image',
      'Poses': 'image',
      'Wildcards': 'text',
      'Other': 'image'
    };
    return map[type] || 'image';
  }

  // ============================================================
  // GitHub Search (FREE)
  // ============================================================
  async searchGitHub(query = '', options = {}) {
    const { limit = 30, sort = 'stars', language = '' } = options;
    
    let url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query + ' AI model')}&sort=${sort}&per_page=${limit}`;
    if (language) url += `&q=${encodeURIComponent(query + ' language:' + language)}`;
    
    try {
      const result = await this.fetch(url, {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      });
      
      if (result.data && result.data.items) {
        return result.data.items.map(r => ({
          id: r.full_name,
          name: r.name,
          author: r.owner?.login,
          stars: r.stargazers_count,
          forks: r.forks_count,
          language: r.language,
          description: r.description,
          license: r.license?.spdx_id || 'Unknown',
          updated: r.updated_at,
          source: 'github',
          url: r.html_url,
          category: 'llm',
          tags: (r.topics || []).slice(0, 5)
        }));
      }
    } catch (e) {
      console.error(`GitHub search error: ${e.message}`);
    }
    return [];
  }

  // ============================================================
  // LM Studio Local Models
  // ============================================================
  async searchLMStudio() {
    try {
      const result = await this.fetch('http://localhost:1234/v1/models');
      if (result.data && result.data.data) {
        return result.data.data.map(m => ({
          id: m.id,
          name: m.id,
          source: 'lmstudio',
          category: 'llm',
          available: true,
          url: 'http://localhost:1234'
        }));
      }
    } catch (e) {}
    return [];
  }

  // ============================================================
  // Unified Search
  // ============================================================
  async search(query, options = {}) {
    const {
      sources = ['huggingface', 'ollama', 'civitai', 'github'],
      category = 'all',
      sort = 'downloads',
      limit = 30
    } = options;
    
    const results = { huggingface: [], ollama: [], civitai: [], github: [], lmstudio: [] };
    const promises = [];
    
    if (sources.includes('huggingface')) {
      promises.push(
        this.searchHuggingFace(query, { sort, limit }).then(r => { results.huggingface = r; })
          .catch(() => {})
      );
    }
    
    if (sources.includes('ollama')) {
      promises.push(
        this.searchOllama(query).then(r => { results.ollama = r; })
          .catch(() => {})
      );
    }
    
    if (sources.includes('civitai')) {
      promises.push(
        this.searchCivitAI(query, { limit }).then(r => { results.civitai = r; })
          .catch(() => {})
      );
    }
    
    if (sources.includes('github')) {
      promises.push(
        this.searchGitHub(query, { limit: Math.min(limit, 20) }).then(r => { results.github = r; })
          .catch(() => {})
      );
    }
    
    await Promise.allSettled(promises);
    
    // Merge and categorize
    const allModels = [
      ...results.huggingface,
      ...results.ollama,
      ...results.civitai,
      ...results.github
    ];
    
    // Filter by category
    if (category && category !== 'all') {
      return allModels.filter(m => m.category === category);
    }
    
    return allModels;
  }

  // ============================================================
  // Categorize model
  // ============================================================
  categorizeModel(pipeline, tags) {
    const t = (tags || []).map(t => t.toLowerCase()).join(' ');
    const p = (pipeline || '').toLowerCase();
    
    if (p.includes('text-generation') || p.includes('conversational')) return 'llm';
    if (p.includes('text2image') || p.includes('stable-diffusion') || t.includes('diffusers')) return 'image';
    if (p.includes('text-to-audio') || p.includes('text-to-speech') || t.includes('tts')) return 'audio';
    if (p.includes('automatic-speech-recognition') || t.includes('whisper')) return 'audio';
    if (p.includes('image-classification') || p.includes('object-detection')) return 'vision';
    if (p.includes('sentence-similarity') || p.includes('feature-extraction')) return 'embedding';
    if (p.includes('video') || t.includes('video')) return 'video';
    if (p.includes('multimodal') || t.includes('vision-language')) return 'multimodal';
    return 'llm';
  }

  // ============================================================
  // Get model details
  // ============================================================
  async getModelDetails(modelId, source = 'huggingface') {
    if (source === 'huggingface') {
      try {
        const result = await this.fetch(`https://huggingface.co/api/models/${modelId}`);
        return {
          ...result.data,
          source: 'huggingface',
          url: `https://huggingface.co/${modelId}`,
          cardData: result.data?.cardData,
          safetensors: result.data?.safetensors,
          siblings: result.data?.siblings
        };
      } catch (e) {
        return null;
      }
    }
    return null;
  }
}

// ============================================================
// Express-like API Server (standalone)
// ============================================================
if (require.main === module) {
  const browser = new AIModelBrowser();
  const PORT = process.env.AI_MODEL_BROWSER_PORT || 3456;
  
  const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    const url = new URL(req.url, `http://localhost:${PORT}`);
    
    try {
      if (url.pathname === '/api/search') {
        const query = url.searchParams.get('q') || '';
        const sources = (url.searchParams.get('sources') || 'huggingface,ollama,civitai,github').split(',');
        const category = url.searchParams.get('category') || 'all';
        const sort = url.searchParams.get('sort') || 'downloads';
        const limit = parseInt(url.searchParams.get('limit') || '30');
        
        const results = await browser.search(query, { sources, category, sort, limit });
        res.writeHead(200);
        res.end(JSON.stringify({ query, category, count: results.length, results }));
        
      } else if (url.pathname === '/api/categories') {
        res.writeHead(200);
        res.end(JSON.stringify(browser.categories));
        
      } else if (url.pathname === '/api/providers') {
        res.writeHead(200);
        res.end(JSON.stringify(browser.providers));
        
      } else if (url.pathname === '/api/ollama/models') {
        const models = await browser.searchOllama();
        res.writeHead(200);
        res.end(JSON.stringify({ count: models.length, models }));
        
      } else if (url.pathname === '/api/civitai/search') {
        const query = url.searchParams.get('q') || '';
        const types = url.searchParams.get('types') || '';
        const models = await browser.searchCivitAI(query, { types });
        res.writeHead(200);
        res.end(JSON.stringify({ count: models.length, models }));
        
      } else if (url.pathname === '/api/huggingface/search') {
        const query = url.searchParams.get('q') || '';
        const models = await browser.searchHuggingFace(query);
        res.writeHead(200);
        res.end(JSON.stringify({ count: models.length, models }));
        
      } else if (url.pathname === '/api/model/details') {
        const modelId = url.searchParams.get('id');
        const source = url.searchParams.get('source') || 'huggingface';
        const details = await browser.getModelDetails(modelId, source);
        res.writeHead(200);
        res.end(JSON.stringify(details));
        
      } else if (url.pathname === '/api/health') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ok', providers: Object.keys(browser.providers) }));
        
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
  });
  
  server.listen(PORT, () => {
    console.log(`🔍 AI Model Browser running on http://localhost:${PORT}`);
    console.log(`   Search: http://localhost:${PORT}/api/search?q=qwen3`);
    console.log(`   Categories: http://localhost:${PORT}/api/categories`);
    console.log(`   Ollama: http://localhost:${PORT}/api/ollama/models`);
    console.log(`   CivitAI: http://localhost:${PORT}/api/civitai/search?q=flux`);
  });
}

module.exports = AIModelBrowser;
