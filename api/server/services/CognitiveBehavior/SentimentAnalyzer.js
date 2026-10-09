'use strict';

/**
 * SentimentAnalyzer — Gen B output phase.
 * Analyzes sentiment and emotional tone of prompts and responses
 * to allow the agent to adapt its behavior accordingly.
 *
 * Keyword patterns:
 *   frustration  — damn, not working, why won't, useless, broken, terrible
 *   satisfaction — thanks, great, perfect, works, awesome, excellent
 *   confusion    — don't understand, confused, unclear, what does, how does
 *   urgency      — urgent, asap, immediately, right now, critical
 */

const SENTIMENT_PATTERNS = {
  frustration: {
    positive: [
      /\bdamn\b/i, /\bnot working\b/i, /\bwhy won'?t\b/i, /\buseless\b/i,
      /\bbroken\b/i, /\bterrible\b/i, /\bfrustrat/i, /\bannoy/i, /\bhate this\b/i,
      /\bstupid\b/i, /\bwaste of time\b/i, /\bdoesn'?t work\b/i, /\bwon'?t work\b/i,
      /\bnothing works\b/i, /\bimpossible\b/i,
    ],
    weight: -0.7,
    emotion: 'frustration',
  },
  satisfaction: {
    positive: [
      /\bthanks?\b/i, /\bgreat\b/i, /\bperfect\b/i, /\bworks?\b/i,
      /\bawesome\b/i, /\bexcellent\b/i, /\bwonderful\b/i, /\blovely\b/i,
      /\bnice\b/i, /\bhelpful\b/i, /\bappreciat/i, /\bthank you\b/i,
      /\bwell done\b/i, /\bexactly\b/i, /\bwhat i needed\b/i,
    ],
    weight: 0.7,
    emotion: 'satisfaction',
  },
  confusion: {
    positive: [
      /\bdon'?t understand\b/i, /\bconfused?\b/i, /\bunclear\b/i,
      /\bwhat does\b/i, /\bhow does\b/i, /\bwhat is\b/i, /\bnot sure\b/i,
      /\bcan you explain\b/i, /\belaborate\b/i, /\bclarif/i, /\bwhat do you mean\b/i,
    ],
    weight: -0.3,
    emotion: 'confusion',
  },
  urgency: {
    positive: [
      /\burgent\b/i, /\basap\b/i, /\bimmediately\b/i, /\bright now\b/i,
      /\bcritical\b/i, /\bemergency\b/i, /\bdeadline\b/i, /\bquickly\b/i,
      /\bhurry\b/i, /\btime.sensitive\b/i, /\bcan'?t wait\b/i,
    ],
    weight: -0.2,
    emotion: 'urgency',
  },
};

const POSITIVE_WORDS = /\bgood\b|\bnice\b|\bhappy\b|\bgreat\b|\bexcellent\b|\bwonderful\b|\bamazing\b|\bfantastic\b|\bsuperb\b|\bhelpful\b|\bthank/i;
const NEGATIVE_WORDS = /\bbad\b|\bterrible\b|\bawful\b|\bhorrible\b|\bdisappoint/i;

function computeBaseScore(text) {
  if (!text) return 0;
  const posMatches = (text.match(POSITIVE_WORDS) || []).length;
  const negMatches = (text.match(NEGATIVE_WORDS) || []).length;
  return Math.max(-1, Math.min(1, (posMatches - negMatches) * 0.2));
}

function countPatternMatches(text, patterns) {
  return patterns.reduce((count, pattern) => {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    return count + (pattern.test(text) ? 1 : 0);
  }, 0);
}

class SentimentAnalyzer {
  constructor() {
    this.stats = { analyses: 0, frustrationDetections: 0 };
    // sessionId → [{ score, sentiment, timestamp }]
    this._sessionMoods = new Map();
  }

  /**
   * Analyze sentiment and emotional tone of text.
   * @param {string} text
   * @returns {{ sentiment: string, score: number, emotions: object, confidence: number }}
   */
  analyze(text) {
    try {
      this.stats.analyses++;
      if (!text || typeof text !== 'string') {
        return { sentiment: 'neutral', score: 0, emotions: { frustration: 0, satisfaction: 0, confusion: 0, urgency: 0 }, confidence: 0 };
      }

      const emotions = { frustration: 0, satisfaction: 0, confusion: 0, urgency: 0 };
      let scoreAdjustment = computeBaseScore(text);

      for (const [emotionKey, config] of Object.entries(SENTIMENT_PATTERNS)) {
        const hits = countPatternMatches(text, config.positive);
        if (hits > 0) {
          emotions[emotionKey] = Math.min(1, hits * 0.25);
          scoreAdjustment += config.weight * emotions[emotionKey];
        }
      }

      const score = Math.max(-1, Math.min(1, scoreAdjustment));

      let sentiment;
      if (score > 0.15) sentiment = 'positive';
      else if (score < -0.15) sentiment = 'negative';
      else sentiment = 'neutral';

      // Confidence based on how many patterns fired
      const totalHits = Object.values(emotions).reduce((s, v) => s + v, 0);
      const confidence = Math.min(1, 0.4 + totalHits * 0.3);

      const result = {
        sentiment,
        score: Math.round(score * 100) / 100,
        emotions,
        confidence: Math.round(confidence * 100) / 100,
      };

      return result;
    } catch (err) {
      return { sentiment: 'neutral', score: 0, emotions: { frustration: 0, satisfaction: 0, confusion: 0, urgency: 0 }, confidence: 0, error: err.message };
    }
  }

