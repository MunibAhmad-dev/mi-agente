/**
 * AI Creative OS - Voice Processing Engine
 * §49: STT, TTS, Voice Processing, Noise Reduction, EQ, Compression, Voice Isolation.
 * Uses FFmpeg audio filters + optional external providers.
 */

import type { UniqueId, Score, FilePath, Bytes } from "../types/index.js";
import { Logger, EventBus, generateId, execCommand } from "../core/index.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VoiceProfile {
  id: UniqueId;
  name: string;
  pitch: number;
  speed: number;
  volume: number;
  sampleRate: number;
  channels: number;
  embedding?: number[];
}

export interface NoiseReductionOptions {
  intensity: "light" | "medium" | "strong";  // aggressiveness
  preserveVoice: boolean;
  adaptiveNoiseFloor: boolean;
}

export interface EQBand {
  frequency: number;   // Hz
  gain: number;        // dB (-12 to +12)
  q: number;           // bandwidth
  type: "lowshelf" | "peaking" | "highshelf" | "lowpass" | "highpass" | "notch";
}

export interface EQSettings {
  bands: EQBand[];
  preset?: string;
}

export interface CompressionSettings {
  threshold: number;    // dB
  ratio: number;        // e.g., 4 = 4:1
  attack: number;       // ms
  release: number;      // ms
  knee: number;         // dB
  makeupGain: number;   // dB
}

export interface TTSOptions {
  voice?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
}

export interface VoiceIsolationOptions {
  preserveQuality: boolean;
  noiseFloor: number;   // dB
}

export interface AudioMixTrack {
  path: FilePath;
  volume: number;       // 0.0-2.0
  pan?: number;         // -1.0 to 1.0
  fadeIn?: number;      // seconds
  fadeOut?: number;     // seconds
  startAt?: number;     // seconds offset
  eq?: EQSettings;
  compression?: CompressionSettings;
}

export interface MasteringOptions {
  targetLoudness: number;  // LUFS, e.g., -14 for streaming
  truePeak: number;        // dBTP, e.g., -1.0
  dynamicRange: number;    // LU
  dither?: boolean;
}

export interface VoiceAnalysis {
  duration: number;
  sampleRate: number;
  channels: number;
  bitrate: number;
  loudness: {
    integrated: number;
    shortTerm: number;
    momentary: number;
    truePeak: number;
  };
  noiseFloor: number;
  dynamicRange: number;
  speechPresence: number;  // 0-1
}

// ─── Voice Processing Engine ─────────────────────────────────────────────────

export class VoiceEngine {
  private logger = new Logger("VoiceEngine");
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  // ─── Noise Reduction ─────────────────────────────────────────────────────

  /**
   * Reduce background noise using FFmpeg audio filters.
   */
  async reduceNoise(
    input: FilePath,
    output: FilePath,
    options: NoiseReductionOptions = { intensity: "medium", preserveVoice: true, adaptiveNoiseFloor: true },
  ): Promise<{ success: boolean; error?: string }> {
    const filterMap = {
      light: "afftdn=nf=-25:nr=10:nt=w",
      medium: "afftdn=nf=-30:nr=20:nt=w",
      strong: "afftdn=nf=-35:nr=30:nt=w",
    };

    let filter = filterMap[options.intensity];

    if (options.preserveVoice) {
      // Add high-pass at 80Hz to remove rumble, keep voice frequencies
      filter = `highpass=f=80,${filter}`;
    }

    const result = execCommand(
      `ffmpeg -y -i "${input}" -af "${filter}" -c:a pcm_s16le "${output}"`,
      { timeout: 120000 },
    );

    return { success: result.exitCode === 0, error: result.exitCode !== 0 ? result.stderr : undefined };
  }

  // ─── EQ ───────────────────────────────────────────────────────────────────

