/**
 * CampaignEngine — Plans, executes, and tracks marketing campaigns
 * =================================================================
 */

const { createLogger } = require('../logger');
const { getCampaignModel } = require('../../schemas/campaign.schema');
const logger = createLogger('CampaignEngine');

class CampaignEngine {
  constructor() { this._campaigns = new Map(); }

  createCampaign({ name, objective, audience, channels, budget = {}, content, startDate, endDate }) {
    const id = `camp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const campaign = {
      campaignId: id, name, description: objective, objective, status: 'draft',
      audience: { segmentIds: audience?.segmentIds || [], description: audience?.description || '' },
      channels: channels || [], content: { planId: content?.planId || '', items: content?.items || [] },
      budget: { total: budget.total || 0, spent: 0 },
      metrics: { impressions: 0, clicks: 0, conversions: 0, revenue: 0, roi: 0 },
      experiments: [], startDate, endDate, createdAt: Date.now(), updatedAt: Date.now(),
    };
    this._campaigns.set(id, campaign);
    this._persist(campaign);
    logger.info('Campaign created', { id, name });
    return campaign;
  }

  updateCampaign(id, updates) {
    const campaign = this._campaigns.get(id);
    if (!campaign) return null;
    Object.assign(campaign, updates, { updatedAt: Date.now() });
    this._persist(campaign);
    return campaign;
  }

  getCampaign(id) { return this._campaigns.get(id) || null; }
  getAllCampaigns() { return Array.from(this._campaigns.values()); }

  getCampaignSummary() {
    const campaigns = this.getAllCampaigns();
    return {
      total: campaigns.length,
      byStatus: campaigns.reduce((a, c) => { a[c.status] = (a[c.status] || 0) + 1; return a; }, {}),
      totalBudget: campaigns.reduce((a, c) => a + (c.budget?.total || 0), 0),
      totalSpent: campaigns.reduce((a, c) => a + (c.budget?.spent || 0), 0),
    };
  }

  async _persist(campaign) {
    const Model = getCampaignModel();
    if (!Model) return;
    try {
      await Model.findOneAndUpdate({ campaignId: campaign.campaignId }, { $set: campaign }, { upsert: true });
    } catch (err) { logger.error('Campaign persist failed', { error: err.message }); }
  }
}

module.exports = CampaignEngine;
