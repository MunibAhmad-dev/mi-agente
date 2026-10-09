/**
 * DSHToolAdapter — Bridges our existing tools with the Harness runtime.
 *
 * Provides a unified tool registry with:
 * - Discovery, validation, authorization
 * - Execution with timeout, cancellation, retries
 * - Logging, error handling
 * - Security (ToolSecurity integration)
 * - Cross-platform support (Windows/Linux/Mac)
 *
 * Tools registered:
 * Filesystem:  read_file, write_file, edit_file, list_directory, search_files, search_code
 * Terminal:    run_command
 * Git:         git_status, git_diff, git_commit, git_log, git_checkout
 * Web:         web_search, web_fetch
 * Browser:     browser_navigate
 */

let ToolSecurityClass = null;
try {
  ToolSecurityClass = require('./ToolSecurity').ToolSecurity;
} catch {
  // ToolSecurity not available
}

const { execSync, exec } = require('child_process');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const http = require('http');
const https = require('https');

const logger = {
  debug: (...args) => console.log('[DSHToolAdapter]', ...args),
  info: (...args) => console.info('[DSHToolAdapter]', ...args),
  warn: (...args) => console.warn('[DSHToolAdapter]', ...args),
  error: (...args) => console.error('[DSHToolAdapter]', ...args),
};

/**
 * Tool definition for LLM function calling.
 * @typedef {object} ToolDefinition
 * @property {string} type - Always 'function'
 * @property {object} function - Function schema
 * @property {string} function.name - Tool name
 * @property {string} function.description - Tool description
 * @property {object} function.parameters - JSON Schema for parameters
 */

/**
 * Registered tool entry.
 * @typedef {object} ToolEntry
 * @property {string} name
 * @property {string} description
 * @property {ToolDefinition} definition - For LLM function calling
 * @property {string[]} capabilities - Which capabilities this tool serves
 * @property {string[]} permissions - What the tool can access
 * @property {number} timeout - Max execution time in ms
 * @property {number} maxRetries - Max retry attempts
 * @property {Function} execute - The actual execution function
 */

/**
 * Cross-platform shell command runner.
 */
function runShellCommand(command, options = {}) {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    // Use cmd.exe on Windows
    try {
      const stdout = execSync(command, {
        cwd: options.cwd || process.cwd(),
        encoding: 'utf-8',
        timeout: options.timeout || 60000,
        maxBuffer: options.maxBuffer || 1024 * 1024,
        shell: 'cmd.exe',
        windowsHide: true,
      });
      return { stdout: stdout || '', stderr: '', exitCode: 0 };
    } catch (error) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || '',
        exitCode: error.status || 1,
      };
    }
  } else {
    // Use bash on Unix
    try {
      const stdout = execSync(command, {
        cwd: options.cwd || process.cwd(),
        encoding: 'utf-8',
        timeout: options.timeout || 60000,
        maxBuffer: options.maxBuffer || 1024 * 1024,
        shell: '/bin/bash',
      });
      return { stdout: stdout || '', stderr: '', exitCode: 0 };
    } catch (error) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || '',
        exitCode: error.status || 1,
      };
    }
  }
}

/**
 * Fetch a URL and return text content.
 */
function fetchUrl(url, maxChars = 50000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, maxChars).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
        if (data.length > maxChars) {
          res.destroy();
          resolve(data.slice(0, maxChars));
        }
      });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

/**
 * DSHToolAdapter — tool registry and executor.
 */
class DSHToolAdapter {
  constructor(config = {}) {
    this.config = {
      defaultTimeout: config.defaultTimeout || 60000,
      defaultMaxRetries: config.defaultMaxRetries || 2,
      enableSecurity: config.enableSecurity !== false,
      allowedDirectories: config.allowedDirectories || [process.cwd()],
      ...config,
    };

    this._tools = new Map();
    this._stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      blockedBySecurity: 0,
      byTool: {},
    };

    // Initialize security layer
    this._security = null;
    if (this.config.enableSecurity && ToolSecurityClass) {
      this._security = new ToolSecurityClass({
        allowedDirectories: this.config.allowedDirectories,
      });
      logger.info('[DSHToolAdapter] Security layer enabled');
    }

