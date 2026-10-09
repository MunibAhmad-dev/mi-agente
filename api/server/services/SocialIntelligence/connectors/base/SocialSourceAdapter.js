/**
 * SocialSourceAdapter — Abstract Base Class
 * ===========================================
 * Every social connector must extend this class and implement all methods.
 * This is the universal contract for the connector SDK.
 *
 * FLUJO:
 *   ConnectorRegistry → SocialSourceAdapter.search() → Normalization → Pipeline
 */

const { ConnectorStatus, Source } = require('../../types');
const { createLogger } = require('../../logger');

class SocialSourceAdapter {
  /**
   * @param {object} options
   * @param {string} options.id - Unique connector identifier
   * @param {string} options.name - Human-readable name
   * @param {string} options.version - Semantic version
   * @param {string} options.source - Source constant from types.Source
   */
  constructor(options = {}) {
    this.id = options.id || 'unknown';
    this.name = options.name || 'Unknown Connector';
    this.version = options.version || '1.0.0';
    this.source = options.source || Source.WEB;
    this.status = ConnectorStatus.DISABLED;
    this.logger = createLogger(`Connector:${this.id}`);
    this._lastHealthCheck = null;
    this._errorCount = 0;
    this._successCount = 0;
    this._lastError = null;
  }

  // ─── MANIFEST ────────────────────────────────────────────────

  /**
   * Returns the connector manifest declaring capabilities, limits, auth, etc.
   * @returns {object} Manifest
   */
  getManifest() {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      source: this.source,
      capabilities: {
        search: false,
        profiles: false,
        posts: false,
        comments: false,
        communities: false,
        relationships: false,
        media: false,
        history: false,
        streaming: false,
        firehose: false,
      },
      authentication: { type: 'none' },
      vendor_cost: 0,
      vendor_quota: null,
      platform_limits: {},
      license: 'MIT',
      data_types: [],
      retention: 'public_only',
      risk: 'low',
      health: { checkInterval: 300000 },
      fallbacks: [],
    };
  }

  // ─── CORE METHODS ────────────────────────────────────────────

  /**
   * Initialize the connector. Called once at startup.
   * Must set status to HEALTHY or throw.
   */
  async initialize() {
    this.status = ConnectorStatus.HEALTHY;
    this.logger.info('Connector initialized', { id: this.id });
  }

  /**
   * Search for content matching a query.
   * @param {string} query - Search query
   * @param {object} options - { maxResults, languages, timeRange, filters }
   * @returns {Promise<Array>} Array of raw content objects (connector-specific format)
   */
  async search(query, options = {}) {
    throw new Error(`search() not implemented in ${this.id}`);
  }

  /**
   * Fetch specific content by IDs.
   * @param {string[]} ids - Content IDs to fetch
   * @returns {Promise<Array>} Array of raw content objects
   */
  async fetchContent(ids) {
    throw new Error(`fetchContent() not implemented in ${this.id}`);
  }

  /**
   * Fetch author/account information.
   * @param {string} authorId - Author identifier
   * @returns {Promise<object|null>} Raw account data or null
   */
  async fetchAuthor(authorId) {
    throw new Error(`fetchAuthor() not implemented in ${this.id}`);
  }

  /**
   * Fetch community/group information.
   * @param {string} communityId - Community identifier
   * @returns {Promise<object|null>} Raw community data or null
   */
  async fetchCommunity(communityId) {
    throw new Error(`fetchCommunity() not implemented in ${this.id}`);
  }

  /**
   * Fetch interactions (replies, likes, shares) for content.
   * @param {string} contentId - Content identifier
   * @param {object} options - { maxResults, type }
   * @returns {Promise<Array>} Array of interaction objects
   */
  async fetchInteractions(contentId, options = {}) {
    return [];
  }

  /**
   * Search for accounts/profiles.
   * @param {string} query - Search query
   * @param {object} options - { maxResults, filters }
   * @returns {Promise<Array>} Array of raw account objects
   */
  async searchProfiles(query, options = {}) {
    return [];
  }

  /**
   * Search for communities/groups.
   * @param {string} query - Search query
   * @param {object} options - { maxResults }
   * @returns {Promise<Array>} Array of raw community objects
   */
  async searchCommunities(query, options = {}) {
    return [];
  }

  // ─── HEALTH ──────────────────────────────────────────────────

  /**
   * Check connector health. Must set status and return health info.
   * @returns {Promise<object>} Health report
   */
  async healthCheck() {
    const now = Date.now();
    this._lastHealthCheck = now;
    return {
      connectorId: this.id,
      status: this.status,
      lastCheck: now,
      errorCount: this._errorCount,
      successCount: this._successCount,
      lastError: this._lastError,
      latency: 0,
    };
  }

  // ─── LIFECYCLE ───────────────────────────────────────────────

  /**
   * Shutdown the connector gracefully.
   */
  async shutdown() {
    this.status = ConnectorStatus.DISABLED;
    this.logger.info('Connector shut down', { id: this.id });
  }

  // ─── HELPERS ─────────────────────────────────────────────────

  /**
   * Record a successful operation.
   */
  _recordSuccess() {
    this._successCount++;
    if (this.status === ConnectorStatus.UNHEALTHY) {
      this.status = ConnectorStatus.HEALTHY;
    }
  }

  /**
   * Record a failed operation.
   */
  _recordError(error) {
    this._errorCount++;
    this._lastError = { message: error.message, timestamp: Date.now() };
    if (this._errorCount > 10) {
      this.status = ConnectorStatus.UNHEALTHY;
    } else if (this._errorCount > 3) {
      this.status = ConnectorStatus.DEGRADED;
    }
  }

  /**
   * Build a standardized HTTP request with timeout.
   */
  async _fetch(url, options = {}) {
    const timeout = options.timeout || 15000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': 'mi-agent-social/1.0',
          Accept: 'application/json',
          ...(options.headers || {}),
        },
      });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }
}

module.exports = SocialSourceAdapter;
