'use strict';

/**
 * Known free-tier / open LLM providers.
 * Each entry describes:
 *   - modelsUrl   : OpenAI-compatible GET /models endpoint
 *   - chatUrl     : base URL for chat completions
 *   - envKey      : env var that holds the API key (may be absent for keyless providers)
 *   - requiresKey : false = can probe without a key (Ollama, LM Studio, etc.)
 *   - knownModels : fallback list when the /models endpoint is unreachable
 *   - signupUrl   : where to get a free key
 *   - label       : display name
 */
const FREE_PROVIDERS = [
  {
    id: 'litellm',
    label: 'LiteLLM (multi-provider gateway)',
    chatUrl: process.env.LITELLM_BASE_URL || 'http://localhost:4000',
    modelsUrl: `${process.env.LITELLM_BASE_URL || 'http://localhost:4000'}/v1/models`,
    requiresKey: false,
    signupUrl: 'https://github.com/BerriAI/litellm',
    knownModels: ['ollama/llama3.2', 'groq/llama-3.3-70b-versatile', 'groq/llama-3.1-8b-instant'],
    description: 'Runs 100+ models through one OpenAI-compatible endpoint. Includes Ollama, Groq, OpenRouter, Together.',
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    chatUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    modelsUrl: `${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/api/tags`,
    ollamaFormat: true,
    requiresKey: false,
    signupUrl: 'https://ollama.com',
    knownModels: ['llama3.2', 'mistral', 'gemma2', 'phi3', 'qwen2.5-coder'],
  },
  {
    id: 'groq',
    label: 'Groq (free tier)',
    chatUrl: 'https://api.groq.com/openai/v1',
    modelsUrl: 'https://api.groq.com/openai/v1/models',
    envKey: 'GROQ_API_KEY',
    requiresKey: true,
    signupUrl: 'https://console.groq.com',
    knownModels: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
      'gemma2-9b-it',
      'llama3-70b-8192',
      'llama3-8b-8192',
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (free models)',
    chatUrl: 'https://openrouter.ai/api/v1',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    envKey: 'OPENROUTER_API_KEY',
    requiresKey: true,
    signupUrl: 'https://openrouter.ai',
    filterFree: true,
    knownModels: [
      'meta-llama/llama-3.2-3b-instruct:free',
      'meta-llama/llama-3.1-8b-instruct:free',
      'mistralai/mistral-7b-instruct:free',
      'google/gemma-2-9b-it:free',
      'qwen/qwen-2-7b-instruct:free',
      'microsoft/phi-3-mini-128k-instruct:free',
    ],
  },
  {
    id: 'together',
    label: 'Together.ai (free credits)',
    chatUrl: 'https://api.together.xyz/v1',
    modelsUrl: 'https://api.together.xyz/v1/models',
    envKey: 'TOGETHER_API_KEY',
    requiresKey: true,
    signupUrl: 'https://api.together.ai',
    knownModels: [
      'meta-llama/Llama-3.2-3B-Instruct-Turbo',
      'meta-llama/Llama-3.1-8B-Instruct-Turbo',
      'mistralai/Mistral-7B-Instruct-v0.3',
      'Qwen/Qwen2.5-7B-Instruct-Turbo',
    ],
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (local)',
    chatUrl: 'http://localhost:1234/v1',
    modelsUrl: 'http://localhost:1234/v1/models',
    requiresKey: false,
    signupUrl: 'https://lmstudio.ai',
    knownModels: [],
  },
];

module.exports = { FREE_PROVIDERS };
