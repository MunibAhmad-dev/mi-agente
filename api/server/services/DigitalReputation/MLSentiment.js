'use strict';

/**
 * MLSentiment — Face 19-20.
 * ML-based sentiment analysis using Ollama (local) as the backbone,
 * replacing keyword-matching with model inference.
 * Falls back gracefully to keyword scoring when Ollama is unavailable.
 */

const axios = require('axios');

const SENTIMENT_LABELS = ['very_negative', 'negative', 'neutral', 'positive', 'very_positive'];

const KEYWORD_FALLBACK = {
  very_negative: ['terrible', 'awful', 'horrible', 'worst', 'disgusting', 'hate', 'fraud', 'scam', 'lie', 'lied'],
  negative: ['bad', 'poor', 'disappointed', 'disappointed', 'wrong', 'fail', 'failed', 'slow', 'broken'],
  positive: ['good', 'great', 'nice', 'happy', 'satisfied', 'helpful', 'excellent', 'recommend', 'love', 'perfect'],
  very_positive: ['amazing', 'outstanding', 'fantastic', 'exceptional', 'incredible', 'best', 'brilliant', 'superb'],
};

function keywordSentiment(text) {
  const lower = text.toLowerCase();
  const scores = { very_negative: 0, negative: 0, neutral: 0, positive: 0, very_positive: 0 };
  for (const [label, words] of Object.entries(KEYWORD_FALLBACK)) {
    scores[label] = words.filter((w) => lower.includes(w)).length;
  }
  scores.neutral = 1;
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const norm = {};
  for (const [k, v] of Object.entries(scores)) norm[k] = v / total;
  const label = Object.entries(norm).sort((a, b) => b[1] - a[1])[0][0];
  const numericMap = { very_negative: -1, negative: -0.5, neutral: 0, positive: 0.5, very_positive: 1 };
  return { label, score: numericMap[label], confidence: norm[label], method: 'keyword_fallback', probabilities: norm };
}

/**
 * Analyze sentiment of text using Ollama inference.
 */
async function analyzeWithOllama(text) {
  const ollamaUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const model = process.env.OLLAMA_SENTIMENT_MODEL || process.env.OLLAMA_MODEL || 'llama3.2';
  const prompt = `Analyze the sentiment of this text. Respond ONLY with JSON in this exact format:
{"label":"<very_negative|negative|neutral|positive|very_positive>","score":<-1.0 to 1.0>,"confidence":<0.0 to 1.0>,"reasoning":"<1 sentence>"}

Text: "${text.substring(0, 500)}"`;

  const resp = await axios.post(
    `${ollamaUrl}/api/generate`,
    { model, prompt, stream: false },
    { timeout: 30000 },
  );

  const raw = resp.data.response || '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Ollama sentiment response');
  const parsed = JSON.parse(jsonMatch[0]);
  if (!SENTIMENT_LABELS.includes(parsed.label)) throw new Error(`Invalid label: ${parsed.label}`);
  return { ...parsed, method: 'ollama', model };
}

/**
 * Analyze sentiment — tries Ollama first, falls back to keyword matching.
 * @param {string} text
 * @param {object} opts
 * @returns {Promise<{label, score, confidence, method, reasoning?}>}
 */
async function analyze(text, opts = {}) {
  if (!text || typeof text !== 'string') {
    return { label: 'neutral', score: 0, confidence: 1, method: 'empty_input' };
  }

  if (opts.force_keyword || process.env.ML_SENTIMENT_MODE === 'keyword') {
    return keywordSentiment(text);
  }

  try {
    return await analyzeWithOllama(text);
  } catch {
    return keywordSentiment(text);
  }
}

/**
 * Batch analyze multiple texts.
 * @param {string[]} texts
 * @returns {Promise<Array>}
 */
async function analyzeBatch(texts) {
  return Promise.all(texts.map((t) => analyze(t)));
}

/**
 * Compute aggregate sentiment stats from an array of sentiment results.
 */
function aggregate(sentiments) {
  if (!sentiments.length) return { avg_score: 0, dominant_label: 'neutral', distribution: {} };
  const avgScore = sentiments.reduce((s, r) => s + (r.score || 0), 0) / sentiments.length;
  const dist = {};
  for (const r of sentiments) dist[r.label] = (dist[r.label] || 0) + 1;
  const dominant = Object.entries(dist).sort((a, b) => b[1] - a[1])[0][0];
  return { avg_score: Math.round(avgScore * 100) / 100, dominant_label: dominant, distribution: dist, count: sentiments.length };
}

module.exports = { analyze, analyzeBatch, aggregate, keywordSentiment, SENTIMENT_LABELS };
