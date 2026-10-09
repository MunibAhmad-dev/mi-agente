/**
 * AudienceSegment MongoDB Schema
 * ===============================
 * Stores audience segments and digital twins.
 */

let mongoose;
try { mongoose = require('mongoose'); } catch { mongoose = null; }

function getAudienceSchema() {
  if (!mongoose) return null;
  const schema = new mongoose.Schema({
    segmentId: { type: String, index: true, unique: true },
    name: { type: String, required: true },
    description: { type: String },
    method: { type: String, default: 'rule_based' },
    rules: { type: mongoose.Schema.Types.Mixed, default: {} },
    topics: [{ type: String }],
    keywords: [{ type: String }],
    platforms: [{ type: String }],
    size: { type: Number, default: 0 },
    confidence: { type: Number, default: 0.5 },
    accountIds: [{ type: String }],
    contentIds: [{ type: String }],
    digitalTwin: {
      topics: [{ type: String }],
      needs: [{ type: String }],
      questions: [{ type: String }],
      preferences: { type: mongoose.Schema.Types.Mixed, default: {} },
      creators: [{ type: String }],
      communities: [{ type: String }],
      intent: [{ type: String }],
      trends: [{ type: String }],
      contentPreferences: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  }, { timestamps: true });
  schema.index({ name: 1 });
  schema.index({ size: -1 });
  schema.index({ topics: 1 });
  return schema;
}

let AudienceModel = null;
function getAudienceModel() {
  if (AudienceModel) return AudienceModel;
  if (!mongoose) { try { mongoose = require('mongoose'); } catch { return null; } }
  if (!mongoose.connection || mongoose.connection.readyState !== 1) return null;
  try { AudienceModel = mongoose.model('SocialAudienceSegment'); } catch {
    const s = getAudienceSchema();
    if (!s) return null;
    AudienceModel = mongoose.model('SocialAudienceSegment', s, 'social_audience_segments');
  }
  return AudienceModel;
}

module.exports = { getAudienceModel, getAudienceSchema };
