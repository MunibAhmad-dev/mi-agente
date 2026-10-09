/**
 * AI Creative OS - Whisper Adapter
 * Transcription, timestamps, captions, narrative analysis.
 * License: MIT (Whisper), Apache 2.0 (faster-whisper)
 */

import { BaseAdapter, type AutomationMethod } from "./base.js";
import type { AdapterCapability, AdapterResult, FilePath } from "../types/index.js";

export class WhisperAdapter extends BaseAdapter {
  readonly version = "1.0.0";
  readonly executableName = "whisper";

  private _caps: AdapterCapability[] = [
    { name: "transcription", supported: true, quality: 92, speed: 85 },
    { name: "timestamping", supported: true, quality: 90, speed: 85 },
    { name: "caption_generation", supported: true, quality: 88, speed: 85 },
    { name: "language_detection", supported: true, quality: 90, speed: 90 },
    { name: "multi_language", supported: true, quality: 88, speed: 80 },
  ];

  async detect(): Promise<boolean> {
    // Check for faster-whisper (preferred), then openai-whisper, then whisper CLI
    for (const cmd of [
      'python3 -c "import faster_whisper; print(faster_whisper.__version__)" 2>/dev/null',
      'python -c "import faster_whisper; print(faster_whisper.__version__)" 2>/dev/null',
      'python3 -c "import whisper; print(whisper.__version__)" 2>/dev/null',
      'python -c "import whisper; print(whisper.__version__)" 2>/dev/null',
    ]) {
      const result = await this.executeCommand(cmd);
      if (result.success && result.data) {
        this._installed = true;
        this._version = result.data.trim();
        this.logger.info(`Whisper detected: v${this._version}`);
        return true;
      }
    }
    this._installed = false;
    return false;
  }

  getCapabilities(): AdapterCapability[] { return this._caps; }
  getAutomationMethods(): AutomationMethod[] { return ["scripting", "cli"]; }

  async transcribe(
    audioPath: FilePath,
    options: { language?: string; model?: string; outputFormat?: string } = {},
  ): Promise<AdapterResult<TranscriptionResult>> {
    const model = options.model ?? "base";
    const lang = options.language ? `--language ${options.language}` : "";
    const script = `
import json
try:
    from faster_whisper import WhisperModel
    model = WhisperModel("${model}", device="auto")
    segments, info = model.transcribe("${audioPath}" ${lang ? `, language="${options.language}"` : ""})
    result = {"language": info.language, "segments": []}
    for seg in segments:
        result["segments"].append({"start": seg.start, "end": seg.end, "text": seg.text.strip()})
    print(json.dumps(result))
except ImportError:
    import whisper
    model = whisper.load_model("${model}")
    result = model.transcribe("${audioPath}")
    out = {"language": result.get("language","unknown"), "segments": []}
    for seg in result.get("segments", []):
        out["segments"].append({"start": seg["start"], "end": seg["end"], "text": seg["text"].strip()})
    print(json.dumps(out))
`;
    const result = await this.executeCommand(
      `python3 -c '${script.replace(/'/g, "'\\''")}' 2>/dev/null || python -c '${script.replace(/'/g, "'\\''")}'`,
      { timeout: 300000 },
    );
    if (!result.success || !result.data) return { success: false, error: result.error, duration: result.duration, provider: result.provider };
    try { return { ...result, data: JSON.parse(result.data) as unknown as TranscriptionResult }; }
    catch { return { success: false, error: "Failed to parse transcription", duration: result.duration, provider: result.provider }; }
  }
}

interface TranscriptionResult {
  language: string;
  segments: { start: number; end: number; text: string }[];
}
