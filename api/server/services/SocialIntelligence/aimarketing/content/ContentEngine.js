/**
 * ContentEngine — Generates content plans from strategy
 * =====================================================
 */

const { createLogger } = require('../logger');
const logger = createLogger('ContentEngine');

class ContentEngine {
  constructor() { this._contentPlans = new Map(); this._calendar = []; }

  generateContentPlan(strategy, options = {}) {
    const id = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const items = [];

    // Generate from strategy content ideas
    for (const idea of strategy.contentIdeas || []) {
      items.push({
        id: `ci_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: idea.type || 'blog_post',
        title: idea.title || '',
        topics: idea.topics || [],
        format: idea.format || 'long_form',
        status: 'planned',
        scheduledDate: this._getNextDate(items.length),
        channel: strategy.channels?.[0]?.source || 'blog',
        targetSegment: strategy.targetAudience?.segments?.[0]?.id,
      });
    }

    // Add social content
    const platforms = strategy.targetAudience?.platforms || ['reddit', 'bluesky'];
    for (const platform of platforms.slice(0, 3)) {
      items.push({
        id: `ci_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'social_post',
        title: `Engage on ${platform}`,
        topics: strategy.targetAudience?.topics?.slice(0, 3) || [],
        format: 'short_form',
        status: 'planned',
        scheduledDate: this._getNextDate(items.length),
        channel: platform,
      });
    }

    const plan = { id, strategyId: strategy.id, items, createdAt: Date.now() };
    this._contentPlans.set(id, plan);
    this._calendar.push(...items);
    logger.info('Content plan generated', { id, items: items.length });
    return plan;
  }

  getContentPlan(id) { return this._contentPlans.get(id) || null; }
  getAllContentPlans() { return Array.from(this._contentPlans.values()); }
  getCalendar() { return this._calendar.sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate)); }

  _getNextDate(index) {
    const date = new Date();
    date.setDate(date.getDate() + index + 1);
    return date.toISOString();
  }
}

module.exports = ContentEngine;
