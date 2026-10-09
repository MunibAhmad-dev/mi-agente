/**
 * Community MongoDB Schema
 * ========================
 * Stores normalized community data.
 */

let mongoose;
try { mongoose = require('mongoose'); } catch { mongoose = null; }

function getCommunitySchema() {
  if (!mongoose) return null;
  const schema = new mongoose.Schema({
    communityId: { type: String, index: true, unique: true },
    platform: { type: String, index: true },
    platformId: { type: String },
    name: { type: String },
    description: { type: String },
    url: { type: String },
    members: { type: Number, default: 0 },
    activity: { type: String, default: 'low' },
    topics: [{ type: String }],
    rules: [{ type: String }],
    healthScore: { type: Number, default: 0.5 },
    growthRate: { type: Number, default: 0 },
    unansweredQuestions: { type: Number, default: 0 },
    topContributors: [{ type: String }],
    fetchedAt: { type: Date, default: Date.now },
  }, { timestamps: true });
  schema.index({ platform: 1, name: 1 });
  schema.index({ members: -1 });
  schema.index({ topics: 1 });
  schema.index({ healthScore: -1 });
  return schema;
}

let CommunityModel = null;
function getCommunityModel() {
  if (CommunityModel) return CommunityModel;
  if (!mongoose) { try { mongoose = require('mongoose'); } catch { return null; } }
  if (!mongoose.connection || mongoose.connection.readyState !== 1) return null;
  try { CommunityModel = mongoose.model('SocialCommunity'); } catch {
    const s = getCommunitySchema();
    if (!s) return null;
    CommunityModel = mongoose.model('SocialCommunity', s, 'social_communities');
  }
  return CommunityModel;
}

module.exports = { getCommunityModel, getCommunitySchema };
