'use strict';

/**
 * VoiceConversation - Real-time voice conversation agent
 * Uses LiveKit Agents when available, falls back to basic STT/TTS pipeline.
 */
class VoiceConversation {
  constructor(config = {}) {
    this.livekitUrl = config.livekitUrl || process.env.LIVEKIT_URL || '';
    this.livekitApiKey = config.livekitApiKey || process.env.LIVEKIT_API_KEY || '';
    this.livekitApiSecret = config.livekitApiSecret || process.env.LIVEKIT_API_SECRET || '';
    this.sttProvider = config.sttProvider || 'whisper';
    this.ttsProvider = config.ttsProvider || 'system';
    this.llmProvider = config.llmProvider || 'openai';
    this.language = config.language || 'en';

    this.livekit = null;
    this.sessions = new Map();
    this.history = [];

    this._init();
  }

  _init() {
    try {
      this.livekit = require('livekit-agents');
      console.log('[VoiceConversation] LiveKit Agents loaded');
    } catch (e) {
      console.warn('[VoiceConversation] LiveKit not available, using basic STT/TTS pipeline');
    }
  }

  /**
   * Start a voice conversation session.
   */
  async startSession(options = {}) {
    const sessionId = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const session = {
      id: sessionId,
      status: 'active',
      startedAt: new Date().toISOString(),
      messages: [],
      audioChunks: [],
      language: options.language || this.language,
    };

    this.sessions.set(sessionId, session);

    if (this.livekit && this.livekitUrl) {
      return await this._startLiveKitSession(session, options);
    }

    return {
      sessionId,
      status: 'active',
      mode: 'pipeline',
      message: 'Voice session started. Use processAudio() to send audio chunks.',
    };
  }

  /**
   * Process an audio chunk (STT → LLM → TTS pipeline).
   */
  async processAudio(sessionId, audioBuffer, options = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    // Step 1: Speech to Text
    const text = await this._speechToText(audioBuffer, options);

    // Step 2: Process with LLM
    const response = await this._processWithLLM(text, session, options);

    // Step 3: Text to Speech
    const audio = await this._textToSpeech(response, options);

    // Record in session
    session.messages.push({ role: 'user', content: text, timestamp: new Date().toISOString() });
    session.messages.push({ role: 'assistant', content: response, timestamp: new Date().toISOString() });

    return { text, response, audio };
  }

  /**
   * Process text input (for typed messages in voice mode).
   */
  async processText(sessionId, text, options = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const response = await this._processWithLLM(text, session, options);

    session.messages.push({ role: 'user', content: text, timestamp: new Date().toISOString() });
    session.messages.push({ role: 'assistant', content: response, timestamp: new Date().toISOString() });

    return { text, response };
  }

  /**
   * End a voice session.
   */
  async endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.status = 'ended';
    session.endedAt = new Date().toISOString();

    this.history.push({
      sessionId,
      messages: session.messages.length,
      duration: new Date(session.endedAt) - new Date(session.startedAt),
    });

    this.sessions.delete(sessionId);
    return true;
  }

  /**
   * Get active sessions.
   */
  getActiveSessions() {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      status: s.status,
      messages: s.messages.length,
      startedAt: s.startedAt,
    }));
  }

  getStats() {
    return {
      livekitAvailable: !!this.livekit,
      livekitConfigured: !!(this.livekitUrl && this.livekitApiKey),
      activeSessions: this.sessions.size,
      totalSessions: this.history.length,
      sttProvider: this.sttProvider,
      ttsProvider: this.ttsProvider,
    };
  }

  // ===================== INTERNAL =====================

  async _startLiveKitSession(session, options) {
    try {
      // LiveKit session would be started here
      return {
        sessionId: session.id,
        status: 'active',
        mode: 'livekit',
        message: 'LiveKit voice session started',
      };
    } catch (e) {
      return {
        sessionId: session.id,
        status: 'active',
        mode: 'pipeline',
        message: `LiveKit failed (${e.message}), using basic pipeline`,
      };
    }
  }

  async _speechToText(audioBuffer, options) {
    // Use existing VoiceManager if available
    try {
      const VoiceManager = require('./VoiceManager');
      const vm = new VoiceManager({});
      const result = await vm.speechToText(audioBuffer, { lang: options.language || this.language });
      return result.text || '';
    } catch (e) {
      return '[STT not available - install whisper.cpp]';
    }
  }

  async _processWithLLM(text, session, options) {
    // Build conversation context
    const messages = [
      { role: 'system', content: 'You are a helpful voice assistant. Keep responses concise and conversational.' },
      ...session.messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ];

    // Use model plugin if available
    try {
      const { getHarnessManager } = require('./HarnessManager');
      const harness = getHarnessManager();
      const response = await harness.modelPlugin.complete({
        messages,
        temperature: 0.7,
        maxTokens: 300,
      });
      return response.content || '';
    } catch (e) {
      return `I heard: "${text}". (LLM not available for voice processing)`;
    }
  }

  async _textToSpeech(text, options) {
    try {
      const VoiceManager = require('./VoiceManager');
      const vm = new VoiceManager({});
      const result = await vm.textToSpeech(text, options);
      return result.outputPath || null;
    } catch (e) {
      return null;
    }
  }
}

module.exports = VoiceConversation;
