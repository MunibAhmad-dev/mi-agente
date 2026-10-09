/**
 * ComputerUseBridge — gives the agent screen-control capabilities (click,
 * type, screenshot) like Self-Operating Computer (MIT) and nuphus-mcp.
 *
 * Architecture:
 *   - Primary: optional 'robotjs' npm package for mouse/keyboard
 *   - Fallback: shell commands (screencapture on macOS, scrot on Linux)
 *   - Screenshot: native OS capture, returns base64
 *
 * Zero mandatory dependencies: if robotjs is not installed, click/type
 * return a clear "not available" error instead of crashing. Screenshots
 * use OS-native tools.
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let _robotjs = null;
let _robotjsAttempted = false;

function tryLoadRobotJS() {
  if (_robotjsAttempted) return _robotjs;
  _robotjsAttempted = true;
  try {
    _robotjs = require('robotjs');
  } catch {
    _robotjs = null;
  }
  return _robotjs;
}

/**
 * Check if computer-use is available.
 * @returns {boolean}
 */
function available() {
  return tryLoadRobotJS() !== null;
}

/**
 * Take a screenshot. Uses OS-native capture.
 * @returns {Promise<{base64: string, format: string, width: number, height: number}>}
 */
function screenshot() {
  return new Promise((resolve) => {
    const tmpFile = path.join(os.tmpdir(), `screenshot-${Date.now()}.png`);
    let cmd;
    if (process.platform === 'darwin') {
      cmd = `screencapture -x ${tmpFile}`;
    } else if (process.platform === 'linux') {
      cmd = `scrot ${tmpFile} 2>/dev/null || gnome-screenshot -f ${tmpFile} 2>/dev/null || import -window root ${tmpFile}`;
    } else {
      resolve({ error: `screenshot not supported on ${process.platform}` });
      return;
    }
    exec(cmd, { timeout: 5000 }, (err) => {
      if (err || !fs.existsSync(tmpFile)) {
        resolve({ error: 'screenshot capture failed' });
        return;
      }
      try {
        const buffer = fs.readFileSync(tmpFile);
        resolve({
          base64: buffer.toString('base64'),
          format: 'png',
          size: buffer.length,
        });
      } catch {
        resolve({ error: 'failed to read screenshot' });
      } finally {
        try {
          fs.unlinkSync(tmpFile);
        } catch {
          /* ignore */
        }
      }
    });
  });
}

/**
 * Click at screen coordinates.
 * @param {number} x
 * @param {number} y
 * @param {string} button 'left'|'right'|'middle'
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function click(x, y, button = 'left') {
  const r = tryLoadRobotJS();
  if (!r) {
    return { success: false, error: 'robotjs not installed — run: npm install robotjs' };
  }
  try {
    r.moveMouse(x, y);
    r.mouseClick(button);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Type text at the current cursor position.
 * @param {string} text
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function type(text) {
  const r = tryLoadRobotJS();
  if (!r) {
    return { success: false, error: 'robotjs not installed — run: npm install robotjs' };
  }
  try {
    r.typeString(text);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Press a key (e.g. 'enter', 'escape', 'tab').
 * @param {string} key
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function key(key) {
  const r = tryLoadRobotJS();
  if (!r) {
    return { success: false, error: 'robotjs not installed' };
  }
  try {
    r.keyTap(key);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Scroll the mouse wheel.
 * @param {number} amount positive=down, negative=up
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function scroll(amount = 1) {
  const r = tryLoadRobotJS();
  if (!r) {
    return { success: false, error: 'robotjs not installed' };
  }
  try {
    r.scrollMouse(0, amount * 100);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Get current mouse position.
 * @returns {Promise<{x: number, y: number}>}
 */
async function getMousePos() {
  const r = tryLoadRobotJS();
  if (!r) {
    return { error: 'robotjs not installed' };
  }
  try {
    return r.getMousePos();
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Get screen dimensions.
 * @returns {Promise<{width: number, height: number}>}
 */
async function getScreenSize() {
  const r = tryLoadRobotJS();
  if (!r) {
    return { error: 'robotjs not installed' };
  }
  try {
    return r.getScreenSize();
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = {
  available,
  screenshot,
  click,
  type,
  key,
  scroll,
  getMousePos,
  getScreenSize,
};
