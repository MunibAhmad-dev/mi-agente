/**
 * DependencyScanner — Dependency vulnerability scanning using OSV-Scanner
 * (Apache-2.0, Go binary) + OSV database API.
 *
 * Scans package manifests (package.json, requirements.txt, go.mod, etc.)
 * for known vulnerabilities. Uses the OSV.dev API as primary (no binary
 * needed, free, no key) and osv-scanner binary as optional accelerator.
 *
 * License: Apache-2.0 (OSV-Scanner, OSV.dev API)
 */

const fs = require('fs');
const path = require('path');

let _binaryPath = null;

function getBinaryPath() {
  if (_binaryPath !== null) return _binaryPath;
  _binaryPath = process.env.OSV_SCANNER_PATH || '';
  if (_binaryPath) return _binaryPath;
  const defaultPath = path.join(__dirname, '..', '..', '..', '..', 'binaries', 'osv-scanner');
  try {
    if (fs.existsSync(defaultPath)) {
      _binaryPath = defaultPath;
    } else {
      _binaryPath = '';
    }
  } catch {
    _binaryPath = '';
  }
  return _binaryPath;
}

function isBinaryAvailable() {
  return Boolean(getBinaryPath());
}

/**
 * Extract dependencies from a package.json content.
 * @param {string} content
 * @returns {Array<{name: string, version: string, ecosystem: string}>}
 */
function parsePackageJson(content) {
  try {
    const pkg = JSON.parse(content);
    const deps = [];
    const ecosystems = [
      ['dependencies', 'npm'],
      ['devDependencies', 'npm'],
      ['peerDependencies', 'npm'],
      ['optionalDependencies', 'npm'],
    ];
    for (const [key, ecosystem] of ecosystems) {
      if (pkg[key] && typeof pkg[key] === 'object') {
        for (const [name, version] of Object.entries(pkg[key])) {
          deps.push({ name, version: String(version).replace(/[\^~>=<]/g, ''), ecosystem });
        }
      }
    }
    return deps;
  } catch {
    return [];
  }
}

/**
 * Extract dependencies from a requirements.txt content.
 * @param {string} content
 * @returns {Array<{name: string, version: string, ecosystem: string}>}
 */
function parseRequirementsTxt(content) {
  const deps = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
    const match = trimmed.match(/^([A-Za-z0-9_-]+)\s*(?:==|>=|<=|~=|!=)?\s*([0-9A-Za-z.]*)/);
    if (match) {
      deps.push({ name: match[1], version: match[2] || '', ecosystem: 'PyPI' });
    }
  }
  return deps;
}

/**
 * Extract dependencies from a go.mod content.
 * @param {string} content
 * @returns {Array<{name: string, version: string, ecosystem: string}>}
 */
function parseGoMod(content) {
  const deps = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*(?:require\s+)?([A-Za-z0-9./_-]+)\s+(v[0-9.]+)/);
    if (match) {
      deps.push({ name: match[1], version: match[2], ecosystem: 'Go' });
    }
  }
  return deps;
}

/**
 * Parse a manifest file and extract dependencies.
 * @param {string} content
 * @param {string} fileName
 * @returns {Array}
 */
function parseManifest(content, fileName) {
  if (fileName === 'package.json') return parsePackageJson(content);
  if (fileName === 'requirements.txt') return parseRequirementsTxt(content);
  if (fileName === 'go.mod') return parseGoMod(content);
  return [];
}

/**
 * Query the OSV.dev API for a single dependency.
 * @param {{name: string, version: string, ecosystem: string}} dep
 * @returns {Promise<Array>}
 */
async function queryOsvApi(dep) {
  try {
    const res = await fetch('https://api.osv.dev/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: dep.version,
        package: { name: dep.name, ecosystem: dep.ecosystem },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.vulns || !Array.isArray(data.vulns)) return [];
    return data.vulns.map((v) => ({
      id: v.id,
      summary: v.summary || '',
      severity: v.severity?.[0]?.score || 'unknown',
      url: `https://osv.dev/vulnerability/${v.id}`,
      package: dep.name,
      version: dep.version,
      ecosystem: dep.ecosystem,
      source: 'osv-api',
    }));
  } catch {
    return [];
  }
}

/**
 * Scan dependencies for vulnerabilities using the OSV API.
 * @param {Array<{name: string, version: string, ecosystem: string}>} deps
 * @returns {Promise<Array>}
 */
async function scanDependenciesViaApi(deps) {
  const results = await Promise.all(deps.map(queryOsvApi));
  return results.flat();
}

/**
 * Scan a manifest file content for vulnerabilities.
 * @param {string} content
 * @param {string} [fileName='package.json']
 * @returns {Promise<Array>}
 */
async function scanContent(content, fileName = 'package.json') {
  const deps = parseManifest(content, fileName);
  if (deps.length === 0) return [];
  return scanDependenciesViaApi(deps);
}

/**
 * Scan a directory for dependency vulnerabilities.
 * @param {string} dirPath
 * @returns {Promise<Array>}
 */
async function scanDirectory(dirPath) {
  const manifestNames = ['package.json', 'requirements.txt', 'go.mod'];
  const allDeps = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (/node_modules|\.git|dist|build|coverage/.test(entry.name)) continue;
        walk(full);
      } else if (entry.isFile() && manifestNames.includes(entry.name)) {
        try {
          const content = fs.readFileSync(full, 'utf8');
          const deps = parseManifest(content, entry.name);
          allDeps.push(...deps);
        } catch {
          // skip
        }
      }
    }
  };
  walk(dirPath);
  if (allDeps.length === 0) return [];
  return scanDependenciesViaApi(allDeps);
}

/**
 * Quick check: is a manifest free of known vulnerabilities?
 * @param {string} content
 * @param {string} [fileName]
 * @returns {Promise<{safe: boolean, findings: Array}>}
 */
async function isSafe(content, fileName = 'package.json') {
  const findings = await scanContent(content, fileName);
  return { safe: findings.length === 0, findings };
}

module.exports = {
  isBinaryAvailable,
  getBinaryPath,
  parseManifest,
  scanContent,
  scanDirectory,
  scanDependenciesViaApi,
  isSafe,
};
