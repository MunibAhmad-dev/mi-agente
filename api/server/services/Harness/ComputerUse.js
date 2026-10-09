/**
 * ComputerUse — GUI automation and computer control for the agent harness.
 *
 * Capabilities:
 *   1. Screen capture  — Take screenshots of the desktop or browser
 *   2. Mouse control   — Click, move, scroll, drag
 *   3. Keyboard control — Type text, press key combinations
 *   4. Browser control  — Navigate, click, fill forms, extract content (via Playwright)
 *   5. Window management — List windows, focus, resize
 *   6. Clipboard        — Read/write clipboard content
 *
 * Cross-platform:
 *   - Windows: PowerShell commands, nircmd
 *   - Linux: xdotool, scrot, xclip
 *   - macOS: osascript, screencapture
 *
 * Browser automation uses Playwright (already in the project).
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const logger = {
  info: (...args) => console.info('[ComputerUse]', ...args),
  warn: (...args) => console.warn('[ComputerUse]', ...args),
  error: (...args) => console.error('[ComputerUse]', ...args),
};

/**
 * Detect the current platform.
 */
function getPlatform() {
  const p = process.platform;
  if (p === 'win32') return 'windows';
  if (p === 'darwin') return 'macos';
  return 'linux';
}

/**
 * Execute a shell command safely.
 */
function shell(command, options = {}) {
  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      timeout: options.timeout || 30000,
      maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
      windowsHide: true,
      ...options,
    });
    return { success: true, output: result || '' };
  } catch (error) {
    return { success: false, output: error.stdout || '', error: error.stderr || error.message };
  }
}

/**
 * ComputerUse — GUI automation capabilities.
 */
class ComputerUse {
  constructor(config = {}) {
    this.config = {
      screenshotDir: config.screenshotDir || path.join(process.cwd(), '.screenshots'),
      maxScreenshotWidth: config.maxScreenshotWidth || 1920,
      browserHeadless: config.browserHeadless !== false,
      browserTimeout: config.browserTimeout || 30000,
      ...config,
    };

    this._platform = getPlatform();
    this._browser = null; // Playwright browser instance (lazy)
    this._page = null;    // Playwright page instance

    // Ensure screenshot directory exists
    if (!fs.existsSync(this.config.screenshotDir)) {
      fs.mkdirSync(this.config.screenshotDir, { recursive: true });
    }

    logger.info(`[ComputerUse] Platform: ${this._platform}`);
  }

  // ============================================================
  // SCREEN CAPTURE
  // ============================================================

