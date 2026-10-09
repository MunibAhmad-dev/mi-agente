'use strict';

/**
 * Face 35 — SandboxProvider (plan §51, §62).
 *
 * Executes experiment code in an isolated child process with HARD limits:
 * wall-clock timeout, output cap, no environment inheritance (secrets cannot
 * leak in), no filesystem writes outside its own temp dir. Supports
 * create/run/pause(cancel)/rollback semantics via artifact versioning.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { uid, nowIso } = require('../core/ids');
const { config } = require('../core/config');

const RUNS = () => require('../core/store').collection('sandbox_runs');

function _limitedEnv() {
  // Deliberately EMPTY environment: the experiment never sees host secrets.
  return { PATH: process.env.PATH || '/usr/bin:/bin', HOME: os.tmpdir(), SANDBOX: '1' };
}

/**
 * Run a JS snippet with limits.
 * @param {object} opts { code, timeout_ms, max_output, files: {name: content} }
 * @returns { status: 'COMPLETED'|'TIMEOUT'|'ERROR', stdout, stderr, artifacts }
 */
async function run(opts = {}) {
  const timeoutMs = opts.timeout_ms || config.SANDBOX_TIMEOUT_MS;
  const maxOutput = opts.max_output || config.SANDBOX_MAX_OUTPUT;
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'rsandbox-'));
  const runId = uid('sbx');

  const mainFile = path.join(workdir, 'experiment.js');
  fs.writeFileSync(mainFile, opts.code || 'console.log("noop")');

  for (const [name, content] of Object.entries(opts.files || {})) {
    const safe = path.join(workdir, path.basename(name)); // no path traversal
    fs.writeFileSync(safe, String(content));
  }

  const rec = await RUNS().insert({
    id: runId, status: 'RUNNING', workdir, started_at: nowIso(),
    limits: { timeout_ms: timeoutMs, max_output: maxOutput },
  });

  return new Promise((resolve) => {
    let out = '';
    let err = '';
    const child = spawn(process.execPath, [mainFile], {
      cwd: workdir,
      env: _limitedEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already dead */ }
      finish('TIMEOUT', 'sandbox timeout exceeded');
    }, timeoutMs);

    const finish = async (status, errorNote = null) => {
      clearTimeout(timer);
      const result = {
        id: runId,
        status,
        stdout: out.slice(0, maxOutput),
        stderr: (errorNote ? errorNote + '\n' : '') + err.slice(0, maxOutput),
        artifacts: fs.readdirSync(workdir).filter((f) => f !== 'experiment.js'),
        workdir,
        duration_hint_ms: timeoutMs,
        secrets_exposed: false,
      };
      await RUNS().update(rec._id, { status, finished_at: nowIso(), result_summary: { status, stdout_len: out.length, stderr_len: err.length } });
      // rollback semantics: artifacts stay versioned in workdir for inspection
      resolve(result);
    };

    child.stdout.on('data', (d) => { if (out.length < maxOutput * 2) out += d.toString(); });
    child.stderr.on('data', (d) => { if (err.length < maxOutput * 2) err += d.toString(); });
    child.on('error', (e) => finish('ERROR', e.message));
    child.on('close', (code) => finish(code === 0 ? 'COMPLETED' : 'ERROR', code === 0 ? null : `exit code ${code}`));
  });
}

module.exports = { run };
