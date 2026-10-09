/**
 * NormalizedAccount MongoDB Schema
 * =================================
 * Stores normalized accounts from all social sources.
 */

let mongoose;
try {
  mongoose = require('mongoose');
} catch {
  mongoose = null;
}

function getAccountSchema() {
  if (!mongoose) return null;

  const schema = new mongoose.Schema({
    accountId: { type: String, index: true, unique: true },
    platform: { type: String, index: true, required: true },
    platformId: { type: String, index: true },
    username: { type: String, index: true },
    displayName: { type: String },
    bio: { type: String },
    url: { type: String },
    avatarUrl: { type: String },
    type: { type: String, default: 'person' },
    followers: { type: Number, default: 0 },
    following: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
    topics: [{ type: String }],
    activityScore: { type: Number, default: 0 },
    contentCount: { type: Number, default: 0 },
    avgEngagement: { type: Number, default: 0 },
    lastActiveAt: { type: Date },
    fetchedAt: { type: Date, default: Date.now },
  }, { timestamps: true });

  schema.index({ platform: 1, username: 1 });
  schema.index({ platform: 1, followers: -1 });
  schema.index({ topics: 1 });
  schema.index({ activityScore: -1 });

  return schema;
}

let AccountModel = null;

function getAccountModel() {
  if (AccountModel) return AccountModel;
  if (!mongoose) {
    try { mongoose = require('mongoose'); } catch { return null; }
  }
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    return null;
  }
  try {
    AccountModel = mongoose.model('SocialAccount');
  } catch {
    const schema = getAccountSchema();
    if (!schema) return null;
    AccountModel = mongoose.model('SocialAccount', schema, 'social_accounts');
  }
  return AccountModel;
}

module.exports = { getAccountModel, getAccountSchema };
