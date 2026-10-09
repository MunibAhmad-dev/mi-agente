/**
 * AI Creative OS - Domain Engines
 * Each engine manages a specific creative domain through provider adapters.
 */

import type { UniqueId, Bytes, Score, Duration } from "../types/index.js";
import { Logger, EventBus, execCommand } from "../core/index.js";
import type { AdapterRegistry } from "../adapter-engine/index.js";
import type { ProviderRouter } from "../provider-engine/index.js";

// ─── Base Domain Engine ──────────────────────────────────────────────────────

export abstract class DomainEngine {
  abstract readonly name: string;
  protected logger: Logger;
  protected eventBus: EventBus;
  protected adapters: AdapterRegistry;
  protected router: ProviderRouter;

  constructor(name: string, eventBus: EventBus, adapters: AdapterRegistry, router: ProviderRouter) {
    this.logger = new Logger(`Engine:${name}`);
    this.eventBus = eventBus;
    this.adapters = adapters;
    this.router = router;
  }

  /**
   * Find the best provider for a given capability in this domain.
   */
  findBestProvider(capabilityId: UniqueId) {
    const providers = this.adapters.getInstalled().map((a) => ({
      id: a.id, name: a.name, version: a.version ?? "0.0.0",
      source: [] as any[], license: { softwareLicense: "unknown" as any, softwareLicenseScope: "unknown" as any, commercialUse: true, redistribution: false, modification: false },
      capabilities: a.getCapabilities().map((c) => `cap.${c.name}`),
      installation: { installed: a.isInstalled, autoInstallable: false },
      hardware: {},
      quality: a.getCapabilities()[0]?.quality ?? 50,
      speed: a.getCapabilities()[0]?.speed ?? 50,
      automationScore: 80,
      stability: 85,
      maintenanceScore: 80,
      fallbacks: [],
      dependencies: [],
      status: (a.isInstalled ? "available" : "missing") as any,
      health: (a.isInstalled ? "healthy" : "missing") as any,
    }));
    return this.router.route(capabilityId, providers as any);
  }
}

// ─── Audio Engine ────────────────────────────────────────────────────────────

export class AudioEngine extends DomainEngine {
  readonly name = "Audio";

  async extractAudio(input: string, output: string, options: { codec?: string; sampleRate?: number } = {}): Promise<{ success: boolean; error?: string }> {
    const ffmpeg = this.adapters.getByName("FFmpeg") as any;
    if (ffmpeg?.isInstalled) {
      return ffmpeg.extractAudio(input, output, options);
    }
    return { success: false, error: "No audio adapter available" };
  }

  async transcribe(audioPath: string, options: { language?: string; model?: string } = {}): Promise<{ success: boolean; segments?: { start: number; end: number; text: string }[]; error?: string }> {
    const whisper = this.adapters.getByName("Whisper") as any;
    if (whisper?.isInstalled) {
      return whisper.transcribe(audioPath, options);
    }
    return { success: false, error: "No speech-to-text adapter available" };
  }

  async detectSilence(audioPath: string): Promise<{ start: number; end: number }[]> {
    const result = execCommand(
      `ffmpeg -i "${audioPath}" -af "silencedetect=noise=-30dB:d=0.5" -f null - 2>&1 | grep silence_`,
      { timeout: 30000 },
    );
    const silences: { start: number; end: number }[] = [];
    const starts = [...result.stdout.matchAll(/silence_start: ([\d.]+)/g)].map((m) => parseFloat(m[1]));
    const ends = [...result.stdout.matchAll(/silence_end: ([\d.]+)/g)].map((m) => parseFloat(m[1]));
    for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
      silences.push({ start: starts[i], end: ends[i] });
    }
    return silences;
  }

  async getAudioInfo(path: string): Promise<{ duration: number; sampleRate: number; channels: number } | null> {
    const result = execCommand(
      `ffprobe -v quiet -print_format json -show_streams -select_streams a "${path}"`,
      { timeout: 10000 },
    );
    try {
      const info = JSON.parse(result.stdout);
      const stream = info.streams?.[0];
      return stream ? { duration: parseFloat(stream.duration ?? "0"), sampleRate: parseInt(stream.sample_rate ?? "44100"), channels: stream.channels ?? 2 } : null;
    } catch { return null; }
  }
}

// ─── Image Engine ────────────────────────────────────────────────────────────

export class ImageEngine extends DomainEngine {
  readonly name = "Image";

  async getFileInfo(path: string): Promise<{ width: number; height: number; format: string; size: number } | null> {
    const result = execCommand(
      `ffprobe -v quiet -print_format json -show_streams -select_streams v:0 "${path}"`,
      { timeout: 10000 },
    );
    try {
      const info = JSON.parse(result.stdout);
      const s = info.streams?.[0];
      return s ? { width: s.width, height: s.height, format: s.codec_name, size: parseInt(info.format?.size ?? "0") } : null;
    } catch { return null; }
  }

