'use strict';

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * VoiceManager - TTS (Text-to-Speech) + STT (Speech-to-Text)
 *
 * TTS: Kokoro-82M (Apache-2.0, 82M params, CPU OK)
 * STT: Whisper.cpp (MIT, CPU, local)
 *
 * Both work offline with no API keys required.
 * Gracefully degrades if tools are not installed.
 */
class VoiceManager {
  constructor(config = {}) {
    this.ttsEngine = config.ttsEngine || 'kokoro'; // kokoro, piper, system
    this.sttEngine = config.sttEngine || 'whisper'; // whisper, system
    this.outputDir = config.outputDir || './data/voice';
    this.whisperModel = config.whisperModel || 'base'; // tiny, base, small, medium, large
    this.ttsVoice = config.ttsVoice || 'af_heart'; // Kokoro voice
    this.ttsSpeed = config.ttsSpeed || 1.0;
    this.sampleRate = config.sampleRate || 24000;

    this.kokoroAvailable = false;
    this.whisperAvailable = false;
    this.systemTTSAvailable = false;

    this._detectEngines();
  }

  _detectEngines() {
    // Check Kokoro
    try {
      this.kokoroAvailable = true;
      console.log('[Voice] Kokoro TTS available (python)');
    } catch (e) {
      console.warn('[Voice] Kokoro TTS not detected');
    }

    // Check Whisper.cpp
    try {
      const result = execSync('whisper-cli --help 2>&1 || whisper --help 2>&1', {
        encoding: 'utf-8',
        timeout: 5000
      });
      this.whisperAvailable = true;
      console.log('[Voice] Whisper.cpp available');
    } catch (e) {
      console.warn('[Voice] Whisper.cpp not detected');
    }

    // Check system TTS (Windows/Linux/Mac)
    try {
      if (process.platform === 'win32') {
        execSync('where powershell', { encoding: 'utf-8', timeout: 3000 });
        this.systemTTSAvailable = true;
      } else if (process.platform === 'darwin') {
        execSync('which say', { encoding: 'utf-8', timeout: 3000 });
        this.systemTTSAvailable = true;
      } else {
        execSync('which espeak || which espeak-ng', { encoding: 'utf-8', timeout: 3000 });
        this.systemTTSAvailable = true;
      }
      console.log('[Voice] System TTS available');
    } catch (e) {
      console.warn('[Voice] System TTS not detected');
    }

    // Ensure output directory
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  // ===================== TTS (Text-to-Speech) =====================

  /**
   * Convert text to speech.
   */
  async textToSpeech(text, options = {}) {
    const engine = options.engine || this.ttsEngine;
    const outputPath = options.outputPath || path.join(this.outputDir, `tts_${Date.now()}.wav`);

    switch (engine) {
      case 'kokoro':
        return await this._ttsKokoro(text, outputPath, options);
      case 'system':
        return await this._ttsSystem(text, outputPath, options);
      default:
        return await this._ttsSystem(text, outputPath, options);
    }
  }

  /**
   * TTS using Kokoro-82M (Python).
   */
  async _ttsKokoro(text, outputPath, options) {
    const voice = options.voice || this.ttsVoice;
    const speed = options.speed || this.ttsSpeed;

    // Python script to generate TTS
    const pyScript = `
import sys
try:
    from kokoro import KPipeline
    pipeline = KPipeline(lang_code='a')
    generator = pipeline(
        ${JSON.stringify(text)},
        voice='${voice}',
        speed=${speed}
    )
    import wave
    import struct

    audio_chunks = []
    for i, (gs, ps, audio) in enumerate(generator):
        audio_chunks.append(audio)

    if audio_chunks:
        import numpy as np
        full_audio = np.concatenate(audio_chunks)
        import soundfile as sf
        sf.write('${outputPath.replace(/\\/g, '\\\\')}', full_audio, ${this.sampleRate})
        print(f'OK:{len(full_audio)/${this.sampleRate}}s')
    else:
        print('ERROR:No audio generated')
except ImportError as e:
    print(f'MISSING:{e}')
except Exception as e:
    print(f'ERROR:{e}')
`;

    const tmpScript = path.join(os.tmpdir(), 'kokoro_tts.py');
    fs.writeFileSync(tmpScript, pyScript);

    try {
      const output = execSync(`python "${tmpScript}"`, {
        encoding: 'utf-8',
        timeout: 30000
      }).trim();

      fs.unlinkSync(tmpScript);

      if (output.startsWith('OK:')) {
        const duration = output.substring(3);
        return {
          success: true,
          engine: 'kokoro',
          outputPath,
          duration: parseFloat(duration) || 0,
          voice,
          speed
        };
      } else if (output.startsWith('MISSING:')) {
        return this._ttsSystem(text, outputPath, options);
      } else {
        throw new Error(output);
      }
    } catch (err) {
      fs.unlinkSync(tmpScript);
      console.warn('[Voice] Kokoro failed, falling back to system TTS:', err.message);
      return await this._ttsSystem(text, outputPath, options);
    }
  }

  /**
   * TTS using system tools (Windows/Linux/Mac).
   */
  async _ttsSystem(text, outputPath, options) {
    try {
      if (process.platform === 'win32') {
        // Windows: PowerShell SpeechSynthesis
        const psScript = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SetOutputToWaveFile('${outputPath.replace(/\\/g, '\\\\')}')
$synth.Speak(${JSON.stringify(text)})
$synth.SetOutputToNull()
`;
        execSync(`powershell -Command "${psScript.replace(/"/g, '\\"')}"`, {
          encoding: 'utf-8',
          timeout: 30000
        });
      } else if (process.platform === 'darwin') {
        // macOS: say command
        execSync(`say -o "${outputPath}" "${text.replace(/"/g, '\\"')}"`, {
          encoding: 'utf-8',
          timeout: 30000
        });
      } else {
        // Linux: espeak/espeak-ng
        execSync(`espeak -w "${outputPath}" "${text.replace(/"/g, '\\"')}"`, {
          encoding: 'utf-8',
          timeout: 30000
        });
      }

      const stats = fs.existsSync(outputPath) ? fs.statSync(outputPath) : null;
      return {
        success: true,
        engine: 'system',
        outputPath,
        fileSize: stats ? stats.size : 0,
        voice: 'system-default'
      };
    } catch (err) {
      return { success: false, engine: 'system', error: err.message };
    }
  }

  // ===================== STT (Speech-to-Text) =====================

  /**
   * Convert speech/audio to text.
   */
  async speechToText(audioPath, options = {}) {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const engine = options.engine || this.sttEngine;

    switch (engine) {
      case 'whisper':
        return await this._sttWhisper(audioPath, options);
      default:
        return await this._sttWhisper(audioPath, options);
    }
  }

  /**
   * STT using Whisper.cpp.
   */
  async _sttWhisper(audioPath, options) {
    const model = options.model || this.whisperModel;
    const lang = options.lang || 'auto';
    const outputPath = options.outputPath || audioPath.replace(/\.\w+$/, '.txt');
    const format = options.format || 'txt'; // txt, srt, vtt, json, tsv

    try {
      const langFlag = lang === 'auto' ? '' : `--language ${lang}`;
      const cmd = `whisper-cli -m ${model} -f "${audioPath}" ${langFlag} --output-format ${format} --output-dir "${path.dirname(outputPath)}"`;

      const result = execSync(cmd, {
        encoding: 'utf-8',
        timeout: 120000
      });

      // Read the output file
      const textFile = audioPath.replace(/\.\w+$/, `.${format}`);
      let text = '';
      if (fs.existsSync(textFile)) {
        text = fs.readFileSync(textFile, 'utf-8');
      }

      return {
        success: true,
        engine: 'whisper',
        model,
        text: text.trim(),
        audioPath,
        format,
        lang
      };
    } catch (err) {
      console.warn('[Voice] Whisper failed:', err.message);
      return {
        success: false,
        engine: 'whisper',
        error: err.message,
        suggestion: 'Install whisper.cpp: brew install whisper.cpp'
      };
    }
  }

  // ===================== Utilities =====================

  /**
   * Get available voices for TTS.
   */
  getVoices() {
    const kokoroVoices = [
      'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica',
      'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
      'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam',
      'am_michael', 'am_onyx', 'am_puck', 'am_santa'
    ];

    return {
      kokoro: {
        available: this.kokoroAvailable,
        voices: kokoroVoices,
        defaultVoice: this.ttsVoice,
        languages: ['en-US', 'ja-JP', 'zh-CN', 'es-ES', 'fr-FR', 'de-DE', 'it-IT', 'pt-BR']
      },
      system: {
        available: this.systemTTSAvailable,
        platform: process.platform
      }
    };
  }

  /**
   * Get available STT models.
   */
  getSTTModels() {
    return {
      whisper: {
        available: this.whisperAvailable,
        models: ['tiny', 'base', 'small', 'medium', 'large'],
        defaultModel: this.whisperModel,
        description: {
          tiny: '~75MB, fastest, least accurate',
          base: '~142MB, good balance',
          small: '~466MB, better accuracy',
          medium: '~1.5GB, high accuracy',
          large: '~3GB, best accuracy, slow'
        }
      }
    };
  }

  /**
   * Get voice system status.
   */
  getStatus() {
    return {
      tts: {
        kokoro: this.kokoroAvailable,
        system: this.systemTTSAvailable,
        engine: this.ttsEngine
      },
      stt: {
        whisper: this.whisperAvailable,
        engine: this.sttEngine,
        model: this.whisperModel
      },
      outputDir: this.outputDir,
      platform: process.platform
    };
  }
}

module.exports = VoiceManager;
