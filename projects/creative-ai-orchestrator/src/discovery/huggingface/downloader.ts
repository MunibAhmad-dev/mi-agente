// ============================================================================
// HuggingFace Model Downloader
// ============================================================================
// Downloads models from HuggingFace Hub with progress tracking and resume.
// Uses the HuggingFace Hub API directly (no Python dependency).
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import type { CaioDatabase } from "../../core/database/index.js";
import type { ModelId } from "../../core/types/index.js";
import { newId } from "../../core/types/index.js";

export interface DownloadProgress {
  fileName: string;
  downloadedBytes: number;
  totalBytes: number;
  percentage: number;
  speed: number; // bytes/sec
  eta: number; // seconds
}

export interface DownloadResult {
  success: boolean;
  path: string;
  hash: string;
  sizeBytes: number;
  duration: number;
  error?: string;
}

export class HuggingFaceDownloader {
  private baseUrl = "https://huggingface.co";
  private activeDownloads = new Map<string, AbortController>();

  constructor(
    private db: CaioDatabase,
    private modelsDir: string,
    private token?: string
  ) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }

  /**
   * Download a model file from HuggingFace.
   */
  async downloadModel(
    modelId: string,
    fileName: string,
    targetDir?: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<DownloadResult> {
    const start = Date.now();
    const downloadId = newId();
    const controller = new AbortController();
    this.activeDownloads.set(downloadId, controller);

    try {
      // Build download URL
      const url = `${this.baseUrl}/${modelId}/resolve/main/${fileName}`;
      const saveDir = targetDir || path.join(this.modelsDir, modelId);
      fs.mkdirSync(saveDir, { recursive: true });
      const savePath = path.join(saveDir, fileName);

      // Check for partial download (resume support)
      let downloadedBytes = 0;
      if (fs.existsSync(savePath)) {
        const stat = fs.statSync(savePath);
        downloadedBytes = stat.size;
      }

      // Fetch with Range header for resume
      const headers: Record<string, string> = {};
      if (this.token) {
        headers.Authorization = `Bearer ${this.token}`;
      }
      if (downloadedBytes > 0) {
        headers.Range = `bytes=${downloadedBytes}-`;
      }

      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      if (!response.ok && response.status !== 206) {
        throw new Error(`HuggingFace download failed: ${response.status} ${response.statusText}`);
      }

      const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
      const totalBytes = downloadedBytes + contentLength;
      const isResume = response.status === 206;

      if (!response.body) {
        throw new Error("No response body");
      }

      // Stream to file
      const fileStream = createWriteStream(savePath, { flags: isResume ? "a" : "w" });
      const reader = response.body.getReader();
      let receivedBytes = downloadedBytes;
      const startTime = Date.now();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        fileStream.write(Buffer.from(value));
        receivedBytes += value.length;

        // Report progress
        if (onProgress) {
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = elapsed > 0 ? (receivedBytes - downloadedBytes) / elapsed : 0;
          const remaining = totalBytes - receivedBytes;
          const eta = speed > 0 ? remaining / speed : 0;

          onProgress({
            fileName,
            downloadedBytes: receivedBytes,
            totalBytes,
            percentage: totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : 0,
            speed: Math.round(speed),
            eta: Math.round(eta),
          });
        }
      }

      fileStream.end();

      // Wait for file to finish writing
      await new Promise<void>((resolve, reject) => {
        fileStream.on("finish", resolve);
        fileStream.on("error", reject);
      });

      // Calculate hash
      const hash = this.computeHash(savePath);

      // Store in database
      this.db.run(
        `INSERT OR REPLACE INTO models (id, name, type, source_provider, source_url, size_bytes, hash, installed, installed_path, installed_hash)
         VALUES (?, ?, 'checkpoint', 'huggingface', ?, ?, ?, 1, ?, ?)`,
        newId(),
        `${modelId}/${fileName}`,
        url,
        totalBytes,
        hash,
        savePath,
        hash
      );

      this.activeDownloads.delete(downloadId);

      return {
        success: true,
        path: savePath,
        hash,
        sizeBytes: totalBytes,
        duration: Date.now() - start,
      };
    } catch (err: any) {
      this.activeDownloads.delete(downloadId);
      return {
        success: false,
        path: "",
        hash: "",
        sizeBytes: 0,
        duration: Date.now() - start,
        error: err.message,
      };
    }
  }

  /**
   * List files in a HuggingFace model repo.
   */
  async listModelFiles(modelId: string): Promise<Array<{ path: string; size: number }>> {
    const url = `${this.baseUrl}/api/models/${modelId}`;
    const headers: Record<string, string> = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Failed to list model files: ${res.status}`);

    const data = await res.json() as any;
    return (data.siblings || []).map((s: any) => ({
      path: s.rfilename,
      size: s.size || 0,
    }));
  }

  /**
   * Get model file size estimate.
   */
  async getModelSize(modelId: string): Promise<number> {
    const files = await this.listModelFiles(modelId);
    return files.reduce((sum, f) => sum + f.size, 0);
  }

  /**
   * Cancel an active download.
   */
  cancelDownload(downloadId: string): boolean {
    const controller = this.activeDownloads.get(downloadId);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(downloadId);
      return true;
    }
    return false;
  }

  /**
   * Check if a model is already downloaded.
   */
  isDownloaded(modelId: string): boolean {
    const modelDir = path.join(this.modelsDir, modelId);
    return fs.existsSync(modelDir);
  }

  private computeHash(filePath: string): string {
    const data = fs.readFileSync(filePath);
    return createHash("sha256").update(data).digest("hex").slice(0, 16);
  }
}