  async resize(input: string, output: string, width: number, height: number): Promise<{ success: boolean }> {
    const result = execCommand(`ffmpeg -y -i "${input}" -vf scale=${width}:${height} "${output}"`, { timeout: 15000 });
    return { success: result.exitCode === 0 };
  }

  async extractFrame(videoPath: string, outputImage: string, timeSeconds: number): Promise<{ success: boolean }> {
    const result = execCommand(`ffmpeg -y -ss ${timeSeconds} -i "${videoPath}" -vframes 1 "${outputImage}"`, { timeout: 10000 });
    return { success: result.exitCode === 0 };
  }

  async createThumbnail(videoPath: string, output: string, time?: number): Promise<{ success: boolean }> {
    const t = time ?? 1;
    const result = execCommand(`ffmpeg -y -ss ${t} -i "${videoPath}" -vframes 1 -vf "scale=320:-1" "${output}"`, { timeout: 10000 });
    return { success: result.exitCode === 0 };
  }
}

// ─── Video Engine ────────────────────────────────────────────────────────────

export class VideoEngine extends DomainEngine {
  readonly name = "Video";

  async getVideoInfo(path: string): Promise<{
    duration: number; width: number; height: number; fps: number;
    videoCodec: string; audioCodec: string; bitrate: number; size: number;
  } | null> {
    const result = execCommand(`ffprobe -v quiet -print_format json -show_format -show_streams "${path}"`, { timeout: 10000 });
    try {
      const info = JSON.parse(result.stdout);
      const v = info.streams?.find((s: any) => s.codec_type === "video");
      const a = info.streams?.find((s: any) => s.codec_type === "audio");
      return {
        duration: parseFloat(info.format?.duration ?? "0"),
        width: v?.width ?? 0, height: v?.height ?? 0,
        fps: v?.r_frame_rate ? eval(v.r_frame_rate) : 30,
        videoCodec: v?.codec_name ?? "unknown",
        audioCodec: a?.codec_name ?? "none",
        bitrate: parseInt(info.format?.bit_rate ?? "0"),
        size: parseInt(info.format?.size ?? "0"),
      };
    } catch { return null; }
  }

  async extractClip(input: string, output: string, start: number, duration: number): Promise<{ success: boolean; error?: string }> {
    const ffmpeg = this.adapters.getByName("FFmpeg") as any;
    if (ffmpeg?.isInstalled) return ffmpeg.extractClip(input, output, start, duration);
    return { success: false, error: "FFmpeg not available" };
  }

  async concatenate(inputs: string[], output: string): Promise<{ success: boolean }> {
    const ffmpeg = this.adapters.getByName("FFmpeg") as any;
    if (ffmpeg?.isInstalled) { const r = await ffmpeg.concatenate(inputs, output); return { success: r.success }; }
    return { success: false };
  }

  async addSubtitles(videoPath: string, srtPath: string, output: string): Promise<{ success: boolean }> {
    const result = execCommand(
      `ffmpeg -y -i "${videoPath}" -vf "subtitles='${srtPath}'" -c:a copy "${output}"`,
      { timeout: 60000 },
    );
    return { success: result.exitCode === 0 };
  }
}

// ─── Animation Engine ────────────────────────────────────────────────────────

export class AnimationEngine extends DomainEngine {
  readonly name = "Animation";

  async generateKeyframes(description: string, count: number = 5): Promise<{ path: string; time: number }[]> {
    // Placeholder for AI keyframe generation
    this.logger.info(`Keyframe generation: "${description}" (${count} frames)`);
    return [];
  }

  async interpolateFrames(inputVideo: string, outputVideo: string, factor: number = 2): Promise<{ success: boolean }> {
    const result = execCommand(
      `ffmpeg -y -i "${inputVideo}" -vf "minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:vsbmc=1" "${outputVideo}"`,
      { timeout: 120000 },
    );
    return { success: result.exitCode === 0 };
  }
}

// ─── Editing Engine ──────────────────────────────────────────────────────────

export class EditingEngine extends DomainEngine {
  readonly name = "Editing";

  async cutSegment(input: string, output: string, startMs: number, endMs: number): Promise<{ success: boolean }> {
    const start = startMs / 1000;
    const duration = (endMs - startMs) / 1000;
    const result = execCommand(
      `ffmpeg -y -ss ${start} -i "${input}" -t ${duration} -c copy "${output}"`,
      { timeout: 30000 },
    );
    return { success: result.exitCode === 0 };
  }

  async changeSpeed(input: string, output: string, speed: number): Promise<{ success: boolean }> {
    const audio = `atempo=${speed}`;
    const video = speed <= 2 ? `setpts=${1/speed}*PTS` : `setpts=${1/speed}*PTS`;
    const result = execCommand(
      `ffmpeg -y -i "${input}" -filter_complex "[0:v]${video}[v];[0:a]${audio}[a]" -map "[v]" -map "[a]" "${output}"`,
      { timeout: 60000 },
    );
    return { success: result.exitCode === 0 };
  }

