/**
 * Campaign MongoDB Schema
 * =======================
 * Stores marketing campaigns.
 */

let mongoose;
try { mongoose = require('mongoose'); } catch { mongoose = null; }

function getCampaignSchema() {
  if (!mongoose) return null;
  const schema = new mongoose.Schema({
    campaignId: { type: String, index: true, unique: true },
    name: { type: String, required: true },
    description: { type: String },
    objective: { type: String },
    status: { type: String, default: 'draft', index: true },
    audience: {
      segmentIds: [{ type: String }],
      description: { type: String },
    },
    channels: [{ type: String }],
    content: {
      planId: { type: String },
      items: [{ type: mongoose.Schema.Types.Mixed }],
    },
    budget: {
      total: { type: Number, default: 0 },
      spent: { type: Number, default: 0 },
    },
    metrics: {
      impressions: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
      roi: { type: Number, default: 0 },
    },
    experiments: [{ type: String }],
    startDate: { type: Date },
    endDate: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  }, { timestamps: true });
  schema.index({ status: 1 });
  schema.index({ createdAt: -1 });
  return schema;
}

let CampaignModel = null;
function getCampaignModel() {
  if (CampaignModel) return CampaignModel;
  if (!mongoose) { try { mongoose = require('mongoose'); } catch { return null; } }
  if (!mongoose.connection || mongoose.connection.readyState !== 1) return null;
  try { CampaignModel = mongoose.model('MarketingCampaign'); } catch {
    const s = getCampaignSchema();
    if (!s) return null;
    CampaignModel = mongoose.model('MarketingCampaign', s, 'marketing_campaigns');
  }
  return CampaignModel;
}

module.exports = { getCampaignModel, getCampaignSchema };