  /**
   * Detect user frustration signals in text.
   * @param {string} text
   * @returns {boolean}
   */
  detectFrustration(text) {
    try {
      if (!text) return false;
      const hits = countPatternMatches(text, SENTIMENT_PATTERNS.frustration.positive);
      if (hits > 0) this.stats.frustrationDetections++;
      return hits >= 1;
    } catch (_) {
      return false;
    }
  }

  /**
   * Determine if the agent should adjust its tone.
   * @param {'positive'|'negative'|'neutral'} userSentiment
   * @param {'positive'|'negative'|'neutral'} responseSentiment
   * @returns {{ adjust: boolean, suggestion: string }}
   */
  shouldAdjustTone(userSentiment, responseSentiment) {
    try {
      if (userSentiment === 'negative' && responseSentiment !== 'positive') {
        return {
          adjust: true,
          suggestion: 'User seems frustrated or negative. Respond with extra empathy, patience, and a solution-focused tone.',
        };
      }
      if (userSentiment === 'positive' && responseSentiment === 'negative') {
        return {
          adjust: true,
          suggestion: 'User is positive but response tone is negative. Lighten the response to match user energy.',
        };
      }
      if (userSentiment === 'neutral' && responseSentiment === 'negative') {
        return {
          adjust: true,
          suggestion: 'Neutral user, negative-toned response. Aim for a more balanced and constructive tone.',
        };
      }
      return { adjust: false, suggestion: 'Tone is appropriate for the context.' };
    } catch (err) {
      return { adjust: false, suggestion: err.message };
    }
  }

  /**
   * Record a sentiment reading for a session and return the rolling mood.
   * @param {string} sessionId
   * @param {{ score: number, sentiment: string }} reading - pass null to just read
   * @returns {{ sentiment: string, avgScore: number, trend: string, samples: number }}
   */
  getSessionMood(sessionId, reading) {
    try {
      if (!sessionId) return { sentiment: 'neutral', avgScore: 0, trend: 'stable', samples: 0 };

      if (!this._sessionMoods.has(sessionId)) {
        this._sessionMoods.set(sessionId, []);
      }

      const history = this._sessionMoods.get(sessionId);

      // Optionally record a new reading
      if (reading && typeof reading.score === 'number') {
        history.push({ score: reading.score, sentiment: reading.sentiment, ts: Date.now() });
        // Keep last 20 readings
        if (history.length > 20) history.splice(0, history.length - 20);
      }

      if (history.length === 0) {
        return { sentiment: 'neutral', avgScore: 0, trend: 'stable', samples: 0 };
      }

      const avgScore = history.reduce((s, r) => s + r.score, 0) / history.length;
      let sentiment;
      if (avgScore > 0.15) sentiment = 'positive';
      else if (avgScore < -0.15) sentiment = 'negative';
      else sentiment = 'neutral';

      // Trend: compare first half vs second half
      let trend = 'stable';
      if (history.length >= 4) {
        const half = Math.floor(history.length / 2);
        const earlyAvg = history.slice(0, half).reduce((s, r) => s + r.score, 0) / half;
        const lateAvg = history.slice(half).reduce((s, r) => s + r.score, 0) / (history.length - half);
        if (lateAvg - earlyAvg > 0.15) trend = 'improving';
        else if (earlyAvg - lateAvg > 0.15) trend = 'declining';
      }

      return {
        sentiment,
        avgScore: Math.round(avgScore * 100) / 100,
        trend,
        samples: history.length,
      };
    } catch (err) {
      return { sentiment: 'neutral', avgScore: 0, trend: 'stable', samples: 0, error: err.message };
    }
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getSentimentAnalyzer() {
  if (!_instance) _instance = new SentimentAnalyzer();
  return _instance;
}

module.exports = { SentimentAnalyzer, getSentimentAnalyzer };
