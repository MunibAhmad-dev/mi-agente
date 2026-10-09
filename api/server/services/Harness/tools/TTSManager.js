'use strict';

/**
 * TTSManager - Text-to-Speech using edge-tts (free) and Web Speech API
 */
class TTSManager {
  constructor(config = {}) {
    this.outputDir = config.outputDir || './audio';
    this.defaultVoice = config.voice || 'en-US-AriaNeural';
  }

  async synthesize(text, options = {}) {
    const { voice = this.defaultVoice } = options;
    try {
      const { execFileSync } = require('child_process');
      const fs = require('fs');
      if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
      const outputPath = `${this.outputDir}/tts_${Date.now()}.mp3`;
      // edge-tts is a free Microsoft Edge TTS CLI — args passed as array, no shell injection
      execFileSync('edge-tts', ['--voice', voice, '--text', text, '--write-media', outputPath], { timeout: 30000 });
      return { success: true, path: outputPath, voice };
    } catch (err) {
      return { success: false, error: err.message, fallback: 'Use Web Speech API in browser' };
    }
  }

  async getVoices() {
    try {
      const { execFileSync } = require('child_process');
      const output = execFileSync('edge-tts', ['--list-voices'], { timeout: 10000 }).toString();
      const voices = [];
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('Name:')) voices.push(line.split('Name:')[1].trim());
      }
      return { success: true, voices };
    } catch (err) {
      return { success: true, voices: ['en-US-AriaNeural', 'es-ES-ElviraNeural', 'fr-FR-DeniseNeural'] };
    }
  }

  getStats() {
    return { defaultVoice: this.defaultVoice, provider: 'edge-tts' };
  }
}

module.exports = TTSManager;
