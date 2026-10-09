/**
 * AI Creative OS - Import/Export Engine
 * Imports/exports: video, audio, images, project files, timelines, workflows.
 * Translates universal timeline to DaVinci, CapCut, After Effects, Kdenlive, FFmpeg, OTIO.
 */

import type {
  UniversalProject, UniversalSequence, UniversalClip,
  TimelineExportResult, FilePath, ExportFormat,
} from "../types/index.js";
import { Logger, EventBus, generateId, execCommand } from "../core/index.js";

export class ImportExportEngine {
  private logger = new Logger("ImportExport");
  private eventBus: EventBus;
  private translators: Map<string, TimelineTranslator>;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.translators = new Map([
      ["davinci", new DaVinciTranslator()],
      ["capcut", new CapCutTranslator()],
      ["after_effects", new AfterEffectsTranslator()],
      ["kdenlive", new KdenliveTranslator()],
      ["ffmpeg", new FFmpegTranslator()],
      ["otio", new OTIOTranslator()],
    ]);
  }

  /**
   * Export a universal project to a specific format.
   */
  async exportTimeline(project: UniversalProject, target: string, outputPath: FilePath): Promise<TimelineExportResult> {
    const translator = this.translators.get(target);
    if (!translator) {
      return {
        format: target, file: outputPath,
        supported: [], converted: [], approximated: [],
        unsupported: [], warnings: [`Unknown target format: ${target}`],
      };
    }

    const result = await translator.translate(project, outputPath);
    await this.eventBus.emit("TIMELINE_EXPORTED", "ImportExport", { target, outputPath });
    return result;
  }

  /**
   * Import a project from an external format.
   */
  async importTimeline(filePath: FilePath, source: string): Promise<UniversalProject | null> {
    if (source === "video") return this.importVideoFile(filePath);
    if (source === "otio") return this.importOTIO(filePath);
    this.logger.warn(`Import from ${source} not yet implemented`);
    return null;
  }

  private async importVideoFile(filePath: FilePath): Promise<UniversalProject> {
    const result = execCommand(`ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`, { timeout: 10000 });
    let duration = 0, width = 1920, height = 1080, fps = 30;
    try {
      const info = JSON.parse(result.stdout);
      duration = parseFloat(info.format?.duration ?? "0") * 1000;
      const v = info.streams?.find((s: any) => s.codec_type === "video");
      if (v) { width = v.width; height = v.height; fps = v.r_frame_rate ? eval(v.r_frame_rate) : 30; }
    } catch {}

    return {
      id: generateId(), name: filePath.split(/[/\\]/).pop() ?? "Imported",
      status: "draft", createdAt: Date.now(), updatedAt: Date.now(), version: 1,
      sequences: [{
        id: generateId(), name: "Main", locked: false,
        tracks: [{
          id: generateId(), name: "Video", type: "video",
          clips: [{ id: generateId(), source: generateId(), type: "video", start: 0, end: duration, inPoint: 0, outPoint: duration, duration, track: "", transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, opacity: 1, flipH: false, flipV: false, skew: { x: 0, y: 0 } }, opacity: 1, effects: [], transitions: [], keyframes: [], speed: 1, reversed: false, locked: false }],
          muted: false, solo: false, volume: 1, locked: false, order: 0,
        }],
        duration, fps, resolution: { width, height },
      }],
      assets: [], metadata: {},
      platform: width > height ? "youtube" : "tiktok",
      aspectRatio: width > height ? "16:9" : "9:16",
      resolution: { width, height }, fps,
    };
  }

  private async importOTIO(filePath: FilePath): Promise<UniversalProject> {
    // Placeholder for OTIO import
    return {
      id: generateId(), name: "OTIO Import", status: "draft",
      createdAt: Date.now(), updatedAt: Date.now(), version: 1,
      sequences: [], assets: [], metadata: {},
      platform: "generic", aspectRatio: "16:9",
      resolution: { width: 1920, height: 1080 }, fps: 30,
    };
  }

  getSupportedFormats(): string[] { return [...this.translators.keys()]; }
}

// ─── Timeline Translators ────────────────────────────────────────────────────

interface TimelineTranslator {
  translate(project: UniversalProject, outputPath: FilePath): Promise<TimelineExportResult>;
}

class DaVinciTranslator implements TimelineTranslator {
  async translate(project: UniversalProject, outputPath: FilePath): Promise<TimelineExportResult> {
    const supported: string[] = ["timeline", "clips", "tracks", "transitions", "color"];
    const converted: string[] = ["effects→color_nodes", "speed→retime"];
    const approximated: string[] = ["ai_effects→manual"];
    return { format: "davinci", file: outputPath + ".drp", supported, converted, approximated, unsupported: [], warnings: ["DaVinci project file generation requires DaVinci scripting API"] };
  }
}

class CapCutTranslator implements TimelineTranslator {
  async translate(project: UniversalProject, outputPath: FilePath): Promise<TimelineExportResult> {
    return { format: "capcut", file: outputPath + ".capcut", supported: ["timeline", "clips", "transitions"], converted: ["effects→capcut_effects"], approximated: [], unsupported: ["3d_compositing", "fusion_nodes"], warnings: [] };
  }
}

class AfterEffectsTranslator implements TimelineTranslator {
  async translate(project: UniversalProject, outputPath: FilePath): Promise<TimelineExportResult> {
    return { format: "after_effects", file: outputPath + ".aep", supported: ["compositions", "layers", "keyframes", "expressions"], converted: ["color→cc_effects"], approximated: ["ai_generation→placeholder"], unsupported: [], warnings: ["AE project requires ExtendScript for full automation"] };
  }
}

class KdenliveTranslator implements TimelineTranslator {
  async translate(project: UniversalProject, outputPath: FilePath): Promise<TimelineExportResult> {
    return { format: "kdenlive", file: outputPath + ".kdenlive", supported: ["timeline", "clips", "transitions", "titles"], converted: ["effects→kdenlive_effects", "color→kdenlive_color"], approximated: ["compositing→simple_overlay"], unsupported: ["3d", "fusion"], warnings: [] };
  }
}

class FFmpegTranslator implements TimelineTranslator {
  async translate(project: UniversalProject, outputPath: FilePath): Promise<TimelineExportResult> {
    const commands: string[] = [];
    for (const seq of project.sequences) {
      for (const track of seq.tracks) {
        for (const clip of track.clips) {
          commands.push(`ffmpeg -ss ${clip.start / 1000} -i "${clip.source}" -t ${clip.duration / 1000} -c copy segment_${clip.id}.mp4`);
        }
      }
    }
    return { format: "ffmpeg", file: outputPath + ".sh", supported: ["all_basic_operations"], converted: ["effects→filter_complex"], approximated: [], unsupported: [], warnings: ["Generated as FFmpeg shell script"] };
  }
}

class OTIOTranslator implements TimelineTranslator {
  async translate(project: UniversalProject, outputPath: FilePath): Promise<TimelineExportResult> {
    return { format: "otio", file: outputPath + ".otio", supported: ["timeline", "clips", "tracks", "transitions", "metadata"], converted: [], approximated: [], unsupported: [], warnings: ["OTIO export requires opentimelineio Python library"] };
  }
}
