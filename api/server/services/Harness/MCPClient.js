/**
 * MCPClient.js — MCP Client for External Server Connections
 * 
 * Connect to external MCP servers:
 * - Discover available tools
 * - Call remote tools
 * - Access remote resources
 * - Manage multiple server connections
 * 
 * License: MIT
 * RAM: ~3MB
 */

const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[MCPClient]', ...args),
    info: (...args) => console.info('[MCPClient]', ...args),
    warn: (...args) => console.warn('[MCPClient]', ...args),
    error: (...args) => console.error('[MCPClient]', ...args),
};

class MCPClient extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'MCPClient';
        this._servers = new Map(); // serverUrl -> { client, tools, resources }
        this._mcpSDK = null;
        this._init();
    }

    _init() {
        try {
            this._mcpSDK = require('@modelcontextprotocol/sdk');
            logger.info('MCP SDK loaded for client');
        } catch (e) {
            logger.warn('MCP SDK not available for client');
        }
    }

    /**
     * Connect to an MCP server.
     */
    async connect(serverUrl, options = {}) {
        if (this._servers.has(serverUrl)) {
            logger.warn(`Already connected to ${serverUrl}`);
            return this._servers.get(serverUrl);
        }

        if (!this._mcpSDK) {
            logger.error('Cannot connect: MCP SDK not available');
            return null;
        }

        try {
            const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
            const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');

            const transport = new SSEClientTransport(new URL(serverUrl));
            const client = new Client(
                { name: options.name || 'harness-client', version: '1.0.0' },
                { capabilities: options.capabilities || {} }
            );

            await client.connect(transport);

            // Discover tools and resources
            const toolsResult = await client.request({ method: 'tools/list' });
            const resourcesResult = await client.request({ method: 'resources/list' });

            const serverInfo = {
                client,
                transport,
                url: serverUrl,
                tools: toolsResult.tools || [],
                resources: resourcesResult.resources || [],
                connectedAt: Date.now()
            };

            this._servers.set(serverUrl, serverInfo);
            logger.info(`Connected to MCP server: ${serverUrl} (${serverInfo.tools.length} tools, ${serverInfo.resources.length} resources)`);
            this.emit('connected', { url: serverUrl, tools: serverInfo.tools.length });

            return serverInfo;
        } catch (err) {
            logger.error(`Failed to connect to ${serverUrl}: ${err.message}`);
            return null;
        }
    }

    /**
     * Disconnect from an MCP server.
     */
    async disconnect(serverUrl) {
        const server = this._servers.get(serverUrl);
        if (!server) return false;

        try {
            await server.transport.close();
            this._servers.delete(serverUrl);
            logger.info(`Disconnected from ${serverUrl}`);
            this.emit('disconnected', { url: serverUrl });
            return true;
        } catch (err) {
            logger.error(`Error disconnecting from ${serverUrl}: ${err.message}`);
            return false;
        }
    }

    /**
     * List all tools from all connected servers.
     */
    listAllTools() {
        const allTools = [];
        for (const [url, server] of this._servers) {
            for (const tool of server.tools) {
                allTools.push({
                    ...tool,
                    serverUrl: url,
                    fullName: `${url}::${tool.name}`
                });
            }
        }
        return allTools;
    }

    /**
     * List all resources from all connected servers.
     */
    listAllResources() {
        const allResources = [];
        for (const [url, server] of this._servers) {
            for (const resource of server.resources) {
                allResources.push({
                    ...resource,
                    serverUrl: url
                });
            }
        }
        return allResources;
    }

    /**
     * Call a tool on a specific server.
     */
    async callTool(serverUrl, toolName, args = {}) {
        const server = this._servers.get(serverUrl);
        if (!server) {
            throw new Error(`Not connected to server: ${serverUrl}`);
        }

        try {
            const result = await server.client.request({
                method: 'tools/call',
                params: { name: toolName, arguments: args }
            });

            logger.info(`Called ${toolName} on ${serverUrl}`);
            return result;
        } catch (err) {
            logger.error(`Error calling ${toolName}: ${err.message}`);
            throw err;
        }
    }

    /**
     * Call a tool by searching all connected servers.
     */
    async callToolAuto(toolName, args = {}) {
        for (const [url, server] of this._servers) {
            const tool = server.tools.find(t => t.name === toolName);
            if (tool) {
                return this.callTool(url, toolName, args);
            }
        }
        throw new Error(`Tool not found on any connected server: ${toolName}`);
    }

    /**
     * Read a resource from a server.
     */
    async readResource(serverUrl, uri) {
        const server = this._servers.get(serverUrl);
        if (!server) {
            throw new Error(`Not connected to server: ${serverUrl}`);
        }

        try {
            const result = await server.client.request({
                method: 'resources/read',
                params: { uri }
            });

            return result;
        } catch (err) {
            logger.error(`Error reading resource ${uri}: ${err.message}`);
            throw err;
        }
    }

    /**
     * Get status of all connections.
     */
    getStatus() {
        const connections = [];
        for (const [url, server] of this._servers) {
            connections.push({
                url,
                tools: server.tools.length,
                resources: server.resources.length,
                connectedAt: server.connectedAt,
                uptime: Date.now() - server.connectedAt
            });
        }

        return {
            sdkAvailable: !!this._mcpSDK,
            connections: connections.length,
            servers: connections
        };
    }

    /**
     * Disconnect from all servers.
     */
    async disconnectAll() {
        const urls = [...this._servers.keys()];
        for (const url of urls) {
            await this.disconnect(url);
        }
    }
}

module.exports = MCPClient;