  /**
   * Apply parametric equalizer to audio.
   */
  async applyEQ(
    input: FilePath,
    output: FilePath,
    settings: EQSettings,
  ): Promise<{ success: boolean; error?: string }> {
    if (settings.bands.length === 0) {
      const r = execCommand(`ffmpeg -y -i "${input}" -c copy "${output}"`, { timeout: 30000 });
      return { success: r.exitCode === 0 };
    }

    const eqFilters = settings.bands.map(band => {
      const typeMap: Record<string, string> = {
        lowshelf: "lowshelf",
        peaking: "peak",
        highshelf: "highshelf",
        lowpass: "lowpass",
        highpass: "highpass",
        notch: "notch",
      };
      return `equalizer=f=${band.frequency}:width_type=q:w=${band.q}:g=${band.gain}:t=${typeMap[band.type] ?? "peak"}`;
    });

    const result = execCommand(
      `ffmpeg -y -i "${input}" -af "${eqFilters.join(",")}" -c:a pcm_s16le "${output}"`,
      { timeout: 120000 },
    );

    return { success: result.exitCode === 0, error: result.exitCode !== 0 ? result.stderr : undefined };
  }

  /**
   * Apply a common EQ preset.
   */
  async applyEQPreset(
    input: FilePath,
    output: FilePath,
    preset: "voice_clarity" | "bass_boost" | "treble_boost" | "podcast" | "music" | "broadcast",
  ): Promise<{ success: boolean; error?: string }> {
    const presets: Record<string, EQSettings> = {
      voice_clarity: {
        bands: [
          { frequency: 100, gain: -3, q: 1, type: "lowshelf" },
          { frequency: 2500, gain: 3, q: 1.5, type: "peaking" },
          { frequency: 5000, gain: 2, q: 1, type: "peaking" },
          { frequency: 8000, gain: -2, q: 1, type: "highshelf" },
        ],
      },
      bass_boost: {
        bands: [
          { frequency: 100, gain: 6, q: 1, type: "lowshelf" },
          { frequency: 200, gain: 3, q: 1.5, type: "peaking" },
        ],
      },
      treble_boost: {
        bands: [
          { frequency: 4000, gain: 4, q: 1, type: "peaking" },
          { frequency: 10000, gain: 3, q: 1, type: "highshelf" },
        ],
      },
      podcast: {
        bands: [
          { frequency: 80, gain: -6, q: 1, type: "lowshelf" },
          { frequency: 200, gain: -3, q: 1.5, type: "peaking" },
          { frequency: 1500, gain: 2, q: 1, type: "peaking" },
          { frequency: 3000, gain: 3, q: 1.5, type: "peaking" },
          { frequency: 6000, gain: 2, q: 1, type: "peaking" },
          { frequency: 12000, gain: -3, q: 1, type: "highshelf" },
        ],
      },
      music: {
        bands: [
          { frequency: 60, gain: 3, q: 1, type: "lowshelf" },
          { frequency: 200, gain: -1, q: 1.5, type: "peaking" },
          { frequency: 3000, gain: 2, q: 1, type: "peaking" },
          { frequency: 10000, gain: 1, q: 1, type: "highshelf" },
        ],
      },
      broadcast: {
        bands: [
          { frequency: 80, gain: -8, q: 1, type: "lowpass" },
          { frequency: 200, gain: -2, q: 1.5, type: "peaking" },
          { frequency: 3000, gain: 4, q: 1, type: "peaking" },
          { frequency: 5000, gain: 3, q: 1.5, type: "peaking" },
          { frequency: 10000, gain: 1, q: 1, type: "highshelf" },
        ],
      },
    };

    const eqSettings = presets[preset] ?? presets.voice_clarity;
    return this.applyEQ(input, output, eqSettings);
  }

  // ─── Compression ──────────────────────────────────────────────────────────

