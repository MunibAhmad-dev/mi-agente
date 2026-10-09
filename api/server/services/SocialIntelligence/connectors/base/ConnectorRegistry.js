/**
 * ConnectorRegistry — Registry of all social source connectors
 * ==============================================================
 * Manages connector lifecycle, health, and routing.
 */

const { ConnectorStatus } = require('../../types');
const { createLogger } = require('../../logger');

const logger = createLogger('ConnectorRegistry');

class ConnectorRegistry {
  constructor() {
    this._connectors = new Map(); // id → SocialSourceAdapter
    this._healthIntervals = new Map(); // id → intervalId
  }

  /**
   * Register a connector.
   * @param {SocialSourceAdapter} connector
   */
  register(connector) {
    if (!connector || !connector.id) {
      throw new Error('Invalid connector: must have an id');
    }
    if (this._connectors.has(connector.id)) {
      logger.warn('Connector already registered, replacing', { id: connector.id });
    }
    this._connectors.set(connector.id, connector);
    logger.info('Connector registered', { id: connector.id, name: connector.name });
  }

  /**
   * Get a connector by ID.
   * @param {string} id
   * @returns {SocialSourceAdapter|null}
   */
  get(id) {
    return this._connectors.get(id) || null;
  }

  /**
   * Get all registered connectors.
   * @returns {SocialSourceAdapter[]}
   */
  getAll() {
    return Array.from(this._connectors.values());
  }

  /**
   * Get all healthy connectors.
   * @returns {SocialSourceAdapter[]}
   */
  getHealthy() {
    return this.getAll().filter(
      (c) => c.status === ConnectorStatus.HEALTHY || c.status === ConnectorStatus.DEGRADED,
    );
  }

  /**
   * Get connectors that support a specific capability.
   * @param {string} capability - e.g. 'search', 'profiles', 'posts'
   * @returns {SocialSourceAdapter[]}
   */
  getByCapability(capability) {
    return this.getHealthy().filter((c) => {
      const manifest = c.getManifest();
      return manifest.capabilities[capability] === true;
    });
  }

  /**
   * Get connector IDs that support a capability.
   * @param {string} capability
   * @returns {string[]}
   */
  getIdsByCapability(capability) {
    return this.getByCapability(capability).map((c) => c.id);
  }

  /**
   * Initialize all registered connectors.
   */
  async initializeAll() {
    const results = [];
    for (const [id, connector] of this._connectors) {
      try {
        await connector.initialize();
        results.push({ id, status: 'ok' });
        logger.info('Connector initialized', { id });
      } catch (error) {
        connector.status = ConnectorStatus.UNHEALTHY;
        results.push({ id, status: 'error', error: error.message });
        logger.error('Connector init failed', { id, error: error.message });
      }
    }
    return results;
  }

  /**
   * Start periodic health checks for all connectors.
   * @param {number} intervalMs - Check interval (default: 5 minutes)
   */
  startHealthChecks(intervalMs = 300000) {
    for (const [id, connector] of this._connectors) {
      const interval = setInterval(async () => {
        try {
          const health = await connector.healthCheck();
          if (health.status === ConnectorStatus.UNHEALTHY) {
            logger.warn('Connector unhealthy', { id, health });
          }
        } catch (err) {
          logger.error('Health check failed', { id, error: err.message });
        }
      }, intervalMs);
      this._healthIntervals.set(id, interval);
    }
  }

  /**
   * Get health status of all connectors.
   * @returns {object[]}
   */
  async getHealthStatus() {
    const statuses = [];
    for (const [id, connector] of this._connectors) {
      try {
        const health = await connector.healthCheck();
        statuses.push(health);
      } catch (err) {
        statuses.push({
          connectorId: id,
          status: ConnectorStatus.UNHEALTHY,
          error: err.message,
        });
      }
    }
    return statuses;
  }

  /**
   * Shutdown all connectors and stop health checks.
   */
  async shutdownAll() {
    for (const [id, intervalId] of this._healthIntervals) {
      clearInterval(intervalId);
    }
    this._healthIntervals.clear();

    for (const [id, connector] of this._connectors) {
      try {
        await connector.shutdown();
      } catch (err) {
        logger.error('Shutdown failed', { id, error: err.message });
      }
    }
    logger.info('All connectors shut down');
  }

  /**
   * Get manifest summary for all connectors.
   */
  getManifests() {
    return this.getAll().map((c) => c.getManifest());
  }
}

// Singleton
let _instance = null;
function getConnectorRegistry() {
  if (!_instance) {
    _instance = new ConnectorRegistry();
  }
  return _instance;
}

module.exports = { ConnectorRegistry, getConnectorRegistry };
