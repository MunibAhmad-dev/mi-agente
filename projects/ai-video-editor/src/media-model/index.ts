/**
 * AI Creative OS - Universal Media Model
 * 
 * A representation of audiovisual content independent of any editor.
 * Can be translated to: DaVinci, CapCut, After Effects, Kdenlive, Blender, FFmpeg, OTIO.
 * 
 * When a feature has no equivalent: Supported | Converted | Approximated | Unsupported
 * Never hide losses.
 */

import type {
  UniversalProject, UniversalSequence, UniversalTrack, UniversalClip,
  UniversalEffect, UniversalTransition, UniversalKeyframe, UniversalAnimation,
  UniversalCamera, UniversalColorGrade, UniversalCaption, UniversalMarker,
  UniqueId, Duration, TransitionType, TimelineExportResult,
} from "../types/index.js";
import { generateId } from "../core/index.js";

export class UniversalMediaModel {
  /**
   * Create a new empty project.
   */
  static createProject(name: string, fps = 30, resolution = { width: 1920, height: 1080 }): UniversalProject {
    return {
      id: generateId(),
      name,
      status: "draft",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
      sequences: [UniversalMediaModel.createSequence("Main Sequence", fps, resolution)],
      assets: [],
      metadata: {},
      platform: "generic",
      aspectRatio: "16:9",
      resolution,
      fps,
    };
  }

  static createSequence(name: string, fps = 30, resolution = { width: 1920, height: 1080 }): UniversalSequence {
    return {
      id: generateId(),
      name,
      tracks: [],
      duration: 0,
      fps,
      resolution,
      locked: false,
    };
  }

  static createTrack(name: string, type: UniversalTrack["type"]): UniversalTrack {
    return {
      id: generateId(),
      name,
      type,
      clips: [],
      muted: false,
      solo: false,
      volume: 1,
      locked: false,
      order: 0,
    };
  }

  static createClip(overrides: Partial<UniversalClip> & { source: UniqueId }): UniversalClip {
    const duration = overrides.duration ?? 5000;
    return {
      id: generateId(),
      type: "video",
      start: 0,
      end: duration,
      inPoint: 0,
      outPoint: duration,
      track: "",
      transform: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0.5, y: 0.5 },
        opacity: 1,
        flipH: false,
        flipV: false,
        skew: { x: 0, y: 0 },
      },
      opacity: 1,
      effects: [],
      transitions: [],
      keyframes: [],
      speed: 1,
      reversed: false,
      locked: false,
      ...overrides,
      duration,
    };
  }

  /**
   * Calculate the total duration of a sequence.
   */
  static calculateSequenceDuration(sequence: UniversalSequence): Duration {
    let maxEnd = 0;
    for (const track of sequence.tracks) {
      for (const clip of track.clips) {
        const clipEnd = clip.start + clip.duration;
        if (clipEnd > maxEnd) maxEnd = clipEnd;
      }
    }
    return maxEnd;
  }

  /**
   * Export timeline to a specific format.
   * Returns information about what was supported, converted, approximated, or unsupported.
   */
  static exportTimeline(
    project: UniversalProject,
    targetFormat: "davinci" | "capcut" | "after_effects" | "kdenlive" | "blender" | "ffmpeg" | "otio",
  ): TimelineExportResult {
    const supported: string[] = [];
    const converted: string[] = [];
    const approximated: string[] = [];
    const unsupported: string[] = [];
    const warnings: string[] = [];

    // Check features
    for (const sequence of project.sequences) {
      for (const track of sequence.tracks) {
        for (const clip of track.clips) {
          // Basic clip properties
          supported.push("clip_timing");
          supported.push("clip_position");

          // Effects
          if (clip.effects.length > 0) {
            if (targetFormat === "davinci") supported.push("effects_davinci");
            else if (targetFormat === "ffmpeg") converted.push("effects_ffmpeg_filter");
            else approximated.push("effects_fallback");
          }

          // Transitions
          for (const trans of clip.transitions) {
            if (targetFormat === "ffmpeg" && ["cut", "crossfade"].includes(trans.type)) {
              supported.push(`transition_${trans.type}`);
            } else if (targetFormat === "ffmpeg") {
              approximated.push(`transition_${trans.type}_approximated`);
            }
          }

          // Speed changes
          if (clip.speed !== 1) {
            if (targetFormat === "ffmpeg") supported.push("speed_change");
            else converted.push("speed_change_converted");
          }
        }
      }
    }

    const formatFile = `export.${targetFormat === "ffmpeg" ? "sh" : targetFormat === "otio" ? "otio" : "json"}`;

    return {
      format: targetFormat,
      file: formatFile,
      supported,
      converted,
      approximated,
      unsupported,
      warnings,
    };
  }
}
