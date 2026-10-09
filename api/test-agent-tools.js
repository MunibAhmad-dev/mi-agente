'use strict';
/**
 * Live test: ComputerControl + FilesystemOps + BrowserTool
 * Run: node api/test-agent-tools.js
 */

const path = require('path');

// Register module alias so ~ resolves to api/
require('module-alias').addAlias('~', path.join(__dirname));

const ComputerControl = require('./app/clients/tools/structured/ComputerControl');
const FilesystemOps = require('./app/clients/tools/structured/FilesystemOps');
const BrowserTool = require('./app/clients/tools/structured/BrowserTool');

const PASS = '\x1b[32m✓ PASS\x1b[0m';
const FAIL = '\x1b[31m✗ FAIL\x1b[0m';

function log(label, result) {
  let data;
  try { data = JSON.parse(result); } catch { data = { raw: result }; }
  const ok = !data.error;
  console.log(`\n${ok ? PASS : FAIL} ${label}`);
  console.log(JSON.stringify(data, null, 2));
  return ok;
}

async function run() {
  console.log('\n======================================');
  console.log('  MI-AGENTE — AGENT TOOLS LIVE TEST');
  console.log('======================================\n');

  const cc = new ComputerControl();
  const fs = new FilesystemOps();
  const br = new BrowserTool();
  const results = {};

  // ── TEST 1: Screenshot ──────────────────────────────────────────────────────
  console.log('\n── TEST 1: Screenshot of desktop ──');
  const shot = await cc._call({ action: 'screenshot' });
  results.screenshot = log('computer_control { action: screenshot }', shot);

  // ── TEST 2: Screen size ─────────────────────────────────────────────────────
  console.log('\n── TEST 2: Get screen resolution ──');
  const size = await cc._call({ action: 'screen_size' });
  results.screenSize = log('computer_control { action: screen_size }', size);

  // ── TEST 3: List open windows ───────────────────────────────────────────────
  console.log('\n── TEST 3: List open windows ──');
  const wins = await cc._call({ action: 'list_windows' });
  results.listWindows = log('computer_control { action: list_windows }', wins);

  // ── TEST 4: Create directory ────────────────────────────────────────────────
  const testDir = path.join(require('os').homedir(), 'Desktop', 'agente-demo');
  console.log('\n── TEST 4: Create folder agente-demo on Desktop ──');
  const mkdir = await fs._call({ action: 'create_dir', path: testDir });
  results.createDir = log('filesystem_ops { action: create_dir }', mkdir);

  // ── TEST 5: Write file ──────────────────────────────────────────────────────
  const testFile = path.join(testDir, 'info.txt');
  console.log('\n── TEST 5: Write info.txt inside agente-demo ──');
  const write = await fs._call({
    action: 'write',
    path: testFile,
    content: `Mi Agente — Demostración de capacidades\nFecha: ${new Date().toLocaleString()}\n\nEl agente puede:\n- Tomar capturas de pantalla\n- Crear proyectos y archivos\n- Navegar la web\n- Controlar el escritorio\n`,
  });
  results.writeFile = log('filesystem_ops { action: write, path: info.txt }', write);

  // ── TEST 6: Read file back ──────────────────────────────────────────────────
  console.log('\n── TEST 6: Read info.txt back ──');
  const read = await fs._call({ action: 'read', path: testFile });
  results.readFile = log('filesystem_ops { action: read }', read);

  // ── TEST 7: List directory ──────────────────────────────────────────────────
  console.log('\n── TEST 7: List Desktop/agente-demo ──');
  const list = await fs._call({ action: 'list', path: testDir });
  results.listDir = log('filesystem_ops { action: list }', list);

  // ── TEST 8: Open Notepad ────────────────────────────────────────────────────
  console.log('\n── TEST 8: Open Notepad ──');
  const notepad = await cc._call({ action: 'open_app', app: 'notepad' });
  results.openApp = log('computer_control { action: open_app, app: notepad }', notepad);

  // ── TEST 9: Browser — web search ───────────────────────────────────────────
  console.log('\n── TEST 9: Browser — search "Ollama latest models" ──');
  try {
    const search = await br._call({ action: 'search', query: 'Ollama latest models 2024' });
    results.browserSearch = log('browser_use { action: search }', search);
  } catch (e) {
    console.log(`${FAIL} browser_use: ${e.message}`);
    results.browserSearch = false;
  }

  // ── SUMMARY ─────────────────────────────────────────────────────────────────
  console.log('\n\n======================================');
  console.log('  SUMMARY');
  console.log('======================================');
  let passed = 0;
  for (const [name, ok] of Object.entries(results)) {
    console.log(`  ${ok ? PASS : FAIL}  ${name}`);
    if (ok) passed++;
  }
  const total = Object.keys(results).length;
  console.log(`\n  ${passed}/${total} tests passed`);
  console.log('======================================\n');

  if (results.screenshot) {
    const shotData = JSON.parse(await cc._call({ action: 'screenshot' }));
    if (shotData.path) {
      console.log(`\n📸 Screenshot saved to: ${shotData.path}`);
      console.log(`📁 Project folder created at: ${testDir}`);
    }
  }
}

run().catch(e => {
  console.error('\nFatal error:', e.message);
  process.exit(1);
});
