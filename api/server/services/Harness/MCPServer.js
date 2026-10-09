'use strict';

/**
 * MCPServer - Model Context Protocol integration
 * Provides MCP server/client capabilities for connecting external tools.
 * Uses @modelcontextprotocol/sdk when available.
 * 
 * License: MIT
 * RAM: ~5MB
 */
const { EventEmitter } = require('events');

const logger = {
  debug: (...args) => console.log('[MCP]', ...args),
  info: (...args) => console.info('[MCP]', ...args),
  warn: (...args) => console.warn('[MCP]', ...args),
  error: (...args) => console.error('[MCP]', ...args),
};

class MCPServer extends EventEmitter {
  constructor(config = {}) {
    super();
    this.serverName = config.name || 'harness-agent';
    this.serverVersion = config.version || '1.0.0';
    this.port = config.port || 3100;
    this.tools = new Map();
    this.resources = new Map();
    this.prompts = new Map();
    this.mcpSDK = null;
    this.server = null;
    this.transport = null;
    this.clients = new Set();
    this._connectedClients = new Map();

    this._init();
  }

  _init() {
    try {
      this.mcpSDK = require('@modelcontextprotocol/sdk');
      logger.info('MCP SDK loaded successfully');
    } catch (e) {
      logger.warn('MCP SDK not available, using built-in JSON-RPC fallback');
    }
  }

  /**
   * Register a tool with the MCP server.
   */
  registerTool(tool) {
    const { name, description, inputSchema, handler } = tool;

    if (!name || !handler) {
      throw new Error('Tool requires name and handler');
    }

    this.tools.set(name, {
      name,
      description: description || '',
      inputSchema: inputSchema || { type: 'object', properties: {} },
      handler,
      registeredAt: new Date().toISOString()
    });

    console.log(`[MCP] Tool registered: ${name}`);
    return { name, registered: true };
  }

  /**
   * Register a resource (data source).
   */
  registerResource(resource) {
    const { uri, name, description, mimeType, handler } = resource;

    if (!uri || !handler) {
      throw new Error('Resource requires uri and handler');
    }

    this.resources.set(uri, {
      uri,
      name: name || uri,
      description: description || '',
      mimeType: mimeType || 'text/plain',
      handler,
      registeredAt: new Date().toISOString()
    });

    console.log(`[MCP] Resource registered: ${uri}`);
    return { uri, registered: true };
  }

  /**
   * Register a prompt template.
   */
  registerPrompt(prompt) {
    const { name, description, arguments: args, handler } = prompt;

    if (!name || !handler) {
      throw new Error('Prompt requires name and handler');
    }

    this.prompts.set(name, {
      name,
      description: description || '',
      arguments: args || [],
      handler,
      registeredAt: new Date().toISOString()
    });

    console.log(`[MCP] Prompt registered: ${name}`);
    return { name, registered: true };
  }

