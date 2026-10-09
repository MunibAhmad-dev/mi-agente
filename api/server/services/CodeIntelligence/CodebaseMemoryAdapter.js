/**
 * CodebaseMemoryAdapter — Adapter for Codebase-Memory-MCP (MIT, C binary).
 *
 * Provides the same contract as CodeIntelligenceService (symbol index,
 * dependency graph, blast radius) but delegates to an external MCP server
 * process (codebase-memory-mcp) that uses tree-sitter + Hybrid LSP for
 * 158 languages, when the binary is available. Falls back to the built-in
 * regex-based CodeIntelligenceService when the binary is not installed.
 *
 * Architecture:
 *   - If CODEBASE_MEMORY_PATH env var points to a valid binary, the adapter
 *     spawns it as a subprocess, communicates via JSON-RPC over stdio (MCP
 *     protocol), and caches results in-memory.
 *   - If the binary is not available, it transparently delegates to the
 *     existing CodeIntelligenceService (regex-based, 10 languages).
 *
 * MCP tools exposed by codebase-memory-mcp (14 total):
 *   - find_symbol, get_references, get_call_graph, get_dependencies,
 *   - get_code_snippet, list_symbols, detect_changes, query_graph, etc.
 *
 * License: MIT (matches codebase-memory-mcp upstream)
 */

const { spawn } = require('child_process');
const { CodeIntelligenceService } = require('./codeIntelligence');

const FALLBACK = new CodeIntelligenceService();

let _mcpProcess = null;
let _mcpReady = false;
let _requestId = 0;
const _pending = new Map();
let _initPromise = null;

/**
 * Check whether the codebase-memory-mcp binary is available.
 * @returns {boolean}
 */
function isMcpAvailable() {
  const binPath = process.env.CODEBASE_MEMORY_PATH;
  if (!binPath) return false;
  try {
    require('fs').accessSync(binPath, require('fs').constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Send a JSON-RPC request to the MCP server and await the response.
 * @param {string} method
 * @param {object} params
 * @returns {Promise<any>}
 */
function mcpRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!_mcpProcess || !_mcpReady) {
      reject(new Error('MCP server not ready'));
      return;
    }
    const id = ++_requestId;
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    _pending.set(id, { resolve, reject });
    _mcpProcess.stdin.write(msg + '\n');

    setTimeout(() => {
      if (_pending.has(id)) {
        _pending.delete(id);
        reject(new Error(`MCP request timeout: ${method}`));
      }
    }, 30000);
  });
}

/**
 * Initialize the MCP server subprocess.
 * @returns {Promise<boolean>}
 */
function initMcp() {
  if (_initPromise) return _initPromise;
  _initPromise = new Promise((resolve) => {
    if (!isMcpAvailable()) {
      resolve(false);
      return;
    }
    const workspace = process.env.CODEBASE_MEMORY_WORKSPACE || process.cwd();
    try {
      _mcpProcess = spawn(
        process.env.CODEBASE_MEMORY_PATH,
        ['--workspace', workspace, '--mode', 'stdio'],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
    } catch {
      resolve(false);
      return;
    }

    let buffer = '';
    _mcpProcess.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id && _pending.has(msg.id)) {
            const { resolve: res, reject: rej } = _pending.get(msg.id);
            _pending.delete(msg.id);
            if (msg.error) rej(new Error(msg.error.message || 'MCP error'));
            else res(msg.result);
          } else if (msg.method === 'notifications/initialized') {
            _mcpReady = true;
            resolve(true);
          }
        } catch {
          // ignore non-JSON lines
        }
      }
    });

    _mcpProcess.stderr.on('data', () => {});
    _mcpProcess.on('error', () => resolve(false));
    _mcpProcess.on('exit', () => {
      _mcpReady = false;
      _mcpProcess = null;
    });

    _mcpProcess.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {} },
      }) + '\n',
    );

    setTimeout(() => {
      if (!_mcpReady) resolve(false);
    }, 10000);
  });
  return _initPromise;
}

/**
 * Shutdown the MCP server subprocess.
 */
async function shutdownMcp() {
  if (_mcpProcess) {
    try {
      await mcpRequest('shutdown', {});
      _mcpProcess.stdin.write(
        JSON.stringify({ jsonrpc: '2.0', method: 'notifications/exit' }) + '\n',
      );
    } catch {
      // ignore
    }
    _mcpProcess.kill();
    _mcpProcess = null;
    _mcpReady = false;
  }
}

/**
 * Index a single file via MCP (delegates to the external binary's file watcher).
 * Falls back to regex parser.
 */
async function indexFile(filePath, source) {
  const ready = await initMcp();
  if (ready) {
    try {
      await mcpRequest('tools/call', {
        name: 'index_file',
        arguments: { path: filePath },
      });
      return { symbols: -1, imports: -1, source: 'mcp' };
    } catch {
      // fall through to fallback
    }
  }
  return FALLBACK.indexFile(filePath, source);
}

