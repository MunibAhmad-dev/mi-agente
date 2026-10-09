'use strict';

/**
 * ResponseControlSystem — Gen B Safety Phase 8.
 * Controls response generation parameters dynamically.
 * Profiles map to LLM sampling parameters.
 *
 * Default profiles:
 *   creative    — T=0.9,  maxTokens=1500
 *   precise     — T=0.2,  maxTokens=800
 *   balanced    — T=0.7,  maxTokens=1000
 *   concise     — T=0.5,  maxTokens=200
 *   detailed    — T=0.7,  maxTokens=2000
 */

const DEFAULT_PROFILES = {
  creative: {
    temperature: 0.9,
    maxTokens: 1500,
    topP: 0.95,
    presencePenalty: 0.3,
    description: 'High creativity, wide vocabulary, exploratory responses',
  },
  precise: {
    temperature: 0.2,
    maxTokens: 800,
    topP: 0.85,
    presencePenalty: 0.0,
    description: 'Low temperature for factual, deterministic responses',
  },
  balanced: {
    temperature: 0.7,
    maxTokens: 1000,
    topP: 0.90,
    presencePenalty: 0.1,
    description: 'Balanced between creativity and precision',
  },
  concise: {
    temperature: 0.5,
    maxTokens: 200,
    topP: 0.90,
    presencePenalty: 0.2,
    description: 'Short responses, minimal verbosity',
  },
  detailed: {
    temperature: 0.7,
    maxTokens: 2000,
    topP: 0.92,
    presencePenalty: 0.05,
    description: 'Long, thorough responses with full context',
  },
};

class ResponseControlSystem {
  constructor() {
    // sessionId → current profile name or custom params
    this._sessions = new Map();
    // Custom profiles added via setProfile with custom params
    this._profiles = new Map(Object.entries(DEFAULT_PROFILES));
    this.stats = { paramRequests: 0, profileSets: 0, adaptations: 0 };
  }

  /**
   * Get generation parameters for a session, optionally adapted to context.
   * @param {string} sessionId
   * @param {object} context - { query?, mood?, urgency? }
   * @returns {{ temperature: number, maxTokens: number, topP: number, presencePenalty: number }}
   */
  getParams(sessionId, context = {}) {
    try {
      this.stats.paramRequests++;
      const profileName = (sessionId && this._sessions.get(sessionId)) || 'balanced';
      const profile = this._profiles.get(profileName) || DEFAULT_PROFILES.balanced;
      const params = { ...profile };

      // Context-based micro-adjustments
      if (context.urgency === 'high') {
        params.maxTokens = Math.min(params.maxTokens, 400);
        params.temperature = Math.min(params.temperature, 0.6);
      }
      if (context.mood === 'creative') {
        params.temperature = Math.min(1.0, params.temperature + 0.1);
      }
      if (context.mood === 'analytical') {
        params.temperature = Math.max(0.1, params.temperature - 0.15);
      }

      return {
        temperature: Math.round(params.temperature * 100) / 100,
        maxTokens: Math.round(params.maxTokens),
        topP: Math.round(params.topP * 100) / 100,
        presencePenalty: Math.round(params.presencePenalty * 100) / 100,
        profile: profileName,
      };
    } catch (err) {
      return { temperature: 0.7, maxTokens: 1000, topP: 0.9, presencePenalty: 0.1, error: err.message };
    }
  }

  /**
   * Set the profile for a session.
   * @param {string} sessionId
   * @param {string|object} profile - profile name or custom params object
   * @returns {{ ok: boolean, sessionId: string, profile: string|object }}
   */
  setProfile(sessionId, profile) {
    try {
      if (!sessionId || !profile) {
        return { ok: false, error: 'sessionId and profile are required' };
      }

      if (typeof profile === 'string') {
        if (!this._profiles.has(profile)) {
          return { ok: false, error: `Unknown profile: ${profile}. Available: ${[...this._profiles.keys()].join(', ')}` };
        }
        this._sessions.set(sessionId, profile);
        this.stats.profileSets++;
        return { ok: true, sessionId, profile };
      }

      // Custom params object: store under a generated name
      const customName = `custom_${sessionId}`;
      this._profiles.set(customName, {
        temperature: profile.temperature ?? 0.7,
        maxTokens: profile.maxTokens ?? 1000,
        topP: profile.topP ?? 0.9,
        presencePenalty: profile.presencePenalty ?? 0.1,
        description: 'Custom profile',
      });
      this._sessions.set(sessionId, customName);
      this.stats.profileSets++;
      return { ok: true, sessionId, profile: customName };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Adjust params for a session based on user feedback.
   * @param {string} sessionId
   * @param {string|object} feedback - 'too_long', 'too_short', 'too_formal', 'too_casual', 'too_random', or object
   */
  adapt(sessionId, feedback) {
    try {
      if (!sessionId || !feedback) return { ok: false, error: 'sessionId and feedback required' };

      this.stats.adaptations++;
      const currentProfile = this._sessions.get(sessionId) || 'balanced';
      const base = { ...(this._profiles.get(currentProfile) || DEFAULT_PROFILES.balanced) };

      const fb = typeof feedback === 'string' ? feedback.toLowerCase() : '';

      if (fb === 'too_long') {
        base.maxTokens = Math.max(100, Math.round(base.maxTokens * 0.7));
      } else if (fb === 'too_short') {
        base.maxTokens = Math.min(4000, Math.round(base.maxTokens * 1.4));
      } else if (fb === 'too_random' || fb === 'too_creative') {
        base.temperature = Math.max(0.1, base.temperature - 0.15);
      } else if (fb === 'too_rigid' || fb === 'too_formal') {
        base.temperature = Math.min(1.0, base.temperature + 0.15);
      } else if (typeof feedback === 'object') {
        Object.assign(base, feedback);
      }

      const adaptedName = `adapted_${sessionId}`;
      this._profiles.set(adaptedName, base);
      this._sessions.set(sessionId, adaptedName);

      return { ok: true, sessionId, adaptedProfile: base };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Returns all named profiles with their parameter sets.
   * @returns {Array<{ name, params }>}
   */
  getProfiles() {
    try {
      const profiles = [];
      for (const [name, params] of this._profiles) {
        profiles.push({ name, params });
      }
      return profiles;
    } catch (err) {
      return [];
    }
  }

  getStats() {
    return { ...this.stats, activeSessions: this._sessions.size, profileCount: this._profiles.size };
  }
}

let _instance = null;
function getResponseControlSystem() {
  if (!_instance) _instance = new ResponseControlSystem();
  return _instance;
}

module.exports = { ResponseControlSystem, getResponseControlSystem };
