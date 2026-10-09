/**
 * PtyManager — Pseudoterminal management using node-pty (MIT).
 *
 * Spawns persistent shell sessions with PTY support, enabling interactive
 * terminal commands, long-running processes, and output streaming. Falls
 * back to child_process.spawn when node-pty is not installed.
 *
 * License: MIT (node-pty, Microsoft)
 */

const { spawn } = require('child_process');

let _pty = null;
let _ptyReady = false;
let _attempted = false;

function tryLoadPty() {
  if (_attempted) return _ptyReady;
  _attempted = true;
  try {
    _pty = require('node-pty');
    _ptyReady = true;
  } catch {
    try {
      _pty = require('@terminus-term/node-pty');
      _ptyReady = true;
    } catch {
      _ptyReady = false;
    }
  }
  return _ptyReady;
}

const _sessions = new Map();

/**
 * Spawn a persistent PTY session.
 * @param {object} opts
 * @param {string} [opts.shell] - shell binary (default: bash or powershell)
 * @param {string} [opts.cwd] - working directory
 * @param {object} [opts.env] - environment variables
 * @param {number} [opts.cols=80]
 * @param {number} [opts.rows=30]
 * @param {function} [opts.onData] - callback for output data
 * @returns {{id: string, write: function, resize: function, kill: function, pid: number}}
 */
function spawnSession(opts = {}) {
  const id = `pty_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const shell =
    opts.shell || (process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash');
  const cwd = opts.cwd || process.cwd();
  const env = opts.env || process.env;
  const cols = opts.cols || 80;
  const rows = opts.rows || 30;
  const onData = opts.onData || (() => {});

  if (tryLoadPty()) {
    const ptyProcess = _pty.spawn(shell, [], { name: 'xterm-color', cols, rows, cwd, env });
    ptyProcess.onData((data) => onData(data, id));
    const session = {
      id,
      pid: ptyProcess.pid,
      write: (input) => ptyProcess.write(input),
      resize: (c, r) => ptyProcess.resize(c, r),
      kill: () => {
        try {
          ptyProcess.kill();
        } catch {
          // ignore
        }
        _sessions.delete(id);
      },
    };
    _sessions.set(id, session);
    return session;
  }

  // Fallback: child_process
  const child = spawn(shell, [], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdout.on('data', (data) => onData(data.toString(), id));
  child.stderr.on('data', (data) => onData(data.toString(), id));
  const session = {
    id,
    pid: child.pid,
    write: (input) => child.stdin.write(input),
    resize: () => {},
    kill: () => {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      _sessions.delete(id);
    },
  };
  child.on('exit', () => _sessions.delete(id));
  _sessions.set(id, session);
  return session;
}

/**
 * Get an active session by id.
 * @param {string} id
 * @returns {object|null}
 */
function getSession(id) {
  return _sessions.get(id) || null;
}

/**
 * List active sessions.
 * @returns {Array}
 */
function listSessions() {
  return Array.from(_sessions.keys());
}

/**
 * Kill all sessions.
 */
function killAll() {
  for (const session of _sessions.values()) {
    try {
      session.kill();
    } catch {
      // ignore
    }
  }
  _sessions.clear();
}

module.exports = {
  tryLoadPty,
  spawnSession,
  getSession,
  listSessions,
  killAll,
};
