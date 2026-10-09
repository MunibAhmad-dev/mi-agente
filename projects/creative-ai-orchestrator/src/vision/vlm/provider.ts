// ============================================================================
// VLM Provider Abstraction
// ============================================================================
// Vision-Language Model integration for understanding images.
// Supports: OpenAI GPT-4V, Anthropic Claude, local VLM.
// ============================================================================

export interface VLMProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): Promise<boolean>;
  describeImage(imagePath: string, prompt?: string): Promise<VLMResponse>;
  analyzeImage(imagePath: string): Promise<VLMAnalysis>;
}

export interface VLMResponse {
  content: string;
  provider: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface VLMAnalysis {
  description: string;
  objects: string[];
  style: string;
  quality: string;
  issues: string[];
  suggestions: string[];
}

/**
 * OpenAI GPT-4V Provider
 */
export class OpenAIVLMProvider implements VLMProvider {
  readonly id = "openai-vlm";
  readonly name = "OpenAI GPT-4V";

  constructor(private apiKey: string) {}

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async describeImage(imagePath: string, prompt?: string): Promise<VLMResponse> {
    const fs = await import("node:fs");
    const imageBuffer = fs.readFileSync(imagePath);
    const base64 = imageBuffer.toString("base64");
    const ext = imagePath.split(".").pop()?.toLowerCase() || "png";
    const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt || "Describe this image in detail. What objects do you see? What is the quality? What could be improved?" },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "low" } },
          ],
        }],
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) throw new Error(`OpenAI VLM error: ${res.status}`);
    const data = await res.json() as any;
    return {
      content: data.choices?.[0]?.message?.content || "",
      provider: this.id,
      model: data.model,
      usage: { promptTokens: data.usage?.prompt_tokens || 0, completionTokens: data.usage?.completion_tokens || 0 },
    };
  }

  async analyzeImage(imagePath: string): Promise<VLMAnalysis> {
    const resp = await this.describeImage(imagePath, `Analyze this image and respond in JSON:
{"description":"brief description","objects":["list","of","objects"],"style":"artistic style","quality":"quality assessment","issues":["list","of","issues"],"suggestions":["improvement","suggestions"]}`);
    try {
      const json = JSON.parse(resp.content);
      return {
        description: json.description || resp.content,
        objects: json.objects || [],
        style: json.style || "unknown",
        quality: json.quality || "unknown",
        issues: json.issues || [],
        suggestions: json.suggestions || [],
      };
    } catch {
      return { description: resp.content, objects: [], style: "unknown", quality: "unknown", issues: [], suggestions: [] };
    }
  }
}

/**
 * Anthropic Claude VLM Provider
 */
export class AnthropicVLMProvider implements VLMProvider {
  readonly id = "anthropic-vlm";
  readonly name = "Anthropic Claude";

  constructor(private apiKey: string) {}

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async describeImage(imagePath: string, prompt?: string): Promise<VLMResponse> {
    const fs = await import("node:fs");
    const imageBuffer = fs.readFileSync(imagePath);
    const base64 = imageBuffer.toString("base64");
    const ext = imagePath.split(".").pop()?.toLowerCase() || "png";
    const mediaType = ext === "jpg" ? "image/jpeg" : ext === "webp" ? "image/webp" : `image/png`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: prompt || "Describe this image in detail. What objects do you see? What is the quality? What could be improved?" },
          ],
        }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) throw new Error(`Anthropic VLM error: ${res.status}`);
    const data = await res.json() as any;
    const content = data.content?.[0]?.text || "";
    return {
      content,
      provider: this.id,
      model: data.model,
      usage: { promptTokens: data.usage?.input_tokens || 0, completionTokens: data.usage?.output_tokens || 0 },
    };
  }

  async analyzeImage(imagePath: string): Promise<VLMAnalysis> {
    const resp = await this.describeImage(imagePath, `Analyze this image and respond in JSON:
{"description":"brief description","objects":["list","of","objects"],"style":"artistic style","quality":"quality assessment","issues":["list","of","issues"],"suggestions":["improvement","suggestions"]}`);
    try {
      const json = JSON.parse(resp.content);
      return {
        description: json.description || resp.content,
        objects: json.objects || [],
        style: json.style || "unknown",
        quality: json.quality || "unknown",
        issues: json.issues || [],
        suggestions: json.suggestions || [],
      };
    } catch {
      return { description: resp.content, objects: [], style: "unknown", quality: "unknown", issues: [], suggestions: [] };
    }
  }
}

/**
 * No-op VLM provider when no VLM is configured.
 */
export class NullVLMProvider implements VLMProvider {
  readonly id = "null-vlm";
  readonly name = "No VLM configured";

  async isAvailable(): Promise<boolean> { return false; }
  async describeImage(): Promise<VLMResponse> {
    return { content: "NOT IMPLEMENTED: No VLM provider configured. Set OPENAI_API_KEY or configure a local VLM.", provider: "none", model: "none" };
  }
  async analyzeImage(): Promise<VLMAnalysis> {
    return { description: "NOT IMPLEMENTED", objects: [], style: "unknown", quality: "unknown", issues: ["No VLM configured"], suggestions: ["Configure a VLM provider"] };
  }
}

/**
 * VLM Provider Manager — selects best available provider.
 */
export class VLMProviderManager {
  private providers: VLMProvider[] = [];

  constructor(openaiKey?: string, anthropicKey?: string) {
    if (openaiKey) this.providers.push(new OpenAIVLMProvider(openaiKey));
    if (anthropicKey) this.providers.push(new AnthropicVLMProvider(anthropicKey));
    this.providers.push(new NullVLMProvider());
  }

  async selectProvider(): Promise<VLMProvider> {
    for (const p of this.providers) {
      if (await p.isAvailable()) return p;
    }
    return new NullVLMProvider();
  }

  async describeImage(imagePath: string, prompt?: string): Promise<VLMResponse> {
    const provider = await this.selectProvider();
    return provider.describeImage(imagePath, prompt);
  }

  async analyzeImage(imagePath: string): Promise<VLMAnalysis> {
    const provider = await this.selectProvider();
    return provider.analyzeImage(imagePath);
  }
}
