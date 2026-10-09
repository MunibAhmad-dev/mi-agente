/**
 * Opportunity MongoDB Schema
 * ==========================
 * Stores detected opportunities.
 */

let mongoose;
try { mongoose = require('mongoose'); } catch { mongoose = null; }

function getOpportunitySchema() {
  if (!mongoose) return null;
  const schema = new mongoose.Schema({
    opportunityId: { type: String, index: true, unique: true },
    type: { type: String, index: true, required: true },
    title: { type: String },
    description: { type: String },
    signalIds: [{ type: String }],
    evidenceIds: [{ type: String }],
    score: { type: Number, default: 0, index: true },
    demand: { type: Number, default: 0 },
    growth: { type: Number, default: 0 },
    relevance: { type: Number, default: 0 },
    competition: { type: Number, default: 0 },
    confidence: { type: Number, default: 0.5 },
    status: { type: String, default: 'new', index: true },
    topics: [{ type: String }],
    detectedAt: { type: Date, default: Date.now },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  }, { timestamps: true });
  schema.index({ score: -1 });
  schema.index({ type: 1, score: -1 });
  return schema;
}

let OpportunityModel = null;
function getOpportunityModel() {
  if (OpportunityModel) return OpportunityModel;
  if (!mongoose) { try { mongoose = require('mongoose'); } catch { return null; } }
  if (!mongoose.connection || mongoose.connection.readyState !== 1) return null;
  try { OpportunityModel = mongoose.model('SocialOpportunity'); } catch {
    const s = getOpportunitySchema();
    if (!s) return null;
    OpportunityModel = mongoose.model('SocialOpportunity', s, 'social_opportunities');
  }
  return OpportunityModel;
}

module.exports = { getOpportunityModel, getOpportunitySchema };
