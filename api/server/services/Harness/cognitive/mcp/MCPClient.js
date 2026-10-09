/**
 * MCPClient.js — Model Context Protocol Client
 * 
 * Connects to MCP servers for extended tool capabilities:
 * - Connects to local or remote MCP servers
 * - Discovers available tools from servers
 * - Routes tool calls to appropriate MCP servers
 * - Manages server lifecycle (start, stop, restart)
 * - Supports stdio and SSE transports
 */

const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const logger = {
    debug: (...args) => console.log('[MCPClient]', ...args),
    info: (...args) => console.info('[MCPClient]', ...args),
    warn: (...args) => console.warn('[MCPClient]', ...args),
    error: (...args) => console.error('[MCPClient]', ...args),
};

/**
 * MCP protocol message IDs
 */
let messageId = 1;
function nextId() { return messageId++; }

/**
 * Transport: stdio (spawns a process)
 */
class StdioTransport {
    constructor(command, args = [], env = {}) {
        this.command = command;
        this.args = args;
        this.env = { ...process.env, ...env };
        this.process = null;
        this._buffer = '';
        this._pending = new Map();
        this._onNotification = null;
    }

    async start() {
        return new Promise((resolve, reject) => {
            try {
                this.process = spawn(this.command, this.args, {
                    env: this.env,
                    stdio: ['pipe', 'pipe', 'pipe'],
                    shell: process.platform === 'win32',
                });

                this.process.stdout.on('data', (data) => {
                    this._buffer += data.toString();
                    this._processBuffer();
                });

                this.process.stderr.on('data', (data) => {
                    logger.debug(`[MCPClient:stdio] stderr: ${data.toString().trim()}`);
                });

                this.process.on('error', (err) => {
                    logger.error(`[MCPClient:stdio] Process error: ${err.message}`);
                    reject(err);
                });

                this.process.on('exit', (code) => {
                    logger.warn(`[MCPClient:stdio] Process exited with code ${code}`);
                });

                // Give it a moment to start
                setTimeout(resolve, 500);
            } catch (err) {
                reject(err);
            }
        });
    }

    _processBuffer() {
        // MCP uses JSON-RPC with newline delimiters
        const lines = this._buffer.split('\n');
        this._buffer = lines.pop() || '';
        
        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const msg = JSON.parse(line);
                if (msg.id !== undefined && this._pending.has(msg.id)) {
                    const { resolve, reject } = this._pending.get(msg.id);
                    this._pending.delete(msg.id);
                    if (msg.error) {
                        reject(new Error(msg.error.message || 'MCP error'));
                    } else {
                        resolve(msg.result);
                    }
                } else if (msg.method && this._onNotification) {
                    this._onNotification(msg);
                }
            } catch (e) {
                // Not JSON, skip
            }
        }
    }

    async sendRequest(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = nextId();
            const msg = { jsonrpc: '2.0', id, method, params };
            
            this._pending.set(id, { resolve, reject });
            
            // Timeout after 30s
            setTimeout(() => {
                if (this._pending.has(id)) {
                    this._pending.delete(id);
                    reject(new Error(`MCP request timed out: ${method}`));
                }
            }, 30000);

            try {
                this.process.stdin.write(JSON.stringify(msg) + '\n');
            } catch (err) {
                this._pending.delete(id);
                reject(err);
            }
        });
    }

    onNotification(handler) {
        this._onNotification = handler;
    }

    async stop() {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
    }
}

/**
 * Transport: SSE (Server-Sent Events over HTTP)
 */
class SSETransport {
    constructor(url) {
        this.url = url;
        this._pending = new Map();
        this._onNotification = null;
        this._connected = false;
    }

    async start() {
        // Simple HTTP POST for JSON-RPC
        this._connected = true;
        return true;
    }

    async sendRequest(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = nextId();
            const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
            
            const url = new URL(this.url);
            const transport = url.protocol === 'https:' ? https : http;
            
            const req = transport.request({
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const msg = JSON.parse(data);
                        if (msg.error) reject(new Error(msg.error.message));
                        else resolve(msg.result);
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            
            req.on('error', reject);
            req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
            req.write(body);
            req.end();
        });
    }

    onNotification(handler) { this._onNotification = handler; }
    async stop() { this._connected = false; }
}

/**
 * MCPClient — Main client class
 */
