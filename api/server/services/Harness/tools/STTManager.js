/**
 * STTManager — Speech-to-Text (Free, Self-hosted)
 * Uses Whisper.cpp or Vosk (both MIT/Apache-2.0)
 * 
 * License: MIT — Zero cost
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class STTManager {
  constructor(options = {}) {
    this.modelPath = options.modelPath || path.join(process.cwd(), 'models', 'whisper');
    this.backend = null; // 'whisper' | 'vosk' | 'web' | null
    this.initialized = false;
    this.stats = { transcriptions: 0, failed: 0 };
  }

  async initialize() {
    // Check for whisper.cpp — use execFileSync to avoid shell string injection
    try { execFileSync('which', ['whisper-cpp'], { stdio: 'pipe' }); this.backend = 'whisper'; }
    catch { try { execFileSync('which', ['whisper'], { stdio: 'pipe' }); this.backend = 'whisper'; } catch {} }
    // Check for vosk
    try { require.resolve('vosk'); this.backend = this.backend || 'vosk'; }
    catch {}
    // Fallback to Web Speech API
    this.backend = this.backend || 'web';
    this.initialized = true;
    return { status: 'ok', module: 'STTManager', backend: this.backend };
  }

  /**
   * Transcribe audio file to text
   */
  async transcribe(audioPath, { language = 'auto', model = 'base' } = {}) {
    try {
      if (this.backend === 'whisper') {
        return this._transcribeWhisper(audioPath, language, model);
      } else if (this.backend === 'vosk') {
        return this._transcribeVosk(audioPath, language);
      }
      return { success: false, error: 'No STT backend available. Install whisper.cpp or vosk.' };
    } catch (err) {
      this.stats.failed++;
      return { success: false, error: err.message };
    }
  }

  _transcribeWhisper(audioPath, language, model) {
    // All args as array — no shell string interpolation, no injection risk
    const args = ['--model', String(model), '--output-format', 'txt'];
    if (language !== 'auto') args.push('--language', String(language));
    args.push('--', audioPath);
    const output = execFileSync('whisper-cpp', args, { encoding: 'utf8', timeout: 60000 });
    this.stats.transcriptions++;
    return { success: true, text: output.trim(), backend: 'whisper' };
  }

  _transcribeVosk(audioPath, language) {
    const { Model, KaldiRecognizer } = require('vosk');
    const model = new Model(this.modelPath);
    const rec = new KaldiRecognizer(model, 16000);
    const audio = fs.readFileSync(audioPath);
    rec.acceptWaveform(audio);
    const result = JSON.parse(rec.finalResult());
    this.stats.transcriptions++;
    return { success: true, text: result.text, backend: 'vosk' };
  }

  /**
   * Get available backends
   */
  getBackends() {
    return { whisper: this.backend === 'whisper', vosk: this.backend === 'vosk', web: true };
  }

  getStats() { return { ...this.stats, backend: this.backend, initialized: this.initialized }; }
}

module.exports = STTManager;