  /**
   * Handle an MCP request (JSON-RPC 2.0 format).
   */
  async handleRequest(request) {
    const { method, params, id } = request;

    switch (method) {
      case 'initialize':
        return this._handleInitialize(params, id);

      case 'tools/list':
        return this._handleToolsList(id);

      case 'tools/call':
        return await this._handleToolsCall(params, id);

      case 'resources/list':
        return this._handleResourcesList(id);

      case 'resources/read':
        return await this._handleResourcesRead(params, id);

      case 'prompts/list':
        return this._handlePromptsList(id);

      case 'prompts/get':
        return await this._handlePromptsGet(params, id);

      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` }
        };
    }
  }

  _handleInitialize(params, id) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: true, listChanged: true },
          prompts: { listChanged: true }
        },
        serverInfo: {
          name: this.serverName,
          version: this.serverVersion
        }
      }
    };
  }

  _handleToolsList(id) {
    const tools = Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }));

    return { jsonrpc: '2.0', id, result: { tools } };
  }

  async _handleToolsCall(params, id) {
    const { name, arguments: args } = params;
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: `Tool not found: ${name}` }
      };
    }

    try {
      const result = await tool.handler(args || {});
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result)
          }]
        }
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: `Error: ${err.message}`
          }],
          isError: true
        }
      };
    }
  }

  _handleResourcesList(id) {
    const resources = Array.from(this.resources.values()).map(r => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType
    }));

    return { jsonrpc: '2.0', id, result: { resources } };
  }

  async _handleResourcesRead(params, id) {
    const { uri } = params;
    const resource = this.resources.get(uri);

    if (!resource) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: `Resource not found: ${uri}` }
      };
    }

    try {
      const content = await resource.handler();
      return {
        jsonrpc: '2.0',
        id,
        result: {
          contents: [{
            uri,
            mimeType: resource.mimeType,
            text: typeof content === 'string' ? content : JSON.stringify(content)
          }]
        }
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: err.message }
      };
    }
  }

  _handlePromptsList(id) {
    const prompts = Array.from(this.prompts.values()).map(p => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments
    }));

    return { jsonrpc: '2.0', id, result: { prompts } };
  }

  async _handlePromptsGet(params, id) {
    const { name, arguments: args } = params;
    const prompt = this.prompts.get(name);

    if (!prompt) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: `Prompt not found: ${name}` }
      };
    }

    try {
      const result = await prompt.handler(args || {});
      return {
        jsonrpc: '2.0',
        id,
        result: {
          description: prompt.description,
          messages: Array.isArray(result) ? result : [{ role: 'user', content: { type: 'text', text: String(result) } }]
        }
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: err.message }
      };
    }
  }

  /**
   * List all registered tools, resources, prompts.
   */
  listAll() {
    return {
      tools: Array.from(this.tools.keys()),
      resources: Array.from(this.resources.keys()),
      prompts: Array.from(this.prompts.keys()),
      serverInfo: {
        name: this.serverName,
        version: this.serverVersion,
        port: this.port
      }
    };
  }

  /**
   * Get MCP status.
   */
  getStatus() {
    return {
      sdkAvailable: !!this.mcpSDK,
      serverName: this.serverName,
      tools: this.tools.size,
      resources: this.resources.size,
      prompts: this.prompts.size,
      clients: this.clients.size
    };
  }

  // ── SDK-based Server (when @modelcontextprotocol/sdk is available) ──

  /**
   * Start MCP server using official SDK (stdio transport).
   */
  async startStdio() {
    if (!this.mcpSDK) {
      logger.warn('Cannot start stdio server: MCP SDK not available');
      return false;
    }

    try {
      const { Server } = this.mcpSDK;
      const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

      this.server = new Server(
        { name: this.serverName, version: this.serverVersion },
        { capabilities: { tools: {}, resources: {}, prompts: {} } }
      );

      // Register tools handler
      this.server.setRequestHandler('tools/list', async () => ({
        tools: Array.from(this.tools.values()).map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema
        }))
      }));

      this.server.setRequestHandler('tools/call', async (request) => {
        const { name, arguments: args } = request.params;
        const tool = this.tools.get(name);
        if (!tool) throw new Error(`Tool not found: ${name}`);
        const result = await tool.handler(args || {});
        return {
          content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }]
        };
      });

      // Register resources handler
      this.server.setRequestHandler('resources/list', async () => ({
        resources: Array.from(this.resources.values()).map(r => ({
          uri: r.uri,
          name: r.name,
          description: r.description,
          mimeType: r.mimeType
        }))
      }));

      this.server.setRequestHandler('resources/read', async (request) => {
        const { uri } = request.params;
        const resource = this.resources.get(uri);
        if (!resource) throw new Error(`Resource not found: ${uri}`);
        const content = await resource.handler();
        return {
          contents: [{ uri, mimeType: resource.mimeType, text: typeof content === 'string' ? content : JSON.stringify(content) }]
        };
      });

      // Connect transport
      this.transport = new StdioServerTransport();
      await this.server.connect(this.transport);

      logger.info('MCP server started (stdio transport)');
      this.emit('started', { transport: 'stdio' });
      return true;
    } catch (err) {
      logger.error('Failed to start stdio server:', err.message);
      return false;
    }
  }

  /**
   * Start MCP server using official SDK (SSE transport).
   */
  async startSSE(port = null) {
    const listenPort = port || this.port;

    if (!this.mcpSDK) {
      logger.warn('Cannot start SSE server: MCP SDK not available, using built-in');
      return this._startBuiltInSSE(listenPort);
    }

    try {
      const { Server } = this.mcpSDK;
      const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
      const http = require('http');

      this.server = new Server(
        { name: this.serverName, version: this.serverVersion },
        { capabilities: { tools: {}, resources: {}, prompts: {} } }
      );

      // Register handlers (same as stdio)
      this.server.setRequestHandler('tools/list', async () => ({
        tools: Array.from(this.tools.values()).map(t => ({
          name: t.name, description: t.description, inputSchema: t.inputSchema
        }))
      }));

      this.server.setRequestHandler('tools/call', async (request) => {
        const { name, arguments: args } = request.params;
        const tool = this.tools.get(name);
        if (!tool) throw new Error(`Tool not found: ${name}`);
        const result = await tool.handler(args || {});
        return {
          content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }]
        };
      });

      // Create HTTP server for SSE
      const httpServer = http.createServer(async (req, res) => {
        if (req.url === '/sse') {
          const transport = new SSEServerTransport('/messages', res);
          this._connectedClients.set(transport.sessionId, transport);
          this.clients.add(transport.sessionId);
          await this.server.connect(transport);
          req.on('close', () => {
            this._connectedClients.delete(transport.sessionId);
            this.clients.delete(transport.sessionId);
            logger.info(`Client disconnected: ${transport.sessionId}`);
          });
        }
      });

      httpServer.listen(listenPort, () => {
        logger.info(`MCP SSE server listening on port ${listenPort}`);
        this.emit('started', { transport: 'sse', port: listenPort });
      });

      return true;
    } catch (err) {
      logger.error('Failed to start SSE server:', err.message);
      return this._startBuiltInSSE(listenPort);
    }
  }

  /**
   * Built-in SSE fallback when SDK is not available.
   */
  _startBuiltInSSE(port) {
    try {
      const http = require('http');
      const httpServer = http.createServer(async (req, res) => {
        if (req.method === 'POST' && req.url === '/mcp') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              const request = JSON.parse(body);
              const response = await this.handleRequest(request);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(response));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      httpServer.listen(port, () => {
        logger.info(`MCP built-in server listening on port ${port}`);
        this.emit('started', { transport: 'builtin-http', port });
      });

      return true;
    } catch (err) {
      logger.error('Failed to start built-in server:', err.message);
      return false;
    }
  }

  /**
   * Connect to an external MCP server as a client.
   */
  async connectToServer(serverUrl) {
    if (!this.mcpSDK) {
      logger.warn('Cannot connect to MCP server: SDK not available');
      return null;
    }

    try {
      const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
      const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');

      const transport = new SSEClientTransport(new URL(serverUrl));
      const client = new Client(
        { name: this.serverName, version: this.serverVersion },
        { capabilities: {} }
      );

      await client.connect(transport);

      logger.info(`Connected to MCP server: ${serverUrl}`);
      this.emit('connected', { url: serverUrl });

      return client;
    } catch (err) {
      logger.error(`Failed to connect to MCP server: ${err.message}`);
      return null;
    }
  }

  /**
   * Register all agent tools as MCP tools.
   */
  registerAgentTools(toolsObject) {
    let count = 0;
    for (const [name, tool] of Object.entries(toolsObject)) {
      if (typeof tool === 'function') {
        this.registerTool({
          name,
          description: tool.description || `Agent tool: ${name}`,
          inputSchema: tool.inputSchema || { type: 'object', properties: {} },
          handler: tool.bind(toolsObject)
        });
        count++;
      }
    }
    logger.info(`Registered ${count} agent tools as MCP tools`);
    return count;
  }
}

module.exports = MCPServer;