class MCPClient extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'MCPClient';
        this._servers = new Map();        // serverId -> { transport, tools, config }
        this._toolToServer = new Map();    // toolName -> serverId
        this._configPath = config.configPath || path.join(process.cwd(), '.mcp.json');
        this._autoConnect = config.autoConnect !== false;
    }

    /**
     * Load MCP server configuration from file
     */
    loadConfig() {
        try {
            if (fs.existsSync(this._configPath)) {
                const raw = fs.readFileSync(this._configPath, 'utf-8');
                const config = JSON.parse(raw);
                logger.info(`[MCPClient] Loaded config with ${Object.keys(config.mcpServers || {}).length} servers`);
                return config;
            }
        } catch (e) {
            logger.warn(`[MCPClient] Failed to load config: ${e.message}`);
        }
        return { mcpServers: {} };
    }

    /**
     * Save MCP server configuration
     */
    saveConfig(config) {
        try {
            fs.writeFileSync(this._configPath, JSON.stringify(config, null, 2), 'utf-8');
            return true;
        } catch (e) {
            logger.error(`[MCPClient] Failed to save config: ${e.message}`);
            return false;
        }
    }

    /**
     * Register an MCP server
     */
    async addServer(serverId, serverConfig) {
        const { command, args = [], url, env = {}, autoStart = true } = serverConfig;
        
        let transport;
        if (url) {
            transport = new SSETransport(url);
        } else if (command) {
            transport = new StdioTransport(command, args, env);
        } else {
            throw new Error(`MCP server ${serverId} must have either 'command' or 'url'`);
        }

        this._servers.set(serverId, {
            transport,
            config: serverConfig,
            tools: [],
            connected: false,
        });

        if (autoStart) {
            await this.connectServer(serverId);
        }

        return true;
    }

    /**
     * Connect to a specific MCP server
     */
    async connectServer(serverId) {
        const server = this._servers.get(serverId);
        if (!server) throw new Error(`Server ${serverId} not found`);

        try {
            await server.transport.start();
            server.connected = true;

            // Initialize MCP connection
            const initResult = await server.transport.sendRequest('initialize', {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'AI-OS MCPClient', version: '1.0.0' },
            });

            // List available tools
            const toolsResult = await server.transport.sendRequest('tools/list', {});
            server.tools = (toolsResult.tools || []).map(tool => ({
                ...tool,
                _serverId: serverId,
            }));

            // Register tools in lookup
            for (const tool of server.tools) {
                this._toolToServer.set(tool.name, serverId);
            }

            logger.info(`[MCPClient] Connected to ${serverId}: ${server.tools.length} tools discovered`);
            this.emit('connected', { serverId, toolCount: server.tools.length });

            return { success: true, tools: server.tools.length };
        } catch (err) {
            server.connected = false;
            logger.error(`[MCPClient] Failed to connect to ${serverId}: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    /**
     * Disconnect from a server
     */
    async disconnectServer(serverId) {
        const server = this._servers.get(serverId);
        if (!server) return;
        
        await server.transport.stop();
        server.connected = false;
        
        // Remove tools from lookup
        for (const tool of server.tools) {
            this._toolToServer.delete(tool.name);
        }
        server.tools = [];
        
        this.emit('disconnected', { serverId });
    }

    /**
     * Get all discovered tools from all connected servers
     */
    getAllTools() {
        const tools = [];
        for (const [serverId, server] of this._servers) {
            if (server.connected) {
                tools.push(...server.tools);
            }
        }
        return tools;
    }

    /**
     * Get tool definitions in OpenAI format
     */
    getToolDefinitions() {
        return this.getAllTools().map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description || `MCP tool: ${tool.name}`,
                parameters: tool.inputSchema || { type: 'object', properties: {} },
            },
        }));
    }

    /**
     * Call a tool on the appropriate MCP server
     */
    async callTool(toolName, params = {}) {
        const serverId = this._toolToServer.get(toolName);
        if (!serverId) throw new Error(`No MCP server provides tool: ${toolName}`);

        const server = this._servers.get(serverId);
        if (!server || !server.connected) throw new Error(`MCP server ${serverId} not connected`);

        const startTime = Date.now();
        try {
            const result = await server.transport.sendRequest('tools/call', {
                name: toolName,
                arguments: params,
            });
            
            const duration = Date.now() - startTime;
            logger.info(`[MCPClient] Tool ${toolName} completed in ${duration}ms`);
            
            return {
                success: true,
                result: result.content || result,
                duration,
                serverId,
            };
        } catch (err) {
            return { success: false, error: err.message, serverId };
        }
    }

    /**
     * Check if a tool name is provided by any MCP server
     */
    hasTool(toolName) {
        return this._toolToServer.has(toolName);
    }

    /**
     * Get status of all servers
     */
    getStatus() {
        const status = {};
        for (const [serverId, server] of this._servers) {
            status[serverId] = {
                connected: server.connected,
                toolCount: server.tools.length,
                tools: server.tools.map(t => t.name),
                config: {
                    command: server.config.command,
                    url: server.config.url,
                },
            };
        }
        return status;
    }

    /**
     * Connect all servers from config
     */
    async connectAll() {
        const config = this.loadConfig();
        const servers = config.mcpServers || {};
        const results = {};
        
        for (const [serverId, serverConfig] of Object.entries(servers)) {
            try {
                await this.addServer(serverId, serverConfig);
                results[serverId] = { success: true };
            } catch (err) {
                results[serverId] = { success: false, error: err.message };
            }
        }
        
        return results;
    }

    /**
     * Disconnect all servers
     */
    async disconnectAll() {
        for (const [serverId] of this._servers) {
            await this.disconnectServer(serverId);
        }
    }

    /**
     * Get API routes for dashboard
     */
    getRoutes() {
        return [
            { method: 'GET', path: '/api/mcp/status', description: 'Get all MCP server statuses' },
            { method: 'POST', path: '/api/mcp/connect/:id', description: 'Connect to an MCP server' },
            { method: 'POST', path: '/api/mcp/disconnect/:id', description: 'Disconnect from an MCP server' },
            { method: 'POST', path: '/api/mcp/call/:tool', description: 'Call an MCP tool' },
            { method: 'GET', path: '/api/mcp/tools', description: 'List all MCP tools' },
        ];
    }
}

module.exports = { MCPClient, StdioTransport, SSETransport };
module.exports.default = MCPClient;
