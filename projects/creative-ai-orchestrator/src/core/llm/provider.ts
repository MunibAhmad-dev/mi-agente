// ============================================================================
// LLM Provider Abstraction
// ============================================================================
// Supports OpenAI, Anthropic, Google, xAI, DeepSeek, OpenRouter, local models.
// Uses the existing router pattern — small/medium/large model routing.
// ============================================================================

import type {
  LLMProvider,
  LLMCapabilities,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMMessage,
  CaioConfig,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// OpenAI Provider
// ---------------------------------------------------------------------------

export class OpenAIProvider implements LLMProvider {
  readonly id = "openai";
  readonly name = "OpenAI";
  readonly capabilities: LLMCapabilities = {
    maxTokens: 128000,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    costPer1kInputTokens: 0.005,
    costPer1kOutputTokens: 0.015,
    contextWindow: 128000,
  };

  constructor(private apiKey: string) {}

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const body = {
      model: "gpt-4o",
      messages: request.messages.map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : m.content,
      })),
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
      tools: request.tools?.map((t) => ({
        type: "function",
        function: t.function,
      })),
      tool_choice: request.toolChoice,
    };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as any;
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content ?? "",
      toolCalls: choice?.message?.tool_calls?.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      })),
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      model: data.model,
      provider: this.id,
    };
  }

  estimateTokens(text: string): number {
    // Rough estimate: ~4 chars per token for English
    return Math.ceil(text.length / 4);
  }
}

// ---------------------------------------------------------------------------
// Anthropic Provider
// ---------------------------------------------------------------------------

export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic";
  readonly capabilities: LLMCapabilities = {
    maxTokens: 200000,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    costPer1kInputTokens: 0.003,
    costPer1kOutputTokens: 0.015,
    contextWindow: 200000,
  };

  constructor(private apiKey: string) {}

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    // Separate system message from others
    const systemMsg = request.messages.find((m) => m.role === "system");
    const otherMsgs = request.messages.filter((m) => m.role !== "system");

    const body: Record<string, unknown> = {
      model: "claude-sonnet-4-20250514",
      max_tokens: request.maxTokens ?? 4096,
      messages: otherMsgs.map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : m.content,
      })),
    };

    if (systemMsg) {
      body.system = typeof systemMsg.content === "string" ? systemMsg.content : JSON.stringify(systemMsg.content);
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as any;

    // Extract content
    let content = "";
    const toolCalls = [];
    for (const block of data.content || []) {
      if (block.type === "text") {
        content += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input,
        });
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
        totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
      model: data.model,
      provider: this.id,
    };
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }
}

// ---------------------------------------------------------------------------
// Local LLM Provider (Ollama / compatible)
// ---------------------------------------------------------------------------

export class LocalLLMProvider implements LLMProvider {
  readonly id = "local";
  readonly name: string;
  readonly capabilities: LLMCapabilities = {
    maxTokens: 32768,
    supportsVision: false,
    supportsFunctionCalling: false,
    supportsStreaming: false,
    contextWindow: 32768,
  };

  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl;
    this.model = model;
    this.name = `Local (${model})`;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const body = {
      model: this.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      })),
      stream: false,
    };

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Local LLM error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as any;

    return {
      content: data.message?.content ?? "",
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
      model: this.model,
      provider: this.id,
    };
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

// ---------------------------------------------------------------------------
// Provider Manager — selects the best available provider
// ---------------------------------------------------------------------------

export interface ModelRoute {
  task: "simple" | "normal" | "complex" | "vision";
  provider: LLMProvider;
  model?: string;
}

export class LLMProviderManager {
  private providers: LLMProvider[] = [];

  constructor(config: CaioConfig) {
    // Register providers in preference order
    if (config.openaiApiKey) {
      this.providers.push(new OpenAIProvider(config.openaiApiKey));
    }
    if (config.anthropicApiKey) {
      this.providers.push(new AnthropicProvider(config.anthropicApiKey));
    }
    // Local LLM as fallback
    if (config.localLlmUrl) {
      this.providers.push(new LocalLLMProvider(config.localLlmUrl, config.localLlmModel));
    }
  }

  getAvailableProviders(): LLMProvider[] {
    return this.providers;
  }

  /**
   * Route to the best provider for a given task complexity.
   */
  async selectProvider(
    task: "simple" | "normal" | "complex" | "vision"
  ): Promise<LLMProvider | null> {
    // For complex tasks, prefer strong providers
    if (task === "complex" || task === "vision") {
      // Prefer OpenAI or Anthropic for complex/vision
      for (const p of this.providers) {
        if (p.capabilities.supportsVision && task === "vision") return p;
        if (p.id === "openai" || p.id === "anthropic") return p;
      }
    }

    // For simple tasks, local is fine
    if (task === "simple") {
      const local = this.providers.find((p) => p.id === "local");
      if (local && await local.isAvailable()) return local;
    }

    // Fallback: first available provider
    for (const p of this.providers) {
      if (await p.isAvailable()) return p;
    }

    return null;
  }

  /**
   * Complete a request using the best available provider for the task.
   */
  async complete(
    request: LLMCompletionRequest,
    task: "simple" | "normal" | "complex" | "vision" = "normal"
  ): Promise<LLMCompletionResponse> {
    const provider = await this.selectProvider(task);
    if (!provider) {
      throw new Error("No LLM provider available. Configure an API key or local LLM.");
    }
    return provider.complete(request);
  }

  /**
   * Get provider status for health checks.
   */
  async getProviderStatus(): Promise<Array<{ id: string; name: string; available: boolean }>> {
    return Promise.all(
      this.providers.map(async (p) => ({
        id: p.id,
        name: p.name,
        available: await p.isAvailable(),
      }))
    );
  }
}
