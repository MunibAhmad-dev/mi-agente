/**
 * Social Intelligence Module — Main Export
 * ==========================================
 * USAIDE: Universal Social Intelligence & Audience Discovery Engine
 *
 * This module provides the complete social intelligence pipeline:
 * Connectors → Normalization → Evidence → Signals → Audience → Opportunities
 */

const config = require('./config');
const { createLogger } = require('./logger');
const { SocialEventType, createSocialEvent } = require('./events');
const types = require('./types');

// Schemas
const { getContentModel } = require('./schemas/content.schema');
const { getAccountModel } = require('./schemas/account.schema');
const { getSignalModel } = require('./schemas/signal.schema');
const { getEvidenceModel } = require('./schemas/evidence.schema');
const { getOpportunityModel } = require('./schemas/opportunity.schema');
const { getAudienceModel } = require('./schemas/audience.schema');
const { getCommunityModel } = require('./schemas/community.schema');
const { getCampaignModel } = require('./schemas/campaign.schema');

const logger = createLogger('SocialIntelligence');

/**
 * Initialize all social intelligence schemas.
 */
function initializeSchemas() {
  const schemas = {
    content: getContentModel(),
    account: getAccountModel(),
    signal: getSignalModel(),
    evidence: getEvidenceModel(),
    opportunity: getOpportunityModel(),
    audience: getAudienceModel(),
    community: getCommunityModel(),
    campaign: getCampaignModel(),
  };
  const initialized = Object.entries(schemas).filter(([, m]) => m !== null);
  logger.info('Schemas initialized', { count: initialized.length });
  return schemas;
}

module.exports = {
  config,
  createLogger,
  SocialEventType,
  createSocialEvent,
  types,
  initializeSchemas,
  getContentModel,
  getAccountModel,
  getSignalModel,
  getEvidenceModel,
  getOpportunityModel,
  getAudienceModel,
  getCommunityModel,
  getCampaignModel,
};
