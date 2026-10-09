const { EventSource } = require('eventsource');
const { Time } = require('librechat-data-provider');
const {
  mcpConfig,
  MCPManager,
  FlowStateManager,
  MCPServersRegistry,
  OAuthReconnectionManager,
} = require('@librechat/api');

global.EventSource = EventSource;

/** @type {FlowStateManager} */
let flowManager = null;
/** @type {FlowStateManager} */
let actionFlowManager = null;

/**
 * Flow manager for MCP OAuth flows. Uses the longer MCP OAuth TTL so the auth
 * button and flow state outlive the user-completion window.
 * @param {Keyv} flowsCache
 * @returns {FlowStateManager}
 */
function getFlowStateManager(flowsCache) {
  if (!flowManager) {
    flowManager = new FlowStateManager(flowsCache, {
      ttl: mcpConfig.OAUTH_FLOW_TTL,
    });
  }
  return flowManager;
}

/**
 * Flow manager for Action (custom tool) OAuth flows. Kept on the shorter TTL so an
 * unclicked action login does not leave the tool call waiting for the MCP OAuth window.
 * @param {Keyv} flowsCache
 * @returns {FlowStateManager}
 */
function getActionFlowStateManager(flowsCache) {
  if (!actionFlowManager) {
    actionFlowManager = new FlowStateManager(flowsCache, {
      ttl: Time.ONE_MINUTE * 3,
    });
  }
  return actionFlowManager;
}

module.exports = {
  createMCPServersRegistry: MCPServersRegistry.createInstance,
  getMCPServersRegistry: MCPServersRegistry.getInstance,
  createMCPManager: MCPManager.createInstance,
  getMCPManager: MCPManager.getInstance,
  // MCPRuntime — Fase 3 policy gateway sobre MCPManager (firewall + retry + audit)
  MCPRuntimeService: require('~/server/services/MCPRuntime/MCPRuntimeService').MCPRuntimeService,
  getMCPRuntime: require('~/server/services/MCPRuntime/MCPRuntimeService').getInstance,
  // ComfyUI — service for image/video generation (MIT-licensed, open-source)
  ComfyUIService: require('~/server/services/ComfyUI').ComfyUIService,
  getComfyUI: require('~/server/services/ComfyUI').getService,
  getFlowStateManager,
  getActionFlowStateManager,
  createOAuthReconnectionManager: OAuthReconnectionManager.createInstance,
  getOAuthReconnectionManager: OAuthReconnectionManager.getInstance,
};
