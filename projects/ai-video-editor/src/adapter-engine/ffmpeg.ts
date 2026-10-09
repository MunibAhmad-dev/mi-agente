/**
 * AI Creative OS - FFmpeg Adapter
 * 
 * Fully functional adapter for FFmpeg — the fundamental audiovisual engine.
 * Used for: encoding, decoding, cuts, muxing, filters, audio, batch, stitching.
 * License: LGPL 2.1+ (with optional GPL components based on build config).
 */

import { BaseAdapter, type AutomationMethod } from "./base.js";
import type { AdapterCapability, AdapterResult, FilePath, Duration } from "../types/index.js";
import { execCommand } from "../core/index.js";

export class FFmpegAdapter extends BaseAdapter {
  readonly version = "1.0.0";
  readonly executableName = "ffmpeg";

  private _capabilities: AdapterCapability[] = [
    { name: "encoding", supported: true, quality: 95, speed: 98 },
    { name: "decoding", supported: true, quality: 95, speed: 98 },
    { name: "muxing", supported: true, quality: 100, speed: 100 },
    { name: "filtering", supported: true, quality: 90, speed: 95 },
    { name: "audio_processing", supported: true, quality: 88, speed: 95 },
    { name: "video_cuts", supported: true, quality: 90, speed: 95 },
    { name: "transcoding", supported: true, quality: 92, speed: 95 },
    { name: "hardware_acceleration", supported: true, quality: 90, speed: 99 },
    { name: "streaming", supported: true, quality: 85, speed: 90 },
    { name: "thumbnail_extraction", supported: true, quality: 80, speed: 95 },
    { name: "subtitle_rendering", supported: true, quality: 80, speed: 85 },
    { name: "concatenation", supported: true, quality: 95, speed: 98 },
    { name: "color_correction", supported: true, quality: 80, speed: 90 },
    { name: "scaling", supported: true, quality: 85, speed: 95 },
    { name: "frame_extraction", supported: true, quality: 90, speed: 95 },
  ];

  async detect(): Promise<boolean> {
    const result = await this.executeCommand("ffmpeg -version");
    if (result.success && result.data) {
      this._installed = true;
      this._version = this.extractVersion(result.data);
      this.logger.info(`FFmpeg detected: v${this._version}`);
      return true;
    }
    this._installed = false;
    return false;
  }

  getCapabilities(): AdapterCapability[] {
    return this._capabilities;
  }

  getAutomationMethods(): AutomationMethod[] {
    return ["cli"];
  }

  // ─── Operations ─────────────────────────────────────────────────────

  /**
   * Get media file information.
   */
  async probe(filePath: FilePath): Promise<AdapterResult<MediaInfo>> {
    const result = await this.executeCommand(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
    );
    if (!result.success || !result.data) {
      return { success: false, error: result.error, duration: result.duration, provider: result.provider } as AdapterResult<MediaInfo>;
    }
    try {
      const info = JSON.parse(result.data) as MediaInfo;
      return { success: true, data: info, duration: result.duration, provider: result.provider };
    } catch {
      return { success: false, error: "Failed to parse probe output", duration: result.duration, provider: result.provider };
    }
  }

  /**
   * Extract a clip from a video.
   */
  async extractClip(
    input: FilePath,
    output: FilePath,
    start: number,
    duration: number,
    options: { codec?: string; format?: string } = {},
  ): Promise<AdapterResult<string>> {
    const codec = options.codec ?? "copy";
    const cmd = `ffmpeg -y -ss ${start} -i "${input}" -t ${duration} -c:v ${codec} -c:a copy "${output}"`;
    return this.executeWithRetry(cmd, { timeout: 120000 });
  }

  /**
   * Transcode a video.
   */
  async transcode(
    input: FilePath,
    output: FilePath,
    options: {
      videoCodec?: string;
      audioCodec?: string;
      resolution?: string;
      bitrate?: string;
      fps?: number;
      format?: string;
    } = {},
  ): Promise<AdapterResult<string>> {
    const args = ["-y", "-i", `"${input}"`];
    if (options.videoCodec) args.push("-c:v", options.videoCodec);
    else args.push("-c:v", "libx264");
    if (options.audioCodec) args.push("-c:a", options.audioCodec);
    else args.push("-c:a", "aac");
    if (options.resolution) args.push("-s", options.resolution);
    if (options.bitrate) args.push("-b:v", options.bitrate);
    if (options.fps) args.push("-r", String(options.fps));
    args.push(`"${output}"`);
    return this.executeWithRetry(`ffmpeg ${args.join(" ")}`, { timeout: 300000 });
  }

  /**
   * Extract audio from video.
   */
  async extractAudio(
    input: FilePath,
    output: FilePath,
    options: { codec?: string; sampleRate?: number } = {},
  ): Promise<AdapterResult<string>> {
    const codec = options.codec ?? "aac";
    const args = ["-y", "-i", `"${input}"`, "-vn", "-c:a", codec];
    if (options.sampleRate) args.push("-ar", String(options.sampleRate));
    args.push(`"${output}"`);
    return this.executeWithRetry(args.join(" "), { timeout: 120000 });
  }