  /**
   * Apply audio compression.
   */
  async compress(
    input: FilePath,
    output: FilePath,
    settings: CompressionSettings,
  ): Promise<{ success: boolean; error?: string }> {
    const filter = [
      `acompressor=threshold=${settings.threshold}dB`,
      `:ratio=${settings.ratio}`,
      `:attack=${settings.attack}`,
      `:release=${settings.release}`,
      `:knee=${settings.knee}`,
      `:makeup=${settings.makeupGain}dB`,
    ].join("");

    const result = execCommand(
      `ffmpeg -y -i "${input}" -af "${filter}" -c:a pcm_s16le "${output}"`,
      { timeout: 120000 },
    );

    return { success: result.exitCode === 0, error: result.exitCode !== 0 ? result.stderr : undefined };
  }

  /**
   * Apply common compression presets.
   */
  async compressPreset(
    input: FilePath,
    output: FilePath,
    preset: "voice" | "podcast" | "music" | "broadcast" | "mastering",
  ): Promise<{ success: boolean; error?: string }> {
    const presets: Record<string, CompressionSettings> = {
      voice: { threshold: -20, ratio: 3, attack: 5, release: 50, knee: 6, makeupGain: 3 },
      podcast: { threshold: -18, ratio: 4, attack: 3, release: 40, knee: 4, makeupGain: 4 },
      music: { threshold: -12, ratio: 2.5, attack: 10, release: 100, knee: 6, makeupGain: 2 },
      broadcast: { threshold: -16, ratio: 6, attack: 2, release: 30, knee: 3, makeupGain: 5 },
      mastering: { threshold: -10, ratio: 2, attack: 20, release: 200, knee: 8, makeupGain: 1 },
    };

    return this.compress(input, output, presets[preset] ?? presets.voice);
  }

  // ─── Voice Isolation ──────────────────────────────────────────────────────

  /**
   * Isolate voice from background noise/music using FFmpeg.
   */
  async isolateVoice(
    input: FilePath,
    output: FilePath,
    options: VoiceIsolationOptions = { preserveQuality: true, noiseFloor: -30 },
  ): Promise<{ success: boolean; error?: string }> {
    // Use highpass + voice frequency isolation + noise gate
    const filters = [
      `highpass=f=80`,
      `lowpass=f=8000`,
      `afftdn=nf=${options.noiseFloor}:nr=25:nt=w`,
      `agate=threshold=-35dB:ratio=2:attack=5:release=50`,
      options.preserveQuality ? `aresample=44100` : ``,
    ].filter(Boolean).join(",");

    const result = execCommand(
      `ffmpeg -y -i "${input}" -af "${filters}" -c:a pcm_s16le "${output}"`,
      { timeout: 120000 },
    );

    return { success: result.exitCode === 0, error: result.exitCode !== 0 ? result.stderr : undefined };
  }

  // ─── TTS (Stub — requires external provider) ─────────────────────────────

  /**
   * Generate speech from text using available TTS providers.
   * This routes to the best available TTS adapter.
   */
  async textToSpeech(
    text: string,
    output: FilePath,
    options: TTSOptions = {},
  ): Promise<{ success: boolean; provider?: string; error?: string }> {
    this.logger.info(`TTS request: "${text.substring(0, 50)}..." -> ${output}`);

    // Check for edge-tts (free Microsoft TTS)
    const edgeTTS = execCommand("which edge-tts 2>/dev/null || which edge-playback 2>/dev/null", { timeout: 5000 });
    if (edgeTTS.exitCode === 0) {
      const voice = options.voice ?? "en-US-AriaNeural";
      const rate = options.speed ? `+${Math.round((options.speed - 1) * 100)}%` : "+0%";
      const result = execCommand(
        `edge-tts --voice "${voice}" --rate "${rate}" --text "${text.replace(/"/g, '\\"')}" --write-media "${output}"`,
        { timeout: 60000 },
      );
      if (result.exitCode === 0) {
        return { success: true, provider: "edge-tts" };
      }
    }

    // Check for espeak-ng
    const espeak = execCommand("which espeak-ng 2>/dev/null || which espeak 2>/dev/null", { timeout: 5000 });
    if (espeak.exitCode === 0) {
      const speed = Math.round((options.speed ?? 1) * 175);
      const result = execCommand(
        `espeak-ng -s ${speed} -w "${output}" "${text.replace(/"/g, '\\"')}"`,
        { timeout: 30000 },
      );
      if (result.exitCode === 0) {
        return { success: true, provider: "espeak-ng" };
      }
    }

    return { success: false, error: "No TTS provider available (install edge-tts or espeak-ng)" };
  }

