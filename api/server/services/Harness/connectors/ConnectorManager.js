/**
 * ConnectorManager — Unified framework for managing service connectors.
 *
 * Responsibilities:
 *   - Register/unregister connectors
 *   - Manage auth tokens (from env vars or runtime)
 *   - Convert connector actions to LLM tool definitions
 *   - Execute connector actions with routing
 *   - Health checks across all connectors
 *   - Audit logging
 *
 * Environment variables:
 *   GMAIL_API_KEY        — Gmail OAuth2 token
 *   SLACK_BOT_TOKEN      — Slack bot token (xoxb-...)
 *   GITHUB_TOKEN         — GitHub personal access token
 *   GOOGLE_CALENDAR_TOKEN — Google Calendar OAuth2 token
 */

let BaseConnectorClass = null;
try { BaseConnectorClass = require('./BaseConnector').BaseConnector; } catch {}

let GmailConnectorClass = null;
try { GmailConnectorClass = require('./GmailConnector').GmailConnector; } catch {}

let SlackConnectorClass = null;
try { SlackConnectorClass = require('./SlackConnector').SlackConnector; } catch {}

let GitHubConnectorClass = null;
try { GitHubConnectorClass = require('./GitHubConnector').GitHubConnector; } catch {}

let CalendarConnectorClass = null;
try { CalendarConnectorClass = require('./CalendarConnector').CalendarConnector; } catch {}

const logger = {
  info: (...args) => console.info('[ConnectorManager]', ...args),
  warn: (...args) => console.warn('[ConnectorManager]', ...args),
  error: (...args) => console.error('[ConnectorManager]', ...args),
};

/**
 * ConnectorManager — manages all service connectors.
 */
class ConnectorManager {
  constructor(config = {}) {
    this.config = {
      enableAutoRegister: config.enableAutoRegister !== false,
      ...config,
    };

    this._connectors = new Map();
    this._stats = { totalActions: 0, byConnector: {} };

    // Auto-register available connectors
    if (this.config.enableAutoRegister) {
      this._autoRegister();
    }
  }

  /**
   * Auto-register connectors based on available tokens.
   */
  _autoRegister() {
    // Gmail
    if (GmailConnectorClass && (process.env.GMAIL_API_KEY || process.env.GMAIL_TOKEN)) {
      const conn = new GmailConnectorClass(this.config);
      conn.setToken(process.env.GMAIL_API_KEY || process.env.GMAIL_TOKEN);
      this.register(conn);
    }

    // Slack
    if (SlackConnectorClass && (process.env.SLACK_BOT_TOKEN || process.env.SLACK_TOKEN)) {
      const conn = new SlackConnectorClass(this.config);
      conn.setToken(process.env.SLACK_BOT_TOKEN || process.env.SLACK_TOKEN);
      this.register(conn);
    }

    // GitHub
    if (GitHubConnectorClass && process.env.GITHUB_TOKEN) {
      const conn = new GitHubConnectorClass(this.config);
      conn.setToken(process.env.GITHUB_TOKEN);
      this.register(conn);
    }

    // Calendar
    if (CalendarConnectorClass && (process.env.GOOGLE_CALENDAR_TOKEN || process.env.CALENDAR_TOKEN)) {
      const conn = new CalendarConnectorClass(this.config);
      conn.setToken(process.env.GOOGLE_CALENDAR_TOKEN || process.env.CALENDAR_TOKEN);
      this.register(conn);
    }
  }

  /**
   * Register a connector.
   */
  register(connector) {
    if (!connector || typeof connector.getId !== 'function') {
      throw new Error('Invalid connector: must extend BaseConnector');
    }
    this._connectors.set(connector.getId(), connector);
    logger.info(`[ConnectorManager] Registered: ${connector.getName()} (${connector.getId()})`);
  }

  /**
   * Unregister a connector.
   */
  unregister(connectorId) {
    this._connectors.delete(connectorId);
    logger.info(`[ConnectorManager] Unregistered: ${connectorId}`);
  }

  /**
   * Get a connector by ID.
   */
  get(connectorId) {
    return this._connectors.get(connectorId);
  }

  /**
   * Execute a connector action.
   */
  async execute(connectorId, action, params = {}) {
    const connector = this._connectors.get(connectorId);
    if (!connector) {
      throw new Error(`Connector "${connectorId}" not found. Available: ${this.listIds().join(', ')}`);
    }

    this._stats.totalActions++;
    this._stats.byConnector[connectorId] = (this._stats.byConnector[connectorId] || 0) + 1;

    return connector.execute(action, params);
  }

  /**
   * Convert all connectors to LLM tool definitions.
   */
  getToolDefinitions() {
    const tools = [];

    for (const [id, connector] of this._connectors) {
      for (const action of connector.getActions()) {
        tools.push({
          type: 'function',
          function: {
            name: `${id}_${action.name}`,
            description: `[${connector.getName()}] ${action.description}`,
            parameters: {
              type: 'object',
              properties: {
                ...this._paramsToSchema(action.params),
              },
              required: action.params.filter(p => p !== 'maxResults' && p !== 'count'),
            },
          },
        });
      }
    }

    return tools;
  }

  /**
   * Execute a tool call from LLM (parses tool name to connector + action).
   */
  async executeTool(toolName, params) {
    const underscoreIdx = toolName.indexOf('_');
    if (underscoreIdx === -1) {
      throw new Error(`Invalid connector tool name: ${toolName}`);
    }
    const connectorId = toolName.substring(0, underscoreIdx);
    const action = toolName.substring(underscoreIdx + 1);
    return this.execute(connectorId, action, params);
  }

  /**
   * Health check all connectors.
   */
  async healthCheckAll() {
    const results = {};
    for (const [id, connector] of this._connectors) {
      try {
        results[id] = await connector.healthCheck();
      } catch (error) {
        results[id] = { healthy: false, error: error.message };
      }
    }
    return results;
  }

  /**
   * List registered connector IDs.
   */
  listIds() {
    return Array.from(this._connectors.keys());
  }

  /**
   * Get all registered connectors info.
   */
  listAll() {
    return Array.from(this._connectors.values()).map(c => ({
      id: c.getId(),
      name: c.getName(),
      actions: c.getActions().map(a => a.name),
      hasToken: !!c.getToken(),
    }));
  }

  /**
   * Get stats.
   */
  getStats() {
    return {
      ...this._stats,
      connectors: this.listIds(),
    };
  }

  /**
   * Convert param names to JSON Schema properties.
   */
  _paramsToSchema(params) {
    const schema = {};
    for (const param of params) {
      schema[param] = { type: 'string', description: param };
    }
    return schema;
  }
}

module.exports = { ConnectorManager };