  /**
   * Concatenate multiple video files.
   */
  async concatenate(
    inputs: FilePath[],
    output: FilePath,
    options: { method?: "concat" | "filter" } = {},
  ): Promise<AdapterResult<string>> {
    if (options.method === "filter") {
      const inputArgs = inputs.map((i) => `-i "${i}"`).join(" ");
      const filterArgs = inputs.map((_, i) => `[${i}:v:0][${i}:a:0]`).join("");
      const cmd = `ffmpeg -y ${inputArgs} ${filterArgs}concat=n=${inputs.length}:v=1:a=1[outv][outa] -map "[outv]" -map "[outa]" "${output}"`;
      return this.executeWithRetry(cmd, { timeout: 300000 });
    }

    // concat demuxer
    const { writeFileSync, unlinkSync } = await import("node:fs");
    const listFile = output + ".list.txt";
    const listContent = inputs.map((i) => `file '${i.replace(/'/g, "'\\''")}'`).join("\n");
    writeFileSync(listFile, listContent);
    try {
      const cmd = `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${output}"`;
      return this.executeWithRetry(cmd, { timeout: 300000 });
    } finally {
      try { unlinkSync(listFile); } catch {}
    }
  }

  /**
   * Apply a video filter.
   */
  async applyFilter(
    input: FilePath,
    output: FilePath,
    filter: string,
  ): Promise<AdapterResult<string>> {
    const cmd = `ffmpeg -y -i "${input}" -vf "${filter}" -c:a copy "${output}"`;
    return this.executeWithRetry(cmd, { timeout: 300000 });
  }

  /**
   * Generate a thumbnail at a specific timestamp.
   */
  async thumbnail(
    input: FilePath,
    output: FilePath,
    time: number,
    size?: string,
  ): Promise<AdapterResult<string>> {
    const sizeArg = size ? `-vf scale=${size}` : "";
    const cmd = `ffmpeg -y -ss ${time} -i "${input}" -vframes 1 ${sizeArg} "${output}"`;
    return this.executeWithRetry(cmd, { timeout: 30000 });
  }

  /**
   * Get system info about FFmpeg build.
   */
  async getBuildInfo(): Promise<AdapterResult<FFmpegBuildInfo>> {
    const result = await this.executeCommand("ffmpeg -buildconf");
    if (!result.success || !result.data) {
      return { ...result, data: undefined };
    }
    const conf = result.data;
    return {
      ...result,
      data: {
        configuration: conf,
        hasLibx264: conf.includes("--enable-libx264"),
        hasLibx265: conf.includes("--enable-libx265"),
        hasNvenc: conf.includes("--enable-nvenc"),
        hasVAAPI: conf.includes("--enable-vaapi"),
        hasLibfdk_aac: conf.includes("--enable-libfdk-aac"),
        hasOpus: conf.includes("--enable-libopus"),
      },
    };
  }

  /**
   * Render using hardware acceleration if available.
   */
  async hardwareTranscode(
    input: FilePath,
    output: FilePath,
    options: {
      hwAccel?: "nvenc" | "vaapi" | "qsv" | "auto";
      preset?: string;
      crf?: number;
    } = {},
  ): Promise<AdapterResult<string>> {
    const preset = options.preset ?? "medium";
    const crf = options.crf ?? 23;

    let hwArgs = "";
    switch (options.hwAccel) {
      case "nvenc":
        hwArgs = `-c:v h264_nvenc -preset ${preset} -rc constqp -qp ${crf}`;
        break;
      case "vaapi":
        hwArgs = `-vaapi_device /dev/dri/renderD128 -vf format=nv12,hwupload -c:v h264_vaapi`;
        break;
      case "qsv":
        hwArgs = `-c:v h264_qsv -preset ${preset}`;
        break;
      default:
        hwArgs = `-c:v libx264 -preset ${preset} -crf ${crf}`;
    }

    const cmd = `ffmpeg -y -i "${input}" ${hwArgs} -c:a aac "${output}"`;
    return this.executeWithRetry(cmd, { timeout: 600000 });
  }

  private extractVersion(output: string): string {
    const match = output.match(/version\s+([\d.]+)/i) ?? output.match(/([\d]+\.[\d]+[\.\d]*)/);
    return match?.[1] ?? "unknown";
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MediaInfo {
  format?: {
    filename: string;
    duration: string;
    size: string;
    bit_rate: string;
    format_name: string;
    format_long_name: string;
  };
  streams?: Array<{
    index: number;
    codec_name: string;
    codec_type: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    sample_rate?: string;
    channels?: number;
    duration?: string;
  }>;
}

export interface FFmpegBuildInfo {
  configuration: string;
  hasLibx264: boolean;
  hasLibx265: boolean;
  hasNvenc: boolean;
  hasVAAPI: boolean;
  hasLibfdk_aac: boolean;
  hasOpus: boolean;
}