    this._registerBuiltinTools();
  }

  /**
   * Initialize the adapter (load external tools).
   */
  async initialize() {
    logger.info(`[DSHToolAdapter] Initialized with ${this._tools.size} tools`);
    return true;
  }

  /**
   * Register a tool.
   */
  register(tool) {
    const entry = {
      name: tool.name,
      description: tool.description,
      definition: {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters || { type: 'object', properties: {} },
        },
      },
      capabilities: tool.capabilities || ['general'],
      permissions: tool.permissions || [],
      timeout: tool.timeout || this.config.defaultTimeout,
      maxRetries: tool.maxRetries || this.config.defaultMaxRetries,
      execute: tool.execute,
    };

    this._tools.set(tool.name, entry);
    logger.debug(`[DSHToolAdapter] Registered tool: ${tool.name}`);
  }

  /**
   * Execute a tool by name with security checks.
   *
   * @param {string} name - Tool name
   * @param {object} args - Tool arguments
   * @param {object} context - Execution context
   * @returns {Promise<object>}
   */
  async execute(name, args, context = {}) {
    const tool = this._tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found. Available: ${Array.from(this._tools.keys()).join(', ')}`);
    }

    // Security check
    if (this._security) {
      const secResult = this._security.check(name, args);
      if (!secResult.allowed) {
        this._stats.blockedBySecurity++;
        logger.warn(`[DSHToolAdapter] Security blocked ${name}: ${secResult.reason}`);
        throw new Error(`Security: ${secResult.reason}`);
      }
      // Use sanitized args if security layer modified them
      if (secResult.sanitized) {
        args = secResult.sanitized;
      }
    }

    const startTime = Date.now();
    this._stats.totalCalls++;
    this._stats.byTool[name] = (this._stats.byTool[name] || 0) + 1;

    let lastError;
    for (let attempt = 0; attempt <= tool.maxRetries; attempt++) {
      try {
        logger.debug(`[DSHToolAdapter] Executing ${name} (attempt ${attempt + 1})`);

        const result = await this._executeWithTimeout(
          tool.execute(args, context),
          tool.timeout,
          name,
        );

        this._stats.successfulCalls++;
        const latency = Date.now() - startTime;
        logger.debug(`[DSHToolAdapter] ${name} completed in ${latency}ms`);

        // Record successful execution in security audit
        if (this._security) {
          this._security.recordExecution(name, args, { success: true, result });
        }

        return {
          success: true,
          result,
          latency,
          tool: name,
        };
      } catch (error) {
        lastError = error;
        logger.warn(`[DSHToolAdapter] ${name} failed (attempt ${attempt + 1}):`, error.message);

        if (attempt < tool.maxRetries) {
          const delay = 1000 * Math.pow(2, attempt) + Math.random() * 500;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    this._stats.failedCalls++;
    if (this._security) {
      this._security.recordExecution(name, args, { success: false, error: lastError.message });
    }
    throw lastError;
  }

  /**
   * Get tools for a specific capability.
   */
  getToolsForCapability(capability) {
    return Array.from(this._tools.values()).filter(
      (tool) => tool.capabilities.includes(capability) || tool.capabilities.includes('general'),
    );
  }

  /**
   * Get tool definitions for LLM function calling.
   */
  getToolDefinitions(capability = null) {
    const tools = capability
      ? this.getToolsForCapability(capability)
      : Array.from(this._tools.values());
    return tools.map((t) => t.definition);
  }

  /**
   * Get all registered tool IDs.
   */
  getToolIds() {
    return Array.from(this._tools.keys());
  }

  /**
   * Get adapter stats.
   */
  getStats() {
    return { ...this._stats };
  }

  /**
   * Get security audit log (if security enabled).
   */
  getAuditLog(limit = 100) {
    return this._security ? this._security.getAuditLog(limit) : [];
  }

  /**
   * Execute with timeout.
   */
  async _executeWithTimeout(promise, timeoutMs, toolName) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Tool "${toolName}" timeout after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
  }

  /**
   * Register all built-in tools.
   */
  _registerBuiltinTools() {
    // ============================================================
    // FILESYSTEM TOOLS
    // ============================================================

    this.register({
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to read' },
          offset: { type: 'number', description: 'Line number to start reading from (1-indexed)' },
          limit: { type: 'number', description: 'Maximum number of lines to read' },
        },
        required: ['path'],
      },
      capabilities: ['filesystem', 'code', 'general'],
      permissions: ['filesystem:read'],
      execute: async (args) => {
        const content = await fsPromises.readFile(args.path, 'utf-8');
        const lines = content.split('\n');
        const offset = (args.offset || 1) - 1;
        const limit = args.limit || lines.length;
        const sliced = lines.slice(offset, offset + limit);
        return {
          content: sliced.join('\n'),
          path: args.path,
          totalLines: lines.length,
          returnedLines: sliced.length,
          offset: offset + 1,
        };
      },
    });

    this.register({
      name: 'write_file',
      description: 'Write content to a file (creates directories if needed)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to write' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
      capabilities: ['filesystem', 'code', 'general'],
      permissions: ['filesystem:write'],
      execute: async (args) => {
        await fsPromises.mkdir(path.dirname(args.path), { recursive: true });
        await fsPromises.writeFile(args.path, args.content, 'utf-8');
        return { success: true, path: args.path, bytes: Buffer.byteLength(args.content) };
      },
    });

    this.register({
      name: 'edit_file',
      description: 'Edit a file by replacing old content with new content',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to edit' },
          old_string: { type: 'string', description: 'Exact string to find and replace' },
          new_string: { type: 'string', description: 'Replacement string' },
          allowMultiple: { type: 'boolean', description: 'Allow replacing multiple occurrences' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
      capabilities: ['filesystem', 'code'],
      permissions: ['filesystem:write'],
      execute: async (args) => {
        let content = await fsPromises.readFile(args.path, 'utf-8');
        if (!content.includes(args.old_string)) {
          throw new Error(`String not found in ${args.path}`);
        }
        if (args.allowMultiple) {
          content = content.split(args.old_string).join(args.new_string);
        } else {
          const count = content.split(args.old_string).length - 1;
          if (count > 1) {
            throw new Error(`String found ${count} times in ${args.path}. Use allowMultiple: true.`);
          }
          content = content.replace(args.old_string, args.new_string);
        }
        await fsPromises.writeFile(args.path, content, 'utf-8');
        return { success: true, path: args.path };
      },
    });

    this.register({
      name: 'list_directory',
      description: 'List files and directories in a path',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path to list' },
          recursive: { type: 'boolean', description: 'List recursively' },
          maxDepth: { type: 'number', description: 'Max recursion depth (default 1)' },
        },
        required: ['path'],
      },
      capabilities: ['filesystem', 'code', 'general'],
      permissions: ['filesystem:read'],
      execute: async (args) => {
        const maxDepth = args.recursive ? (args.maxDepth || 3) : 1;
        const results = { files: [], directories: [] };

        async function listDir(dirPath, depth) {
          if (depth > maxDepth) return;
          try {
            const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dirPath, entry.name);
              if (entry.isFile()) {
                results.files.push(fullPath);
              } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                results.directories.push(fullPath);
                if (depth < maxDepth) {
                  await listDir(fullPath, depth + 1);
                }
              }
            }
          } catch {
            // Skip unreadable directories
          }
        }

        await listDir(args.path, 1);
        return results;
      },
    });

    this.register({
      name: 'search_files',
      description: 'Search for files matching a pattern using cross-platform commands',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Filename pattern (supports glob)' },
          directory: { type: 'string', description: 'Directory to search in (default: current)' },
          file_types: { type: 'string', description: 'Comma-separated file extensions (e.g., "js,ts,py")' },
        },
        required: ['pattern'],
      },
      capabilities: ['filesystem', 'code', 'search'],
      permissions: ['filesystem:read'],
      execute: async (args) => {
        const isWindows = process.platform === 'win32';
        let command;
        const dir = args.directory || '.';

        if (isWindows) {
          // Windows: use dir /s /b
          if (args.file_types) {
            const exts = args.file_types.split(',').map(e => `/find "${e.trim()}"`).join(' ');
            command = `dir /s /b ${exts} "${dir}" 2>nul | findstr /i "${args.pattern}"`;
          } else {
            command = `dir /s /b "${dir}\\*${args.pattern}*" 2>nul`;
          }
        } else {
          // Unix: use find
          const typeFlag = args.file_types
            ? `\\( ${args.file_types.split(',').map(e => `-name "*.${e.trim()}"`).join(' -o ')} \\)`
            : `-name "*${args.pattern}*"`;
          command = `find "${dir}" -type f ${typeFlag} 2>/dev/null | head -50`;
        }

        const result = runShellCommand(command, { timeout: 15000 });
        return { files: result.stdout.split('\n').filter(Boolean) };
      },
    });

    this.register({
      name: 'search_code',
      description: 'Search for text patterns in code files',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Text pattern to search for' },
          directory: { type: 'string', description: 'Directory to search in' },
          file_types: { type: 'string', description: 'File extensions (e.g., "js,ts")' },
          max_results: { type: 'number', description: 'Maximum results (default 30)' },
        },
        required: ['pattern'],
      },
      capabilities: ['code', 'search'],
      permissions: ['filesystem:read'],
      execute: async (args) => {
        const isWindows = process.platform === 'win32';
        const dir = args.directory || '.';
        const maxResults = args.max_results || 30;

        let result;
        if (isWindows) {
          // Use findstr on Windows
          const typeArg = args.file_types ? `/include:"*.${args.file_types.split(',')[0]}"` : '';
          result = runShellCommand(
            `findstr /s /n /i "${args.pattern}" ${dir}\\*${args.file_types ? `.${args.file_types.split(',')[0]}` : ''} 2>nul | head -${maxResults}`,
            { timeout: 30000 },
          );
        } else {
          const typeFlag = args.file_types ? `--type ${args.file_types.split(',')[0]}` : '';
          result = runShellCommand(
            `grep -rn "${args.pattern}" ${dir} ${typeFlag} 2>/dev/null | head -${maxResults}`,
            { timeout: 30000 },
          );
        }

        return { matches: result.stdout.split('\n').filter(Boolean) };
      },
    });

    // ============================================================
    // TERMINAL TOOL
    // ============================================================

    this.register({
      name: 'run_command',
      description: 'Execute a shell command and return output',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          cwd: { type: 'string', description: 'Working directory (default: current)' },
          timeout: { type: 'number', description: 'Timeout in milliseconds (default: 60000)' },
        },
        required: ['command'],
      },
      capabilities: ['code', 'general', 'testing'],
      permissions: ['terminal'],
      timeout: 120000,
      execute: async (args) => {
        return runShellCommand(args.command, {
          cwd: args.cwd,
          timeout: args.timeout || 60000,
        });
      },
    });

    // ============================================================
    // GIT TOOLS
    // ============================================================

    this.register({
      name: 'git_status',
      description: 'Get git repository status (branch, staged, modified, untracked files)',
      parameters: { type: 'object', properties: {} },
      capabilities: ['git', 'code'],
      permissions: ['git'],
      execute: async () => {
        try {
          const status = runShellCommand('git status --short');
          const branch = runShellCommand('git branch --show-current');
          const log = runShellCommand('git log --oneline -5');
          return {
            status: status.stdout.trim(),
            branch: branch.stdout.trim(),
            recentCommits: log.stdout.trim(),
          };
        } catch (error) {
          return { error: error.message };
        }
      },
    });

    this.register({
      name: 'git_diff',
      description: 'Get git diff (staged, unstaged, or for specific files)',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Specific file to diff' },
          staged: { type: 'boolean', description: 'Show staged changes' },
        },
      },
      capabilities: ['git', 'code'],
      permissions: ['git'],
      execute: async (args) => {
        let command = 'git diff';
        if (args.staged) command += ' --staged';
        if (args.file) command += ` -- "${args.file}"`;
        const result = runShellCommand(command);
        return { diff: result.stdout };
      },
    });

    this.register({
      name: 'git_commit',
      description: 'Create a git commit',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Commit message' },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Files to stage (empty = all changed)',
          },
        },
        required: ['message'],
      },
      capabilities: ['git', 'code'],
      permissions: ['git:write'],
      execute: async (args) => {
        // Stage files
        if (args.files && args.files.length > 0) {
          for (const file of args.files) {
            runShellCommand(`git add "${file}"`);
          }
        } else {
          runShellCommand('git add -A');
        }
        // Commit
        const result = runShellCommand(
          `git commit -m "${args.message.replace(/"/g, '\\"')}"`,
        );
        return { success: result.exitCode === 0, output: result.stdout || result.stderr };
      },
    });

    this.register({
      name: 'git_log',
      description: 'Get recent git commit history',
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Number of commits to show (default 10)' },
          file: { type: 'string', description: 'Show history for specific file' },
        },
      },
      capabilities: ['git', 'code'],
      permissions: ['git'],
      execute: async (args) => {
        const count = args.count || 10;
        let command = `git log --oneline -${count}`;
        if (args.file) command += ` -- "${args.file}"`;
        const result = runShellCommand(command);
        return { history: result.stdout.trim() };
      },
    });

    this.register({
      name: 'git_checkout',
      description: 'Create or switch to a git branch',
      parameters: {
        type: 'object',
        properties: {
          branch: { type: 'string', description: 'Branch name' },
          create: { type: 'boolean', description: 'Create branch if it doesn\'t exist' },
        },
        required: ['branch'],
      },
      capabilities: ['git', 'code'],
      permissions: ['git:write'],
      execute: async (args) => {
        const flag = args.create ? '-b' : '';
        const result = runShellCommand(`git checkout ${flag} "${args.branch}"`);
        return { success: result.exitCode === 0, output: result.stdout || result.stderr };
      },
    });

    // ============================================================
    // WEB TOOLS
    // ============================================================

    this.register({
      name: 'web_search',
      description: 'Search the web using DuckDuckGo and return results',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          max_results: { type: 'number', description: 'Maximum results (default 5)' },
        },
        required: ['query'],
      },
      capabilities: ['search', 'browser', 'general'],
      permissions: ['network'],
      timeout: 30000,
      execute: async (args) => {
        const maxResults = args.max_results || 5;
        const query = encodeURIComponent(args.query);

        try {
          // Use DuckDuckGo HTML lite (no API key needed)
          const url = `https://lite.duckduckgo.com/lite/?q=${query}`;
          const html = await fetchUrl(url, 100000);

          // Parse results from HTML
          const results = [];
          const resultRegex = /<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
          const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

          let match;
          const links = [];
          while ((match = resultRegex.exec(html)) !== null && links.length < maxResults) {
            links.push({ url: match[1], title: match[2].replace(/<[^>]+>/g, '').trim() });
          }

          const snippets = [];
          while ((match = snippetRegex.exec(html)) !== null && snippets.length < maxResults) {
            snippets.push(match[1].replace(/<[^>]+>/g, '').trim());
          }

          for (let i = 0; i < links.length; i++) {
            results.push({
              title: links[i].title,
              url: links[i].url,
              snippet: snippets[i] || '',
            });
          }

          return { results, query: args.query };
        } catch (error) {
          // Fallback: return search URL for manual lookup
          return {
            results: [],
            error: error.message,
            searchUrl: `https://duckduckgo.com/?q=${query}`,
          };
        }
      },
    });

    this.register({
      name: 'web_fetch',
      description: 'Fetch and extract text content from a URL',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
          max_chars: { type: 'number', description: 'Maximum characters to return (default 50000)' },
        },
        required: ['url'],
      },
      capabilities: ['search', 'browser', 'general'],
      permissions: ['network'],
      timeout: 30000,
      execute: async (args) => {
        const maxChars = args.max_chars || 50000;
        const html = await fetchUrl(args.url, maxChars);

        // Strip HTML tags for readable text
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        return {
          content: text.slice(0, maxChars),
          url: args.url,
          truncated: text.length > maxChars,
          totalLength: text.length,
        };
      },
    });

    // ============================================================
    // BROWSER TOOL
    // ============================================================

    this.register({
      name: 'browser_navigate',
      description: 'Navigate to a URL and return the page content',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to navigate to' },
        },
        required: ['url'],
      },
      capabilities: ['browser', 'search'],
      permissions: ['network', 'browser'],
      timeout: 30000,
      execute: async (args) => {
        try {
          const html = await fetchUrl(args.url, 200000);

          // Extract title
          const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const title = titleMatch ? titleMatch[1].trim() : '';

          // Extract meta description
          const metaMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/i);
          const description = metaMatch ? metaMatch[1].trim() : '';

          // Extract links
          const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
          const links = [];
          let linkMatch;
          while ((linkMatch = linkRegex.exec(html)) !== null && links.length < 20) {
            const linkText = linkMatch[2].replace(/<[^>]+>/g, '').trim();
            if (linkText) {
              links.push({ text: linkText, href: linkMatch[1] });
            }
          }

          // Strip HTML for body text
          const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i);
          const bodyHtml = bodyMatch ? bodyMatch[0] : html;
          const bodyText = bodyHtml
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 50000);

          return {
            url: args.url,
            title,
            description,
            content: bodyText,
            links,
            truncated: bodyText.length >= 50000,
          };
        } catch (error) {
          return { url: args.url, error: error.message };
        }
      },
    });

    // ============================================================
    // COMPUTER USE TOOLS
    // ============================================================

    let ComputerUseClass = null;
    try { ComputerUseClass = require('./ComputerUse').ComputerUse; } catch {}

    if (ComputerUseClass) {
      const cpu = new ComputerUseClass();

      this.register({
        name: 'computer_screenshot',
        description: 'Take a screenshot of the desktop or browser',
        parameters: {
          type: 'object',
          properties: {
            target: { type: 'string', description: '"desktop" or "browser" (default: desktop)' },
          },
        },
        capabilities: ['computer', 'gui'],
        permissions: ['screen'],
        timeout: 15000,
        execute: async (args) => {
          if (args.target === 'browser') return cpu.browserScreenshot();
          return cpu.screenshot();
        },
      });

      this.register({
        name: 'computer_click',
        description: 'Click at screen coordinates or a CSS selector (browser)',
        parameters: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'X coordinate' },
            y: { type: 'number', description: 'Y coordinate' },
            selector: { type: 'string', description: 'CSS selector for browser click' },
            button: { type: 'string', description: 'Mouse button: left, right (default: left)' },
          },
        },
        capabilities: ['computer', 'gui'],
        permissions: ['input'],
        execute: async (args) => {
          if (args.selector) return cpu.browserClick(args.selector);
          if (args.x !== undefined && args.y !== undefined) return cpu.mouseClick(args.x, args.y, args.button);
          throw new Error('Provide x,y coordinates or a CSS selector');
        },
      });

      this.register({
        name: 'computer_type',
        description: 'Type text at the current cursor position or in a browser input',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text to type' },
            selector: { type: 'string', description: 'CSS selector for browser input (optional)' },
          },
          required: ['text'],
        },
        capabilities: ['computer', 'gui'],
        permissions: ['input'],
        execute: async (args) => {
          if (args.selector) return cpu.browserType(args.selector, args.text);
          return cpu.typeText(args.text);
        },
      });

      this.register({
        name: 'computer_key',
        description: 'Press a key or key combination (e.g., enter, ctrl+c, alt+f4)',
        parameters: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Key name or combination (e.g., "enter", "ctrl+c")' },
          },
          required: ['key'],
        },
        capabilities: ['computer', 'gui'],
        permissions: ['input'],
        execute: async (args) => cpu.pressKey(args.key),
      });

      this.register({
        name: 'computer_scroll',
        description: 'Scroll the screen up or down',
        parameters: {
          type: 'object',
          properties: {
            direction: { type: 'string', description: 'up or down' },
            amount: { type: 'number', description: 'Scroll amount (default 3)' },
          },
          required: ['direction'],
        },
        capabilities: ['computer', 'gui'],
        permissions: ['input'],
        execute: async (args) => cpu.mouseScroll(args.direction, args.amount),
      });

      this.register({
        name: 'computer_browser_navigate',
        description: 'Open a URL in the automated browser',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to navigate to' },
          },
          required: ['url'],
        },
        capabilities: ['computer', 'gui', 'browser'],
        permissions: ['network', 'browser'],
        timeout: 30000,
        execute: async (args) => cpu.browserNavigate(args.url),
      });

      this.register({
        name: 'computer_browser_type',
        description: 'Type text into a browser input field',
        parameters: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector for the input' },
            text: { type: 'string', description: 'Text to type' },
          },
          required: ['selector', 'text'],
        },
        capabilities: ['computer', 'gui', 'browser'],
        permissions: ['input', 'browser'],
        execute: async (args) => cpu.browserType(args.selector, args.text),
      });

      this.register({
        name: 'computer_browser_text',
        description: 'Get the text content of the current browser page',
        parameters: { type: 'object', properties: {} },
        capabilities: ['computer', 'gui', 'browser'],
        permissions: ['browser'],
        execute: async () => cpu.browserGetText(),
      });

      this.register({
        name: 'computer_clipboard',
        description: 'Read or write the system clipboard',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', description: '"read" or "write"' },
            text: { type: 'string', description: 'Text to write (for write action)' },
          },
          required: ['action'],
        },
        capabilities: ['computer', 'gui'],
        permissions: ['clipboard'],
        execute: async (args) => {
          if (args.action === 'write') return cpu.clipboardWrite(args.text || '');
          return cpu.clipboardRead();
        },
      });

      this.register({
        name: 'computer_windows',
        description: 'List open windows on the desktop',
        parameters: { type: 'object', properties: {} },
        capabilities: ['computer', 'gui'],
        permissions: ['screen'],
        execute: async () => cpu.listWindows(),
      });
    }

    // === GAP MODULE TOOLS ===

    // Vector Store / RAG tools
    this.register({
      name: 'vector_search',
      description: 'Search the vector store for documents semantically similar to a query (RAG)',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          topK: { type: 'number', description: 'Number of results (default 5)' },
        },
        required: ['query'],
      },
      capabilities: ['rag', 'search'],
      permissions: ['vectordb'],
      execute: async (args) => {
        const harness = require('./HarnessManager').getHarnessManager();
        if (!harness.vectorStore) throw new Error('VectorStore not available');
        return harness.vectorStore.search(args.query, { topK: args.topK });
      },
    });

    this.register({
      name: 'vector_add',
      description: 'Add a document to the vector store for future RAG searches',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Document text content' },
          source: { type: 'string', description: 'Source identifier' },
          title: { type: 'string', description: 'Document title' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
        },
        required: ['text'],
      },
      capabilities: ['rag', 'storage'],
      permissions: ['vectordb'],
      execute: async (args) => {
        const harness = require('./HarnessManager').getHarnessManager();
        if (!harness.vectorStore) throw new Error('VectorStore not available');
        return harness.vectorStore.addDocument(args);
      },
    });

    // File Processing tool
    this.register({
      name: 'process_file',
      description: 'Process a file: extract text from PDFs, DOCX, spreadsheets, images (OCR), audio metadata',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path to the file' },
          ocr: { type: 'boolean', description: 'Enable OCR for images (default true)' },
        },
        required: ['filePath'],
      },
      capabilities: ['file', 'document'],
      permissions: ['filesystem'],
      execute: async (args) => {
        const harness = require('./HarnessManager').getHarnessManager();
        if (!harness.fileProcessor) throw new Error('FileProcessor not available');
        return harness.fileProcessor.processFile(args.filePath, { ocr: args.ocr });
      },
    });

    // Voice tools
    this.register({
      name: 'tts_speak',
      description: 'Convert text to speech audio file',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to convert to speech' },
          voice: { type: 'string', description: 'Voice name (e.g., af_heart for Kokoro)' },
        },
        required: ['text'],
      },
      capabilities: ['voice', 'tts'],
      permissions: ['audio'],
      execute: async (args) => {
        const harness = require('./HarnessManager').getHarnessManager();
        if (!harness.voiceManager) throw new Error('VoiceManager not available');
        return harness.voiceManager.textToSpeech(args.text, { voice: args.voice });
      },
    });

    this.register({
      name: 'stt_transcribe',
      description: 'Transcribe an audio file to text (speech-to-text)',
      parameters: {
        type: 'object',
        properties: {
          audioPath: { type: 'string', description: 'Path to the audio file' },
          lang: { type: 'string', description: 'Language code (e.g., en, es, auto)' },
          model: { type: 'string', description: 'Whisper model: tiny, base, small, medium, large' },
        },
        required: ['audioPath'],
      },
      capabilities: ['voice', 'stt'],
      permissions: ['audio'],
      execute: async (args) => {
        const harness = require('./HarnessManager').getHarnessManager();
        if (!harness.voiceManager) throw new Error('VoiceManager not available');
        return harness.voiceManager.speechToText(args.audioPath, { lang: args.lang, model: args.model });
      },
    });

    // Scheduler tools
    this.register({
      name: 'schedule_job',
      description: 'Schedule a recurring task with a cron expression',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique job ID' },
          cron: { type: 'string', description: 'Cron expression (e.g., "*/5 * * * *" for every 5 min)' },
          task: { type: 'string', description: 'Task description or command' },
        },
        required: ['id', 'cron', 'task'],
      },
      capabilities: ['scheduler', 'automation'],
      permissions: ['system'],
      execute: async (args) => {
        const harness = require('./HarnessManager').getHarnessManager();
        if (!harness.schedulerManager) throw new Error('SchedulerManager not available');
        return harness.schedulerManager.schedule(args.id, args.cron, async () => {
          console.log(`[Scheduler] Executing: ${args.task}`);
        });
      },
    });

    this.register({
      name: 'unschedule_job',
      description: 'Remove a scheduled job',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Job ID to remove' },
        },
        required: ['id'],
      },
      capabilities: ['scheduler'],
      permissions: ['system'],
      execute: async (args) => {
        const harness = require('./HarnessManager').getHarnessManager();
        if (!harness.schedulerManager) throw new Error('SchedulerManager not available');
        return harness.schedulerManager.unschedule(args.id);
      },
    });

    // Report tool
    this.register({
      name: 'generate_report',
      description: 'Generate a PDF or HTML report from Markdown content',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Markdown content for the report' },
          format: { type: 'string', description: 'Output format: pdf, html, json' },
          title: { type: 'string', description: 'Report title' },
        },
        required: ['content'],
      },
      capabilities: ['report', 'output'],
      permissions: ['filesystem'],
      execute: async (args) => {
        const harness = require('./HarnessManager').getHarnessManager();
        if (!harness.reportGenerator) throw new Error('ReportGenerator not available');
        if (args.format === 'html') return harness.reportGenerator.generateHTML(args.content, { title: args.title });
        if (args.format === 'json') return harness.reportGenerator.generateJSON(args.content, { title: args.title });
        return harness.reportGenerator.markdownToPDF(args.content, { title: args.title });
      },
    });

    // MCP tool
    this.register({
      name: 'mcp_request',
      description: 'Send a request to the MCP (Model Context Protocol) server',
      parameters: {
        type: 'object',
        properties: {
          method: { type: 'string', description: 'MCP method (tools/list, tools/call, resources/list, etc.)' },
          params: { type: 'object', description: 'Method parameters' },
        },
        required: ['method'],
      },
      capabilities: ['mcp', 'protocol'],
      permissions: ['mcp'],
      execute: async (args) => {
        const harness = require('./HarnessManager').getHarnessManager();
        if (!harness.mcpServer) throw new Error('MCPServer not available');
        return harness.mcpServer.handleRequest({ method: args.method, params: args.params || {}, id: Date.now() });
      },
    });

    // Sandbox tool
    this.register({
      name: 'sandbox_execute',
      description: 'Execute code in an isolated sandbox (JavaScript, Python, Bash, PowerShell)',
      parameters: {
        type: 'object',
        properties: {
          language: { type: 'string', description: 'Language: javascript, python, bash, powershell' },
          code: { type: 'string', description: 'Code to execute' },
          timeout: { type: 'number', description: 'Timeout in ms (default 30000)' },
        },
        required: ['language', 'code'],
      },
      capabilities: ['sandbox', 'execution'],
      permissions: ['system'],
      execute: async (args) => {
        const harness = require('./HarnessManager').getHarnessManager();
        if (!harness.sandboxRunner) throw new Error('SandboxRunner not available');
        return harness.sandboxRunner.execute(args.language, args.code, { timeout: args.timeout });
      },
    });

    // === NEW: Social Media Search tools ===
    this.register({
      name: 'social_search',
      description: 'Search social media platforms (Twitter/X, Reddit, Facebook, YouTube, LinkedIn) for posts, people, and topics',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          platform: { type: 'string', description: 'Platform: twitter, reddit, facebook, youtube, linkedin, or all' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: ['query'],
      },
      capabilities: ['social', 'search'],
      permissions: ['web'],
      execute: async (args) => {
        const harness = require('./HarnessManager').getHarnessManager();
        if (!harness.socialMedia) throw new Error('SocialMediaSearch not available');
        if (args.platform && args.platform !== 'all') {
          const method = `search${args.platform.charAt(0).toUpperCase() + args.platform.slice(1)}`;
          if (typeof harness.socialMedia[method] === 'function') {
            return harness.socialMedia[method](args.query, { limit: args.limit });
          }
        }
        return harness.socialMedia.searchAll(args.query, { limit: args.limit });
      },
    });

    // === NEW: Voice Conversation tool ===
    this.register({
      name: 'voice_converse',
      description: 'Start or interact with a real-time voice conversation session',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'start, send_text, or end' },
          sessionId: { type: 'string', description: 'Session ID (for send_text/end)' },
          text: { type: 'string', description: 'Text message (for send_text)' },
        },
        required: ['action'],
      },
      capabilities: ['voice', 'conversation'],
      permissions: ['audio'],
      execute: async (args) => {
        const harness = require('./HarnessManager').getHarnessManager();
        if (!harness.voiceConversation) throw new Error('VoiceConversation not available');
        if (args.action === 'start') return harness.voiceConversation.startSession();
        if (args.action === 'send_text') return harness.voiceConversation.processText(args.sessionId, args.text);
        if (args.action === 'end') return harness.voiceConversation.endSession(args.sessionId);
        throw new Error('Invalid action');
      },
    });

    // === NEW: Citation tools ===
    this.register({
      name: 'citation_add',
      description: 'Add a source citation for tracking in responses',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Source URL' },
          title: { type: 'string', description: 'Source title' },
          tool: { type: 'string', description: 'Tool that found this source' },
        },
        required: ['url'],
      },
      capabilities: ['citation', 'tracking'],
      permissions: ['system'],
      execute: async (args) => {
        const harness = require('./HarnessManager').getHarnessManager();
        if (!harness.citationTracker) throw new Error('CitationTracker not available');
        const num = harness.citationTracker.addSource(args);
        return { citationNumber: num, url: args.url };
      },
    });

    this.register({
      name: 'citation_list',
      description: 'List all tracked citations/sources',
      parameters: { type: 'object', properties: {} },
      capabilities: ['citation'],
      permissions: ['system'],
      execute: async () => {
        const harness = require('./HarnessManager').getHarnessManager();
        if (!harness.citationTracker) throw new Error('CitationTracker not available');
        return harness.citationTracker.getSourceList();
      },
    });

    // === NEW: Suggested Actions tool ===
    this.register({
      name: 'get_suggestions',
      description: 'Generate intelligent suggested actions based on the last response',
      parameters: {
        type: 'object',
        properties: {
          responseText: { type: 'string', description: 'The response text to analyze' },
          context: { type: 'object', description: 'Additional context (previousTopics, originalQuery)' },
        },
        required: ['responseText'],
      },
      capabilities: ['suggestions', 'ui'],
      permissions: ['system'],
      execute: async (args) => {
        const harness = require('./HarnessManager').getHarnessManager();
        if (!harness.suggestedActions) throw new Error('SuggestedActionsEngine not available');
        return harness.suggestedActions.generateSuggestions({ content: args.responseText }, args.context || {});
      },
    });

    // === NEW: Background Task tool ===
    this.register({
      name: 'run_background',
      description: 'Run a task in the background and return when complete',
      parameters: {
        type: 'object',
        properties: {
          taskDescription: { type: 'string', description: 'What to do' },
          timeout: { type: 'number', description: 'Timeout in ms (default 300000)' },
        },
        required: ['taskDescription'],
      },
      capabilities: ['background', 'async'],
      permissions: ['system'],
      execute: async (args) => {
        const harness = require('./HarnessManager').getHarnessManager();
        if (!harness.backgroundTasks) throw new Error('BackgroundTaskManager not available');
        return harness.backgroundTasks.runTask(() => ({ completed: true, task: args.taskDescription }), { timeout: args.timeout });
      },
    });

    logger.info(`[DSHToolAdapter] Registered ${this._tools.size} built-in tools`);
  }
}

module.exports = { DSHToolAdapter, runShellCommand, fetchUrl };