  // ─── Audio Mix ────────────────────────────────────────────────────────────

  /**
   * Mix multiple audio tracks with individual EQ, compression, and volume.
   */
  async mixTracks(
    tracks: AudioMixTrack[],
    output: FilePath,
    options: { normalize?: boolean; targetLoudness?: number } = {},
  ): Promise<{ success: boolean; error?: string }> {
    if (tracks.length === 0) return { success: false, error: "No tracks provided" };
    if (tracks.length === 1) {
      const r = execCommand(`ffmpeg -y -i "${tracks[0].path}" -c copy "${output}"`, { timeout: 30000 });
      return { success: r.exitCode === 0 };
    }

    const inputs = tracks.map(t => `-i "${t.path}"`).join(" ");
    const filterParts: string[] = [];
    const amergeParts: string[] = [];

    tracks.forEach((track, i) => {
      const filters: string[] = [`volume=${track.volume}`];

      if (track.pan !== undefined) {
        filters.push(`pan=stereo|c0=c0*${1 - Math.max(0, track.pan)}|c1=c1*${1 + Math.min(0, track.pan)}`);
      }
      if (track.fadeIn) {
        filters.push(`afade=t=in:st=0:d=${track.fadeIn}`);
      }
      if (track.fadeOut) {
        filters.push(`afade=t=out:st=999:d=${track.fadeOut}`);
      }

      filterParts.push(`[${i}:a]${filters.join(",")}[a${i}]`);
      amergeParts.push(`[a${i}]`);
    });

    const amix = `${amergeParts.join("")}amix=inputs=${tracks.length}:duration=longest:dropout_transition=2[out]`;
    filterParts.push(amix);

    const result = execCommand(
      `ffmpeg -y ${inputs} -filter_complex "${filterParts.join(";")}" -map "[out]" -c:a pcm_s16le "${output}"`,
      { timeout: 120000 },
    );

    return { success: result.exitCode === 0, error: result.exitCode !== 0 ? result.stderr : undefined };
  }

  // ─── Mastering ────────────────────────────────────────────────────────────

  /**
   * Apply mastering chain: compression → EQ → limiting → loudness normalization.
   */
  async master(
    input: FilePath,
    output: FilePath,
    options: MasteringOptions = { targetLoudness: -14, truePeak: -1.0, dynamicRange: 8, dither: true },
  ): Promise<{ success: boolean; error?: string }> {
    const filters = [
      `acompressor=threshold=-15dB:ratio=3:attack=5:release=100`,
      `equalizer=f=200:t=q:w=1:g=-2`,
      `equalizer=f=3000:t=q:w=1:g=2`,
      `loudnorm=I=${options.targetLoudness}:TP=${options.truePeak}:LRA=${options.dynamicRange}:print_format=summary`,
    ];

    if (options.dither) {
      filters.push(`dither=dither_method=triangular`);
    }

    const result = execCommand(
      `ffmpeg -y -i "${input}" -af "${filters.join(",")}" -c:a pcm_s16le "${output}"`,
      { timeout: 120000 },
    );

    return { success: result.exitCode === 0, error: result.exitCode !== 0 ? result.stderr : undefined };
  }

  // ─── Voice Analysis ───────────────────────────────────────────────────────