  async reverse(input: string, output: string): Promise<{ success: boolean }> {
    const result = execCommand(
      `ffmpeg -y -i "${input}" -vf reverse -af areverse "${output}"`,
      { timeout: 60000 },
    );
    return { success: result.exitCode === 0 };
  }
}

// ─── Compositing Engine ──────────────────────────────────────────────────────

export class CompositingEngine extends DomainEngine {
  readonly name = "Compositing";

  async overlayImages(base: string, overlay: string, output: string, x = 0, y = 0): Promise<{ success: boolean }> {
    const result = execCommand(
      `ffmpeg -y -i "${base}" -i "${overlay}" -filter_complex "overlay=${x}:${y}" "${output}"`,
      { timeout: 30000 },
    );
    return { success: result.exitCode === 0 };
  }

  async applyMask(input: string, mask: string, output: string): Promise<{ success: boolean }> {
    const result = execCommand(
      `ffmpeg -y -i "${input}" -i "${mask}" -filter_complex "[0:v][1:v]alphamerge" "${output}"`,
      { timeout: 30000 },
    );
    return { success: result.exitCode === 0 };
  }

  async applyTransition(inputA: string, inputB: string, output: string, durationMs: number, type = "fade"): Promise<{ success: boolean }> {
    const d = durationMs / 1000;
    const filter = type === "fade"
      ? `xfade=transition=fade:duration=${d}:offset=0`
      : `xfade=transition=${type}:duration=${d}:offset=0`;
    const result = execCommand(
      `ffmpeg -y -i "${inputA}" -i "${inputB}" -filter_complex "${filter}" "${output}"`,
      { timeout: 60000 },
    );
    return { success: result.exitCode === 0 };
  }
}

// ─── Render Engine ───────────────────────────────────────────────────────────

export class RenderEngine extends DomainEngine {
  readonly name = "Render";

  async render(input: string, output: string, options: {
    codec?: string; bitrate?: string; resolution?: string;
    fps?: number; format?: string; hwAccel?: string;
  } = {}): Promise<{ success: boolean; duration: number; error?: string }> {
    const start = Date.now();
    const args = ["-y", "-i", `"${input}"`];
    args.push("-c:v", options.codec ?? "libx264");
    args.push("-c:a", "aac");
    if (options.bitrate) args.push("-b:v", options.bitrate);
    if (options.resolution) args.push("-s", options.resolution);
    if (options.fps) args.push("-r", String(options.fps));
    args.push(`"${output}"`);

    const result = execCommand(`ffmpeg ${args.join(" ")}`, { timeout: 600000 });
    return { success: result.exitCode === 0, duration: Date.now() - start, error: result.stderr || undefined };
  }

  async renderWithHardware(input: string, output: string, options: { hwAccel?: string; preset?: string; crf?: number } = {}): Promise<{ success: boolean }> {
    const ffmpeg = this.adapters.getByName("FFmpeg") as any;
    if (ffmpeg?.isInstalled) {
      const r = await ffmpeg.hardwareTranscode(input, output, options);
      return { success: r.success };
    }
    return this.render(input, output);
  }
}

// ─── Subtitle Engine ─────────────────────────────────────────────────────────

export class SubtitleEngine extends DomainEngine {
  readonly name = "Subtitles";

  async generateSRT(segments: { start: number; end: number; text: string }[], outputPath: string): Promise<{ success: boolean }> {
    const { writeFileSync } = await import("node:fs");
    let srt = "";
    segments.forEach((seg, i) => {
      const start = this.secondsToSRT(seg.start);
      const end = this.secondsToSRT(seg.end);
      srt += `${i + 1}\n${start} --> ${end}\n${seg.text}\n\n`;
    });
    writeFileSync(outputPath, srt);
    return { success: true };
  }

  async burnSubtitles(videoPath: string, srtPath: string, outputPath: string, style?: {
    fontSize?: number; fontName?: string; color?: string; outline?: number;
  }): Promise<{ success: boolean }> {
    const fs = style?.fontSize ?? 24;
    const fn = style?.fontName ?? "Arial";
    const fc = style?.color ?? "&Hffffff";
    const fo = style?.outline ?? 2;
    const filter = `subtitles='${srtPath}':force_style='FontSize=${fs},FontName=${fn},PrimaryColour=${fc},Outline=${fo}'`;
    const result = execCommand(
      `ffmpeg -y -i "${videoPath}" -vf "${filter}" -c:a copy "${outputPath}"`,
      { timeout: 60000 },
    );
    return { success: result.exitCode === 0 };
  }

  private secondsToSRT(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  }
}
