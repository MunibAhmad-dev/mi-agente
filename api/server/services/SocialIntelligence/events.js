/**
 * Social Intelligence Event Types
 * =================================
 * Events published/subscribed by the social intelligence subsystem.
 * Integrates with the existing EventBus.
 */

const SocialEventType = Object.freeze({
  // Connector events
  CONNECTOR_REGISTERED: 'social.connector_registered',
  CONNECTOR_HEALTH_CHANGED: 'social.connector_health_changed',
  CONNECTOR_RATE_LIMITED: 'social.connector_rate_limited',

  // Ingestion events
  SEARCH_STARTED: 'social.search_started',
  SEARCH_COMPLETED: 'social.search_completed',
  CONTENT_DISCOVERED: 'social.content_discovered',
  CONTENT_FETCHED: 'social.content_fetched',
  INGESTION_STARTED: 'social.ingestion_started',
  INGESTION_COMPLETED: 'social.ingestion_completed',
  INGESTION_FAILED: 'social.ingestion_failed',

  // Processing events
  CONTENT_NORMALIZED: 'social.content_normalized',
  CONTENT_DEDUPED: 'social.content_deduped',
  ENTITY_RESOLVED: 'social.entity_resolved',
  TOPIC_EXTRACTED: 'social.topic_extracted',

  // Intelligence events
  SIGNAL_EXTRACTED: 'social.signal_extracted',
  EVIDENCE_CREATED: 'social.evidence_created',
  INTENT_DETECTED: 'social.intent_detected',
  TREND_DETECTED: 'social.trend_detected',

  // Audience events
  SEGMENT_CREATED: 'social.segment_created',
  SEGMENT_UPDATED: 'social.segment_updated',
  AUDIENCE_UPDATED: 'social.audience_updated',
  CREATOR_DISCOVERED: 'social.creator_discovered',
  COMMUNITY_DISCOVERED: 'social.community_discovered',

  // Opportunity events
  OPPORTUNITY_DETECTED: 'social.opportunity_detected',
  OPPORTUNITY_SCORED: 'social.opportunity_scored',
  OPPORTUNITY_PRIORITIZED: 'social.opportunity_prioritized',

  // Marketing events
  STRATEGY_CREATED: 'marketing.strategy_created',
  CONTENT_PLAN_CREATED: 'marketing.content_plan_created',
  CAMPAIGN_CREATED: 'marketing.campaign_created',
  CAMPAIGN_UPDATED: 'marketing.campaign_updated',
  EXPERIMENT_CREATED: 'marketing.experiment_created',
  EXPERIMENT_COMPLETED: 'marketing.experiment_completed',
  ANALYTICS_UPDATED: 'marketing.analytics_updated',

  // Graph events
  GRAPH_NODE_ADDED: 'social.graph_node_added',
  GRAPH_EDGE_ADDED: 'social.graph_edge_added',
  GRAPH_COMMUNITY_DETECTED: 'social.graph_community_detected',
});

/**
 * Create a social intelligence event payload.
 */
function createSocialEvent(eventType, payload, source = 'social-intelligence') {
  return {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    eventType,
    version: '1.0.0',
    timestamp: Date.now(),
    source,
    payload,
    correlationId: payload.correlationId || `corr_${Date.now()}`,
    causationId: payload.causationId || null,
  };
}

module.exports = { SocialEventType, createSocialEvent };
