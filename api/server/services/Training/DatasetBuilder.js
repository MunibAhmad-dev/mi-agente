'use strict';

/**
 * DatasetBuilder — Face 15-16: Automatic dataset creation from chat history.
 *
 * Exports high-quality conversations (high evaluation score) from MongoDB
 * in alpaca/sharegpt format for LoRA fine-tuning via Unsloth.
 *
 * Alpaca format:   { instruction, input, output }
 * ShareGPT format: { conversations: [{ from, value }] }
 */
const mongoose = require('mongoose');

const MIN_QUALITY_SCORE = 0.7; // Only export conversations with score >= 0.7

/**
 * Load the Message model from the existing LibreChat schema.
 * Uses the model registered by LibreChat's own data layer.
 */
function getMessageModel() {
  if (mongoose.models.Message) {
    return mongoose.models.Message;
  }
  throw new Error('Message model not registered — ensure LibreChat is fully initialized');
}

/**
 * Export conversations in ShareGPT format (multi-turn, system prompt included).
 * ShareGPT is the format expected by Unsloth's chat_template fine-tuning.
 *
 * @param {object} opts
 * @param {number} [opts.minScore] - minimum quality score (0–1)
 * @param {number} [opts.limit] - max conversations to export
 * @param {Date}   [opts.since] - only include convos updated after this date
 * @returns {Promise<{examples: object[], count: number}>}
 */
async function exportShareGPT({ minScore = MIN_QUALITY_SCORE, limit = 500, since } = {}) {
  const Message = getMessageModel();

  const filter = { isCreatedByUser: false };
  if (since) {
    filter.createdAt = { $gte: since };
  }

  // Group messages by conversationId
  const pipeline = [
    { $match: filter },
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: '$conversationId',
        messages: { $push: { role: '$sender', text: '$text', score: '$feedback.rating' } },
        avgScore: { $avg: '$feedback.rating' },
        lastAt: { $max: '$createdAt' },
      },
    },
    { $match: { avgScore: { $gte: minScore } } },
    { $sort: { avgScore: -1 } },
    { $limit: limit },
  ];

  const groups = await Message.aggregate(pipeline);

  const examples = groups.map((g) => {
    const conversations = [];
    for (const msg of g.messages) {
      // Normalize sender → from (gpt/human)
      const from = msg.role === 'user' ? 'human' : 'gpt';
      const value = (msg.text || '').trim();
      if (value) {
        conversations.push({ from, value });
      }
    }
    return {
      conversations,
      metadata: {
        conversationId: g._id,
        avgScore: g.avgScore,
        lastAt: g.lastAt,
      },
    };
  }).filter((e) => e.conversations.length >= 2);

  return { examples, count: examples.length };
}

/**
 * Export conversations in Alpaca format (single-turn instruction/output).
 * Useful for instruction-following fine-tuning.
 *
 * @param {object} opts
 * @returns {Promise<{examples: object[], count: number}>}
 */
async function exportAlpaca({ minScore = MIN_QUALITY_SCORE, limit = 500, since } = {}) {
  const Message = getMessageModel();

  const filter = { isCreatedByUser: false };
  if (since) {
    filter.createdAt = { $gte: since };
  }

  const pipeline = [
    { $match: filter },
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: '$conversationId',
        messages: { $push: { role: '$sender', text: '$text', score: '$feedback.rating' } },
        avgScore: { $avg: '$feedback.rating' },
      },
    },
    { $match: { avgScore: { $gte: minScore } } },
    { $sort: { avgScore: -1 } },
    { $limit: limit },
  ];

  const groups = await Message.aggregate(pipeline);

  const examples = [];
  for (const g of groups) {
    for (let i = 0; i < g.messages.length - 1; i++) {
      const curr = g.messages[i];
      const next = g.messages[i + 1];
      if (curr.role === 'user' && next.role !== 'user') {
        examples.push({
          instruction: (curr.text || '').trim(),
          input: '',
          output: (next.text || '').trim(),
        });
      }
    }
  }

  return { examples, count: examples.length };
}

/**
 * Get dataset statistics without exporting the full data.
 */
async function getDatasetStats() {
  try {
    const Message = getMessageModel();
    const [total, rated, highQuality] = await Promise.all([
      Message.countDocuments({ isCreatedByUser: false }),
      Message.countDocuments({ 'feedback.rating': { $exists: true } }),
      Message.countDocuments({ 'feedback.rating': { $gte: MIN_QUALITY_SCORE } }),
    ]);
    return {
      total,
      rated,
      highQuality,
      readyForTraining: highQuality >= 10,
      minScoreRequired: MIN_QUALITY_SCORE,
    };
  } catch (e) {
    return { error: e.message, total: 0, rated: 0, highQuality: 0, readyForTraining: false };
  }
}

module.exports = { exportShareGPT, exportAlpaca, getDatasetStats, MIN_QUALITY_SCORE };