/**
 * Index a directory recursively.
 */
async function indexDirectory(rootDir, maxFiles = 2000) {
  const ready = await initMcp();
  if (ready) {
    try {
      const result = await mcpRequest('tools/call', {
        name: 'index_directory',
        arguments: { path: rootDir, max_files: maxFiles },
      });
      if (result && typeof result === 'object') {
        return { ...result, source: 'mcp' };
      }
    } catch {
      // fall through
    }
  }
  return FALLBACK.indexDirectory(rootDir, maxFiles);
}

/**
 * Find symbol definitions by name.
 * @param {string} name
 * @returns {Promise<Array<{file: string, line: number, kind: string}>>}
 */
async function findDefinitions(name) {
  const ready = await initMcp();
  if (ready) {
    try {
      const result = await mcpRequest('tools/call', {
        name: 'find_symbol',
        arguments: { name },
      });
      if (Array.isArray(result)) return result;
      if (result && Array.isArray(result.symbols)) return result.symbols;
    } catch {
      // fall through
    }
  }
  return FALLBACK.findDefinitions(name);
}

/**
 * Find all references to a symbol (MCP-only, falls back to definitions).
 * @param {string} name
 * @returns {Promise<Array<{file: string, line: number}>>}
 */
async function findReferences(name) {
  const ready = await initMcp();
  if (ready) {
    try {
      const result = await mcpRequest('tools/call', {
        name: 'get_references',
        arguments: { name },
      });
      if (Array.isArray(result)) return result;
      if (result && Array.isArray(result.references)) return result.references;
    } catch {
      // fall through
    }
  }
  return FALLBACK.findDefinitions(name);
}

/**
 * Get the call graph for a symbol (MCP-only).
 * @param {string} name
 * @returns {Promise<object|null>}
 */
async function getCallGraph(name) {
  const ready = await initMcp();
  if (!ready) return null;
  try {
    return await mcpRequest('tools/call', {
      name: 'get_call_graph',
      arguments: { name },
    });
  } catch {
    return null;
  }
}

/**
 * Find files that import `file` (dependents — blast radius).
 */
async function findDependents(file) {
  const ready = await initMcp();
  if (ready) {
    try {
      const result = await mcpRequest('tools/call', {
        name: 'get_dependents',
        arguments: { path: file },
      });
      if (Array.isArray(result)) return result;
      if (result && Array.isArray(result.dependents)) return result.dependents;
    } catch {
      // fall through
    }
  }
  return FALLBACK.findDependents(file);
}

/**
 * Find files that `file` depends on.
 */
async function findDependencies(file) {
  const ready = await initMcp();
  if (ready) {
    try {
      const result = await mcpRequest('tools/call', {
        name: 'get_dependencies',
        arguments: { path: file },
      });
      if (Array.isArray(result)) return result;
      if (result && Array.isArray(result.dependencies)) return result.dependencies;
    } catch {
      // fall through
    }
  }
  return FALLBACK.findDependencies(file);
}

/**
 * Compute blast radius (transitive dependents of changed files).
 */
async function computeBlastRadius(changedFiles, maxDepth = 10) {
  const ready = await initMcp();
  if (ready) {
    try {
      const result = await mcpRequest('tools/call', {
        name: 'get_blast_radius',
        arguments: {
          files: Array.isArray(changedFiles) ? changedFiles : [changedFiles],
          max_depth: maxDepth,
        },
      });
      if (Array.isArray(result)) return result;
      if (result && Array.isArray(result.affected)) return result.affected;
    } catch {
      // fall through
    }
  }
  return FALLBACK.computeBlastRadius(changedFiles, maxDepth);
}

/**
 * Get statistics about the index.
 */
async function stats() {
  const ready = await initMcp();
  if (ready) {
    try {
      const result = await mcpRequest('tools/call', {
        name: 'get_stats',
        arguments: {},
      });
      if (result && typeof result === 'object') {
        return { ...result, source: 'mcp' };
      }
    } catch {
      // fall through
    }
  }
  return { ...FALLBACK.stats(), source: 'regex' };
}

/**
 * Clear the index (regex fallback only; MCP manages its own state).
 */
function clear() {
  FALLBACK.clear();
}

/**
 * Detect which files changed since last index (MCP incremental re-index).
 * @returns {Promise<string[]>}
 */
async function detectChanges() {
  const ready = await initMcp();
  if (!ready) return [];
  try {
    const result = await mcpRequest('tools/call', {
      name: 'detect_changes',
      arguments: {},
    });
    if (Array.isArray(result)) return result;
    if (result && Array.isArray(result.changed)) return result.changed;
    return [];
  } catch {
    return [];
  }
}

module.exports = {
  isMcpAvailable,
  initMcp,
  shutdownMcp,
  indexFile,
  indexDirectory,
  findDefinitions,
  findReferences,
  getCallGraph,
  findDependents,
  findDependencies,
  computeBlastRadius,
  stats,
  clear,
  detectChanges,
};
