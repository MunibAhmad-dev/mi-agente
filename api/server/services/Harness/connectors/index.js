/**
 * Connectors module — external service integrations.
 */

const { BaseConnector } = require('./BaseConnector');
const { ConnectorManager } = require('./ConnectorManager');

let GmailConnector = null;
try { GmailConnector = require('./GmailConnector').GmailConnector; } catch {}

let SlackConnector = null;
try { SlackConnector = require('./SlackConnector').SlackConnector; } catch {}

let GitHubConnector = null;
try { GitHubConnector = require('./GitHubConnector').GitHubConnector; } catch {}

let CalendarConnector = null;
try { CalendarConnector = require('./CalendarConnector').CalendarConnector; } catch {}

module.exports = {
  BaseConnector,
  ConnectorManager,
  GmailConnector,
  SlackConnector,
  GitHubConnector,
  CalendarConnector,
};
