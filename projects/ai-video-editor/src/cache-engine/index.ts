/**
 * AI Creative OS - Cache Engine
 * Model cache, frame cache, asset cache, embedding cache, render cache, analysis cache.
 * §90 of spec: implement caching to avoid recomputation.
 */

import type { UniqueId, Bytes } from "../types/index.js";
import { Logger, fileHash } from "../core/index.js";
import { createHash } from "node:crypto";

interface CacheEntry<T = unknown> {
  key: string;
  data: T;
  size: Bytes;
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  ttl?: number; // ms, undefined = infinite
}

export class CacheEngine {
  private logger = new Logger("Cache");
  private caches = new Map<string, Map<string, CacheEntry>>();
  private maxSize: Bytes;
  private hits = 0;
  private misses = 0;

  constructor(maxSizeBytes: Bytes = 2 * 1024 * 1024 * 1024) { // 2GB default
    this.maxSize = maxSizeBytes;
  }

  // ─── Generic Cache Operations ───────────────────────────────────────

  get<T>(namespace: string, key: string): T | undefined {
    const store = this.getStore(namespace);
    const entry = store.get(key);
    if (!entry) { this.misses++; return undefined; }
    if (entry.ttl && Date.now() - entry.createdAt > entry.ttl) {
      store.delete(key); this.misses++; return undefined;
    }
    entry.lastAccessed = Date.now();
    entry.accessCount++;
    this.hits++;
    return entry.data as T;
  }

  set<T>(namespace: string, key: string, data: T, ttl?: number, sizeBytes?: Bytes): void {
    const store = this.getStore(namespace);
    const size = sizeBytes ?? this.estimateSize(data);
    // Evict if over capacity
    while (this.getTotalSize() + size > this.maxSize) {
      this.evictLRU(namespace);
    }
    store.set(key, { key, data, size, createdAt: Date.now(), lastAccessed: Date.now(), accessCount: 1, ttl });
  }

  has(namespace: string, key: string): boolean {
    return this.getStore(namespace).has(key);
  }

  invalidate(namespace: string, key?: string): void {
    if (key) this.getStore(namespace).delete(key);
    else this.caches.delete(namespace);
  }

  // ─── Typed Cache Helpers ────────────────────────────────────────────

  cacheFrame(videoPath: string, frameTime: number, frameBuffer: Buffer): void {
    const key = `${videoPath}:${frameTime}`;
    this.set("frames", key, frameBuffer, 3600000, frameBuffer.length); // 1hr TTL
  }

  getCachedFrame(videoPath: string, frameTime: number): Buffer | undefined {
    return this.get<Buffer>("frames", `${videoPath}:${frameTime}`);
  }

  cacheEmbedding(contentHash: string, embedding: number[]): void {
    this.set("embeddings", contentHash, embedding, undefined, embedding.length * 8);
  }

  getCachedEmbedding(contentHash: string): number[] | undefined {
    return this.get<number[]>("embeddings", contentHash);
  }

  cacheModel(modelId: string, data: unknown, sizeBytes: Bytes): void {
    this.set("models", modelId, data, undefined, sizeBytes);
  }

  cacheAnalysis(filePath: string, result: unknown): void {
    const hash = createHash("md5").update(filePath).digest("hex");
    this.set("analysis", hash, result, 86400000); // 24hr TTL
  }

  getCachedAnalysis(filePath: string): unknown | undefined {
    const hash = createHash("md5").update(filePath).digest("hex");
    return this.get("analysis", hash);
  }

  cacheRender(params: string, outputPath: string): void {
    this.set("renders", params, outputPath, 86400000);
  }

  getCachedRender(params: string): string | undefined {
    return this.get<string>("renders", params);
  }

  cacheAsset(assetId: string, metadata: unknown): void {
    this.set("assets", assetId, metadata);
  }

  // ─── Stats ──────────────────────────────────────────────────────────

  getStats(): { hits: number; misses: number; hitRate: number; totalEntries: number; totalSize: Bytes; byNamespace: Record<string, { entries: number; size: Bytes }> } {
    let totalEntries = 0;
    let totalSize = 0;
    const byNamespace: Record<string, { entries: number; size: Bytes }> = {};
    for (const [ns, store] of this.caches) {
      let nsSize = 0;
      for (const entry of store.values()) nsSize += entry.size;
      byNamespace[ns] = { entries: store.size, size: nsSize };
      totalEntries += store.size;
      totalSize += nsSize;
    }
    return {
      hits: this.hits, misses: this.misses,
      hitRate: this.hits + this.misses > 0 ? Math.round(this.hits / (this.hits + this.misses) * 100) : 0,
      totalEntries, totalSize, byNamespace,
    };
  }

  clear(): void { this.caches.clear(); this.hits = 0; this.misses = 0; }

  // ─── Internal ───────────────────────────────────────────────────────

  private getStore(namespace: string): Map<string, CacheEntry> {
    if (!this.caches.has(namespace)) this.caches.set(namespace, new Map());
    return this.caches.get(namespace)!;
  }

  private getTotalSize(): Bytes {
    let total = 0;
    for (const store of this.caches.values()) {
      for (const entry of store.values()) total += entry.size;
    }
    return total;
  }

  private evictLRU(namespace: string): void {
    const store = this.caches.get(namespace);
    if (!store || store.size === 0) return;
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of store) {
      if (entry.lastAccessed < oldestTime) { oldestTime = entry.lastAccessed; oldest = key; }
    }
    if (oldest) store.delete(oldest);
  }

  private estimateSize(data: unknown): Bytes {
    if (Buffer.isBuffer(data)) return data.length;
    if (typeof data === "string") return data.length * 2;
    if (typeof data === "object") return JSON.stringify(data).length * 2;
    return 64;
  }
}
