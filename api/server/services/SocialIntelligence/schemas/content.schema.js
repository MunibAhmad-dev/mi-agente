/**
 * NormalizedContent MongoDB Schema
 * =================================
 * Stores normalized content from all social sources.
 */

let mongoose;
try {
  mongoose = require('mongoose');
} catch {
  mongoose = null;
}

function getContentSchema() {
  if (!mongoose) return null;

  const schema = new mongoose.Schema({
    contentId: { type: String, index: true, unique: true },
    source: { type: String, index: true, required: true },
    sourceId: { type: String, index: true },
    type: { type: String, index: true },
    title: { type: String },
    body: { type: String },
    url: { type: String, index: true },
    author: {
      id: { type: String },
      username: { type: String },
      displayName: { type: String },
      platform: { type: String },
    },
    metrics: {
      likes: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      views: { type: Number, default: 0 },
    },
    topics: [{ type: String }],
    intent: [{ type: String }],
    sentiment: { type: Number, default: 0 },
    language: { type: String, default: 'en' },
    hash: { type: String, index: true },
    tags: [{ type: String }],
    fetchedAt: { type: Date, default: Date.now },
    processedAt: { type: Date },
    normalizedAt: { type: Date, default: Date.now },
  }, { timestamps: true });

  // Compound indexes for common queries
  schema.index({ source: 1, sourceId: 1 });
  schema.index({ source: 1, fetchedAt: -1 });
  schema.index({ topics: 1, fetchedAt: -1 });
  schema.index({ 'author.username': 1, source: 1 });
  schema.index({ hash: 1 });
  schema.index({ fetchedAt: -1 });

  return schema;
}

let ContentModel = null;

function getContentModel() {
  if (ContentModel) return ContentModel;
  if (!mongoose) {
    try { mongoose = require('mongoose'); } catch { return null; }
  }
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    return null;
  }
  try {
    ContentModel = mongoose.model('SocialContent');
  } catch {
    const schema = getContentSchema();
    if (!schema) return null;
    ContentModel = mongoose.model('SocialContent', schema, 'social_content');
  }
  return ContentModel;
}

module.exports = { getContentModel, getContentSchema };