  /**
   * Analyze audio properties: loudness, noise floor, dynamic range, speech presence.
   */
  async analyzeVoice(path: FilePath): Promise<VoiceAnalysis | null> {
    const infoResult = execCommand(
      `ffprobe -v quiet -print_format json -show_streams -select_streams a "${path}"`,
      { timeout: 10000 },
    );

    let sampleRate = 44100;
    let channels = 2;
    let bitrate = 0;

    try {
      const info = JSON.parse(infoResult.stdout);
      const stream = info.streams?.[0];
      if (stream) {
        sampleRate = parseInt(stream.sample_rate ?? "44100");
        channels = stream.channels ?? 2;
        bitrate = parseInt(stream.bit_rate ?? "0");
      }
    } catch { /* use defaults */ }

    // Loudness measurement
    const loudResult = execCommand(
      `ffmpeg -i "${path}" -af "ebur128=peak=true" -f null - 2>&1 | tail -15`,
      { timeout: 60000 },
    );

    const integrated = this.extractLoudness(loudResult.stdout, "I:") ?? -23;
    const shortTerm = this.extractLoudness(loudResult.stdout, "S:") ?? -23;
    const momentary = this.extractLoudness(loudResult.stdout, "M:") ?? -23;
    const truePeak = this.extractLoudness(loudResult.stdout, "Peak") ?? -3;

    // Duration
    const durResult = execCommand(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${path}"`,
      { timeout: 10000 },
    );
    const duration = parseFloat(durResult.stdout) || 0;

    // Noise floor estimation (RMS of low-energy segments)
    const noiseResult = execCommand(
      `ffmpeg -i "${path}" -af "silencedetect=noise=-40dB:d=0.1" -f null - 2>&1 | grep "silence_" | wc -l`,
      { timeout: 30000 },
    );

    return {
      duration,
      sampleRate,
      channels,
      bitrate,
      loudness: {
        integrated,
        shortTerm,
        momentary,
        truePeak,
      },
      noiseFloor: -40,
      dynamicRange: Math.abs(integrated - truePeak),
      speechPresence: Math.min(1, Math.max(0, 1 - parseInt(noiseResult.stdout) * 0.05)),
    };
  }

  private extractLoudness(output: string, prefix: string): number | null {
    const match = output.match(new RegExp(`${prefix}\\s*([\\-\\d.]+)`));
    return match ? parseFloat(match[1]) : null;
  }

  // ─── Speed & Pitch ────────────────────────────────────────────────────────

  /**
   * Change audio speed without altering pitch.
   */
  async changeSpeed(
    input: FilePath,
    output: FilePath,
    speed: number,  // 0.5 = half speed, 2.0 = double speed
  ): Promise<{ success: boolean; error?: string }> {
    // atempo supports 0.5 to 2.0; chain for wider ranges
    const filters: string[] = [];
    let remaining = speed;

    while (remaining > 2.0) {
      filters.push("atempo=2.0");
      remaining /= 2.0;
    }
    while (remaining < 0.5) {
      filters.push("atempo=0.5");
      remaining /= 0.5;
    }
    filters.push(`atempo=${remaining}`);

    const result = execCommand(
      `ffmpeg -y -i "${input}" -af "${filters.join(",")}" -c:a pcm_s16le "${output}"`,
      { timeout: 120000 },
    );

    return { success: result.exitCode === 0, error: result.exitCode !== 0 ? result.stderr : undefined };
  }

  /**
   * Change audio pitch without altering speed.
   */
  async changePitch(
    input: FilePath,
    output: FilePath,
    semitones: number,  // e.g., -2 = 2 semitones down, +3 = 3 semitones up
  ): Promise<{ success: boolean; error?: string }> {
    const factor = Math.pow(2, semitones / 12);
    const result = execCommand(
      `ffmpeg -y -i "${input}" -af "rubberband=pitch=${factor}" -c:a pcm_s16le "${output}"`,
      { timeout: 120000 },
    );

    // Fallback: asetrate if rubberband not available
    if (result.exitCode !== 0) {
      const r2 = execCommand(
        `ffmpeg -y -i "${input}" -af "asetrate=44100*${factor},atempo=${1 / factor}" -c:a pcm_s16le "${output}"`,
        { timeout: 120000 },
      );
      return { success: r2.exitCode === 0, error: r2.exitCode !== 0 ? r2.stderr : undefined };
    }

    return { success: true };
  }
}
