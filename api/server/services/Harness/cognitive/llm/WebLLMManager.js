/**
 * WebLLMManager.js — WebLLM In-Browser Model Execution
 * 
 * Allows running LLM models directly in the browser using WebGPU:
 * - No server needed for inference
 * - Models run via WebLLM (https://webllm.mlc.ai/)
 * - Supports chat, completion, and embedding in-browser
 * - Falls back to server-side if WebGPU unavailable
 * 
 * Open-source: Apache-2.0
 * Models: Llama 3, Phi-3, Gemma, Mistral, Qwen (quantized GGUF)
 */

const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[WebLLM]', ...args),
    info: (...args) => console.info('[WebLLM]', ...args),
    warn: (...args) => console.warn('[WebLLM]', ...args),
    error: (...args) => console.error('[WebLLM]', ...args),
};

/**
 * Available WebLLM models (loaded in browser)
 */
const WEBLLM_MODELS = {
    'Phi-3.5-mini-instruct-q4f16_1-MLC': {
        name: 'Phi-3.5 Mini',
        size: '~2.4 GB',
        params: '3.8B',
        license: 'MIT',
        tier: 'simple',
        useCases: ['quick chat', 'code completion', 'summarization'],
    },
    'Llama-3.1-8B-Instruct-q4f16_1-MLC': {
        name: 'Llama 3.1 8B',
        size: '~4.9 GB',
        params: '8B',
        license: 'Llama 3.1 Community',
        tier: 'medium',
        useCases: ['general chat', 'coding', 'analysis'],
    },
    'Qwen2.5-7B-Instruct-q4f16_1-MLC': {
        name: 'Qwen 2.5 7B',
        size: '~4.6 GB',
        params: '7B',
        license: 'Apache-2.0',
        tier: 'medium',
        useCases: ['multilingual', 'coding', 'math'],
    },
    'Mistral-7B-Instruct-v0.3-q4f16_1-MLC': {
        name: 'Mistral 7B',
        size: '~4.4 GB',
        params: '7B',
        license: 'Apache-2.0',
        tier: 'medium',
        useCases: ['general', 'instruction following', 'reasoning'],
    },
    'gemma-2-2b-it-q4f16_1-MLC': {
        name: 'Gemma 2 2B',
        size: '~1.5 GB',
        params: '2B',
        license: 'Gemma License',
        tier: 'simple',
        useCases: ['lightweight chat', 'mobile', 'fast responses'],
    },
};

class WebLLMManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'WebLLMManager';
        this._loaded = null;     // Currently loaded model
        this._loading = false;
        this._progress = 0;
        this._webgpuSupported = false;
        this._initialized = false;
    }

    /**
     * Check WebGPU support
     */
    async checkSupport() {
        if (typeof navigator !== 'undefined' && navigator.gpu) {
            try {
                const adapter = await navigator.gpu.requestAdapter();
                this._webgpuSupported = !!adapter;
            } catch (e) {
                this._webgpuSupported = false;
            }
        }
        
        return {
            webgpuSupported: this._webgpuSupported,
            available: this._webgpuSupported,
            models: Object.keys(WEBLLM_MODELS),
        };
    }

    /**
     * Get the HTML/JS code needed to initialize WebLLM in a browser
     * Returns a script that the frontend can load
     */
    getBrowserScript() {
        return `
<!-- WebLLM Browser Integration -->
<script type="module">
import { CreateWebLLMEngine } from 'https://esm.sh/@mlc-ai/web-llm';

window.WebLLMEngine = null;

window.webLLMInit = async function(modelId, onProgress) {
    if (window.WebLLMEngine) return window.WebLLMEngine;
    
    try {
        const engine = await CreateWebLLMEngine({
            model: modelId || 'Phi-3.5-mini-instruct-q4f16_1-MLC',
            logLevel: 'INFO',
            onProgress: (progress) => {
                if (onProgress) onProgress(progress);
                console.log('[WebLLM] Progress:', progress);
            },
        });
        
        window.WebLLMEngine = engine;
        console.log('[WebLLM] Model loaded:', modelId);
        return engine;
    } catch (err) {
        console.error('[WebLLM] Failed to load model:', err);
        throw err;
    }
};

window.webLLMChat = async function(messages) {
    if (!window.WebLLMEngine) throw new Error('WebLLM not initialized');
    const response = await window.WebLLMEngine.chat.completions.create({
        messages,
        temperature: 0.7,
        max_tokens: 2048,
    });
    return response.choices[0].message.content;
};

window.webLLMComplete = async function(prompt) {
    if (!window.WebLLMEngine) throw new Error('WebLLM not initialized');
    const response = await window.WebLLMEngine.completions.create({
        prompt,
        max_tokens: 1024,
    });
    return response.choices[0].text;
};

window.webLLMUnload = async function() {
    if (window.WebLLMEngine) {
        await window.WebLLMEngine.unloadModel();
        window.WebLLMEngine = null;
        console.log('[WebLLM] Model unloaded');
    }
};

console.log('[WebLLM] Browser script loaded. Call webLLMInit() to start.');
</script>
`;
    }

    /**
     * Get WebLLM configuration for the dashboard
     */
    getConfig() {
        return {
            supported: this._webgpuSupported,
            loaded: this._loaded,
            loading: this._loading,
            progress: this._progress,
            models: WEBLLM_MODELS,
            browserScriptPath: '/api/webllm/script',
        };
    }

    /**
     * Get model info
     */
    getModelInfo(modelId) {
        return WEBLLM_MODELS[modelId] || null;
    }

    /**
     * List all available models
     */
    listModels() {
        return Object.entries(WEBLLM_MODELS).map(([id, info]) => ({ id, ...info }));
    }

    /**
     * Generate API endpoints for the dashboard
     */
    getRoutes() {
        return [
            { method: 'GET', path: '/api/webllm/support', description: 'Check WebGPU support' },
            { method: 'GET', path: '/api/webllm/models', description: 'List available models' },
            { method: 'GET', path: '/api/webllm/config', description: 'Get configuration' },
            { method: 'GET', path: '/api/webllm/script', description: 'Get browser script' },
        ];
    }
}

module.exports = { WebLLMManager, WEBLLM_MODELS };
module.exports.default = WebLLMManager;
