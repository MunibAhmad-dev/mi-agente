#!/usr/bin/env node
'use strict';
/**
 * postinstall.js — runs automatically after `npm install`
 *
 * 1. Installs Playwright Chromium browser (needed for website cloning + visual QA)
 * 2. Checks Ollama connectivity and prints a helpful message if not running
 *
 * Both steps are best-effort — failures print a warning but never break the install.
 */

const { execSync, spawnSync } = require('child_process');
const https = require('https');
const http = require('http');

const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const RESET  = '\x1b[0m';

function ok(msg)   { console.log(`${GREEN}  ✅ ${msg}${RESET}`); }
function warn(msg) { console.log(`${YELLOW}  ⚠️  ${msg}${RESET}`); }
function info(msg) { console.log(`${CYAN}  ℹ️  ${msg}${RESET}`); }

// ── 1. Playwright Chromium ────────────────────────────────────────────────────

console.log('\n📦 mi-agente postinstall — setting up optional dependencies\n');

info('Installing Playwright Chromium (website cloning + visual QA)...');
try {
  // Try with --with-deps first (Linux), fall back to plain install (Mac/Windows)
  let result = spawnSync(
    process.execPath,
    ['node_modules/.bin/playwright', 'install', 'chromium', '--with-deps'],
    { stdio: 'pipe', timeout: 120000 },
  );

  if (result.status !== 0) {
    result = spawnSync(
      process.execPath,
      ['node_modules/.bin/playwright', 'install', 'chromium'],
      { stdio: 'pipe', timeout: 120000 },
    );
  }

  if (result.status === 0) {
    ok('Playwright Chromium installed — website cloning and visual QA are ready');
  } else {
    const stderr = result.stderr ? result.stderr.toString().trim() : '';
    warn(`Playwright install returned non-zero. Website cloning will still work for HTML-only endpoints.`);
    if (stderr) warn(`  Hint: ${stderr.split('\n')[0]}`);
    info('  To install manually: npx playwright install chromium');
  }
} catch (e) {
  warn(`Playwright not found — skipping browser install. Run: npx playwright install chromium`);
}

// ── 2. Ollama connectivity check ──────────────────────────────────────────────

info('\nChecking Ollama connectivity...');

const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

function checkOllama(url) {
  return new Promise((resolve) => {
    const parsed = new URL(url + '/api/version');
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get({ hostname: parsed.hostname, port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80), path: parsed.pathname, timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ ok: true, version: JSON.parse(data).version }); }
        catch { resolve({ ok: res.statusCode === 200, version: null }); }
      });
    });
    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
  });
}

(async () => {
  const result = await checkOllama(ollamaUrl);
  if (result.ok) {
    ok(`Ollama connected at ${ollamaUrl}${result.version ? ` (v${result.version})` : ''}`);
    ok('E2E LLM flow is ready — run: npm run e2e:llm');
  } else {
    warn(`Ollama not running at ${ollamaUrl}`);
    console.log(`
  ${CYAN}To enable local LLM (free, no API key needed):${RESET}
    1. Install Ollama: https://ollama.ai
    2. Run: ollama pull llama3.2
    3. Start server: ollama serve
    4. Set in .env: OLLAMA_BASE_URL=${ollamaUrl}

  ${CYAN}Or use a cloud provider — add any of these to .env:${RESET}
    OPENAI_API_KEY=sk-...
    ANTHROPIC_API_KEY=sk-ant-...
    GOOGLE_KEY=AIzaSy...
`);
  }

  console.log(`${GREEN}\n✅ mi-agente setup complete.\n${RESET}`);
  console.log(`  Start: npm run backend:dev  (in one terminal)`);
  console.log(`  Then:  npm run frontend:dev (in another terminal)`);
  console.log(`  Demo:  node e2e_llm.js      (proves full pipeline)\n`);
})();