  /**
   * Take a screenshot of the entire screen.
   * @returns {Promise<{success: boolean, path?: string, error?: string}>}
   */
  async screenshot() {
    const filename = `screen_${Date.now()}.png`;
    const filePath = path.join(this.config.screenshotDir, filename);

    switch (this._platform) {
      case 'windows': {
        // Use PowerShell to capture screen
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          Add-Type -AssemblyName System.Drawing
          $screen = [System.Windows.Forms.Screen]::PrimaryScreen
          $bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
          $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
          $graphics.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
          $bitmap.Save('${filePath.replace(/\\/g, '\\\\')}')
          $graphics.Dispose()
          $bitmap.Dispose()
        `.trim();
        const result = shell(`powershell -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`, { timeout: 15000 });
        if (result.success && fs.existsSync(filePath)) {
          return { success: true, path: filePath, platform: 'windows' };
        }
        // Fallback: use nircmd if available
        const fallback = shell(`nircmd savescreenshot "${filePath}"`, { timeout: 10000 });
        if (fallback.success && fs.existsSync(filePath)) {
          return { success: true, path: filePath, platform: 'windows' };
        }
        return { success: false, error: 'Screen capture failed on Windows' };
      }

      case 'linux': {
        // Try scrot, then import (ImageMagick), then gnome-screenshot
        const commands = [
          `scrot "${filePath}"`,
          `import -window root "${filePath}"`,
          `gnome-screenshot -f "${filePath}"`,
        ];
        for (const cmd of commands) {
          const result = shell(cmd, { timeout: 10000 });
          if (result.success && fs.existsSync(filePath)) {
            return { success: true, path: filePath, platform: 'linux' };
          }
        }
        return { success: false, error: 'Screen capture failed on Linux (install scrot or imagemagick)' };
      }

      case 'macos': {
        const result = shell(`screencapture -x "${filePath}"`, { timeout: 10000 });
        if (result.success && fs.existsSync(filePath)) {
          return { success: true, path: filePath, platform: 'macos' };
        }
        return { success: false, error: 'Screen capture failed on macOS' };
      }

      default:
        return { success: false, error: `Unsupported platform: ${this._platform}` };
    }
  }

  /**
   * Take a screenshot of the current browser page (via Playwright).
   */
  async browserScreenshot() {
    if (!this._page) {
      return { success: false, error: 'No browser page open. Use browser_navigate first.' };
    }

    try {
      const filename = `browser_${Date.now()}.png`;
      const filePath = path.join(this.config.screenshotDir, filename);
      await this._page.screenshot({ path: filePath, fullPage: false });
      return { success: true, path: filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ============================================================
  // MOUSE CONTROL
  // ============================================================

  /**
   * Move the mouse to absolute coordinates.
   */
  async mouseMove(x, y) {
    switch (this._platform) {
      case 'windows':
        shell(`powershell -Command "Add-Type '[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})'"`, { timeout: 5000 });
        break;
      case 'linux':
        shell(`xdotool mousemove ${x} ${y}`, { timeout: 5000 });
        break;
      case 'macos':
        shell(`osascript -e 'tell application "System Events" to set position of mouse to {${x}, ${y}}'`, { timeout: 5000 });
        break;
    }
    return { success: true, x, y };
  }

  /**
   * Click at coordinates.
   */
  async mouseClick(x, y, button = 'left') {
    switch (this._platform) {
      case 'windows': {
        const btn = button === 'right' ? 2 : 0;
        shell(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y}); $mouse = New-Object System.Windows.Forms.MouseSimulator; $mouse.Click(${btn})"`, { timeout: 5000 });
        break;
      }
      case 'linux': {
        const btnFlag = button === 'right' ? '3' : '1';
        shell(`xdotool mousemove ${x} ${y} click ${btnFlag}`, { timeout: 5000 });
        break;
      }
      case 'macos':
        shell(`cliclick m:${x},${y} c.`, { timeout: 5000 });
        break;
    }
    return { success: true, x, y, button };
  }

  /**
   * Double-click at coordinates.
   */
  async mouseDoubleClick(x, y) {
    switch (this._platform) {
      case 'linux':
        shell(`xdotool mousemove ${x} ${y} click --repeat 2 1`, { timeout: 5000 });
        break;
      case 'macos':
        shell(`cliclick m:${x},${y} dd`, { timeout: 5000 });
        break;
      default:
        await this.mouseClick(x, y);
        await new Promise(r => setTimeout(r, 100));
        await this.mouseClick(x, y);
    }
    return { success: true, x, y };
  }

  /**
   * Scroll at current position.
   */
  async mouseScroll(direction, amount = 3) {
    const delta = direction === 'down' ? amount : -amount;
    switch (this._platform) {
      case 'linux':
        shell(`xdotool click 4 ${delta > 0 ? `--repeat ${Math.abs(delta)} 5` : `--repeat ${Math.abs(delta)} 4`}`, { timeout: 5000 });
        break;
      case 'windows':
        shell(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{${delta > 0 ? 'PGDN' : 'PGUP'}}')"` , { timeout: 5000 });
        break;
      case 'macos':
        shell(`osascript -e 'tell application "System Events" to scroll area 1 of window 1 by {0, ${delta * 20}}'`, { timeout: 5000 });
        break;
    }
    return { success: true, direction, amount: Math.abs(delta) };
  }

  // ============================================================
  // KEYBOARD CONTROL
  // ============================================================

  /**
   * Type text at the current cursor position.
   */
  async typeText(text) {
    switch (this._platform) {
      case 'windows':
        // Use PowerShell SendKeys
        shell(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${text.replace(/'/g, "''")}')"` , { timeout: 10000 });
        break;
      case 'linux':
        shell(`xdotool type --delay 20 "${text.replace(/"/g, '\\"')}"`, { timeout: 10000 });
        break;
      case 'macos':
        shell(`osascript -e 'tell application "System Events" to keystroke "${text.replace(/"/g, '\\"')}"'`, { timeout: 10000 });
        break;
    }
    return { success: true, text: text.slice(0, 100) + (text.length > 100 ? '...' : '') };
  }

  /**
   * Press a key or key combination.
   * Examples: 'enter', 'tab', 'ctrl+c', 'alt+f4', 'super', 'escape'
   */
  async pressKey(key) {
    const normalizedKey = this._normalizeKey(key);

    switch (this._platform) {
      case 'windows':
        shell(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${normalizedKey}')"`, { timeout: 5000 });
        break;
      case 'linux':
        shell(`xdotool key ${normalizedKey}`, { timeout: 5000 });
        break;
      case 'macos':
        if (key.includes('+')) {
          const parts = key.split('+');
          const modifiers = parts.slice(0, -1).map(m => this._macModifier(m)).join(' ');
          shell(`osascript -e 'tell application "System Events" to keystroke "${parts[parts.length - 1]}" using {${modifiers}}'`, { timeout: 5000 });
        } else {
          shell(`osascript -e 'tell application "System Events" to keystroke "${normalizedKey}"'`, { timeout: 5000 });
        }
        break;
    }
    return { success: true, key };
  }

  /**
   * Press a special key (enter, tab, escape, etc.)
   */
  async pressSpecialKey(keyName) {
    const keyMap = {
      enter: 'Return', tab: 'Tab', escape: 'Escape', backspace: 'BackSpace',
      delete: 'Delete', space: 'space', up: 'Up', down: 'Down',
      left: 'Left', right: 'Right', home: 'Home', end: 'End',
      pageup: 'Page_Up', pagedown: 'Page_Down',
      f1: 'F1', f2: 'F2', f3: 'F3', f4: 'F4', f5: 'F5', f6: 'F6',
      f7: 'F7', f8: 'F8', f9: 'F9', f10: 'F10', f11: 'F11', f12: 'F12',
    };
    const key = keyMap[keyName.toLowerCase()] || keyName;
    return this.pressKey(key);
  }

  // ============================================================
  // BROWSER AUTOMATION (via Playwright)
  // ============================================================

  /**
   * Open a URL in the automated browser.
   */
  async browserNavigate(url) {
    try {
      const pw = await this._getPlaywright();
      if (!this._page) {
        const browser = await pw.chromium.launch({
          headless: this.config.browserHeadless,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        this._browser = browser;
        this._page = await browser.newPage();
      }
      await this._page.goto(url, { timeout: this.config.browserTimeout, waitUntil: 'domcontentloaded' });
      const title = await this._page.title();
      return { success: true, url, title };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Click an element on the browser page.
   */
  async browserClick(selector) {
    if (!this._page) return { success: false, error: 'No browser page open' };
    try {
      await this._page.click(selector, { timeout: 10000 });
      return { success: true, selector };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Type text into a browser input.
   */
  async browserType(selector, text) {
    if (!this._page) return { success: false, error: 'No browser page open' };
    try {
      await this._page.fill(selector, text, { timeout: 10000 });
      return { success: true, selector, text: text.slice(0, 100) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get text content from the browser page.
   */
  async browserGetText() {
    if (!this._page) return { success: false, error: 'No browser page open' };
    try {
      const text = await this._page.evaluate(() => document.body.innerText);
      return { success: true, text: text.slice(0, 50000) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get the current browser URL.
   */
  async browserGetUrl() {
    if (!this._page) return { success: false, error: 'No browser page open' };
    try {
      return { success: true, url: this._page.url() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Wait for a selector to appear.
   */
  async browserWaitFor(selector, timeout = 10000) {
    if (!this._page) return { success: false, error: 'No browser page open' };
    try {
      await this._page.waitForSelector(selector, { timeout });
      return { success: true, selector };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute JavaScript in the browser.
   */
  async browserEvaluate(expression) {
    if (!this._page) return { success: false, error: 'No browser page open' };
    try {
      const result = await this._page.evaluate(expression);
      return { success: true, result: typeof result === 'string' ? result.slice(0, 10000) : JSON.stringify(result).slice(0, 10000) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Close the browser.
   */
  async browserClose() {
    if (this._browser) {
      try { await this._browser.close(); } catch {}
      this._browser = null;
      this._page = null;
    }
    return { success: true };
  }

  // ============================================================
  // WINDOW MANAGEMENT
  // ============================================================

  /**
   * List open windows.
   */
  async listWindows() {
    switch (this._platform) {
      case 'windows': {
        const result = shell(`powershell -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object ProcessName, MainWindowTitle, Id | ConvertTo-Json"`, { timeout: 10000 });
        try { return { success: true, windows: JSON.parse(result.output) }; }
        catch { return { success: true, windows: [] }; }
      }
      case 'linux': {
        const result = shell(`wmctrl -l`, { timeout: 5000 });
        const windows = result.output.split('\n').filter(Boolean).map(line => {
          const parts = line.split(/\s+/);
          return { id: parts[0], title: parts.slice(2).join(' ') };
        });
        return { success: true, windows };
      }
      case 'macos': {
        const result = shell(`osascript -e 'tell application "System Events" to get name of every window of every process whose visible is true'`, { timeout: 5000 });
        return { success: true, windows: result.output.split(', ').filter(Boolean) };
      }
    }
    return { success: false, error: 'Unsupported platform' };
  }

  // ============================================================
  // CLIPBOARD
  // ============================================================

  /**
   * Read clipboard content.
   */
  async clipboardRead() {
    switch (this._platform) {
      case 'windows':
        return { success: true, text: shell(`powershell -Command "Get-Clipboard"`).output.trim() };
      case 'linux':
        return { success: true, text: shell(`xclip -selection clipboard -o`).output };
      case 'macos':
        return { success: true, text: shell(`pbpaste`).output };
    }
    return { success: false, error: 'Unsupported platform' };
  }

  /**
   * Write to clipboard.
   */
  async clipboardWrite(text) {
    switch (this._platform) {
      case 'windows':
        shell(`powershell -Command "Set-Clipboard -Value '${text.replace(/'/g, "''")}'"`);
        break;
      case 'linux':
        shell(`echo -n "${text.replace(/"/g, '\\"')}" | xclip -selection clipboard`);
        break;
      case 'macos':
        shell(`echo -n "${text.replace(/"/g, '\\"')}" | pbcopy`);
        break;
    }
    return { success: true };
  }

  // ============================================================
  // HELPERS
  // ============================================================

  async _getPlaywright() {
    try {
      return require('playwright');
    } catch {
      try {
        return require('@playwright/test');
      } catch {
        throw new Error('Playwright not installed. Run: npm install playwright');
      }
    }
  }

  _normalizeKey(key) {
    const map = {
      enter: 'Return', tab: 'Tab', escape: 'Escape', backspace: 'BackSpace',
      delete: 'Delete', space: 'space', up: 'Up', down: 'Down',
      left: 'Left', right: 'Right', home: 'Home', end: 'End',
      ctrl: 'ctrl', alt: 'alt', shift: 'shift', super: 'super',
    };
    if (key.includes('+')) {
      return key.split('+').map(k => map[k.toLowerCase()] || k).join('+');
    }
    return map[key.toLowerCase()] || key;
  }

  _macModifier(mod) {
    const map = { ctrl: 'command', alt: 'option', shift: 'shift', super: 'command', cmd: 'command' };
    return map[mod.toLowerCase()] || mod;
  }

  /**
   * Get platform info.
   */
  getPlatform() {
    return this._platform;
  }
}

module.exports = { ComputerUse, getPlatform, shell };
