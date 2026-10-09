/**
 * SandboxRunner — runs shell commands in an OS-level sandbox when available
 * (bubblewrap on Linux, sandbox-exec on macOS), falling back to direct
 * execution. Prevents destructive operations when the agent can execute
 * arbitrary shell commands (OPENDEV safety principle).
 *
 * Bubblewrap is optional: if the binary is not present, we fall back to
 * direct execution and set `sandboxed: false`.
 */

const { exec } = require('child_process');
const fs = require('fs');

const BWRAP = '/usr/bin/bwrap';
const SANDBOX_EXEC = '/usr/bin/sandbox-exec';

/**
 * Detect the best available sandbox binary.
 * @returns {string|null}
 */
function detectSandbox() {
  if (process.env.HARNESS_SANDBOX === 'off') {
    return null;
  }
  if (process.env.HARNESS_SANDBOX_BIN && fs.existsSync(process.env.HARNESS_SANDBOX_BIN)) {
    return process.env.HARNESS_SANDBOX_BIN;
  }
  if (fs.existsSync(BWRAP) && process.platform === 'linux') {
    return BWRAP;
  }
  if (fs.existsSync(SANDBOX_EXEC) && process.platform === 'darwin') {
    return SANDBOX_EXEC;
  }
  return null;
}

/**
 * Wrap a command in a bubblewrap invocation that shares the host network
 * (needed for git, npm) but isolates the filesystem to the project dir.
 * @param {string} command
 * @param {object} opts { cwd }
 * @returns {string}
 */
function wrapBwrap(command, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  return (
    `${BWRAP} --ro-share / --ro-share /usr --ro-share /lib --ro-share /lib64 ` +
    `--ro-share /bin --ro-share /etc --bind ${cwd} ${cwd} --dev /dev --proc /proc ` +
    `--unshare-pid --die-with-parent -- /bin/sh -c ${shellQuote(command)}`
  );
}

function shellQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

/**
 * Run a command, sandboxed when possible.
 * @param {object} session
 * @param {string} command
 * @param {object} opts { cwd, timeout, env }
 * @returns {Promise<{stdout:string, stderr:string, code:number, sandboxed:boolean}>}
 */
function run(session, command, opts = {}) {
  const sandbox = detectSandbox();
  const cwd = opts.cwd || (session && session.cwd) || process.cwd();
  const finalCommand = sandbox === BWRAP ? wrapBwrap(command, { cwd }) : command;
  const execOpts = {
    cwd,
    maxBuffer: (opts.maxBuffer || 1024) * 1024,
    timeout: opts.timeout || 120000,
    env: opts.env || process.env,
  };
  return new Promise((resolve) => {
    exec(finalCommand, execOpts, (err, stdout, stderr) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || (err ? err.message : ''),
        code: err ? err.code || 1 : 0,
        sandboxed: sandbox !== null,
      });
    });
  });
}

module.exports = { detectSandbox, wrapBwrap, run };
