/**
 * DesktopController — Desktop Automation (Computer Use)
 * Equivalent to GPT Operator / Manus My Computer
 * 
 * Uses nut.js for desktop control (Apache-2.0, free)
 * Falls back to Playwright for browser-only control
 */

const EventEmitter = require('events');

let nutjs;
try { nutjs = require('@nut-tree/nut-js'); } catch (e) { nutjs = null; }

class DesktopController extends EventEmitter {
  constructor() {
    super();
    this.initialized = false;
    this.nutAvailable = false;
    this.stats = { clicks: 0, types: 0, scrolls: 0, screenshots: 0 };
  }

  async initialize() {
    this.initialized = true;
    if (nutjs) {
      try {
        this.nutAvailable = true;
      } catch (e) { this.nutAvailable = false; }
    }
    return { status: 'ok', module: 'DesktopController', nutAvailable: this.nutAvailable };
  }

  /**
   * Click at coordinates
   */
  async click(x, y, { button = 'left', double = false } = {}) {
    if (!this.nutAvailable) return { success: false, error: 'nut.js not available' };
    try {
      const mouse = new nutjs.Point(x, y);
      await nutjs.mouse.setPosition(mouse);
      if (double) await nutjs.mouse.doubleClick(button);
      else await nutjs.mouse.click(button);
      this.stats.clicks++;
      return { success: true, x, y, button };
    } catch (err) { return { success: false, error: err.message }; }
  }

  /**
   * Type text
   */
  async type(text, { delay = 50 } = {}) {
    if (!this.nutAvailable) return { success: false, error: 'nut.js not available' };
    try {
      await nutjs.keyboard.type(text);
      this.stats.types++;
      return { success: true, length: text.length };
    } catch (err) { return { success: false, error: err.message }; }
  }

  /**
   * Scroll
   */
  async scroll(x, y, { direction = 'down', amount = 3 } = {}) {
    if (!this.nutAvailable) return { success: false, error: 'nut.js not available' };
    try {
      await nutjs.mouse.setPosition(new nutjs.Point(x, y));
      await nutjs.scrollDown(amount);
      this.stats.scrolls++;
      return { success: true, direction, amount };
    } catch (err) { return { success: false, error: err.message }; }
  }

  /**
   * Take screenshot
   */
  async screenshot({ region } = {}) {
    try {
      // Use Playwright as fallback for screenshots
      const pw = require('playwright');
      const browser = await pw.chromium.launch({ headless: true });
      const page = await browser.newPage();
      const buffer = await page.screenshot({ fullPage: false });
      await browser.close();
      this.stats.screenshots++;
      return { success: true, buffer: buffer.toString('base64'), format: 'png' };
    } catch (err) { return { success: false, error: err.message }; }
  }

  /**
   * Get screen size
   */
  async getScreenSize() {
    if (!this.nutAvailable) return { width: 1920, height: 1080, available: false };
    try {
      const screen = nutjs.screen;
      return { width: screen.width, height: screen.height, available: true };
    } catch { return { width: 1920, height: 1080, available: false }; }
  }

  /**
   * Move mouse to position
   */
  async moveTo(x, y) {
    if (!this.nutAvailable) return { success: false, error: 'nut.js not available' };
    try {
      await nutjs.mouse.setPosition(new nutjs.Point(x, y));
      return { success: true, x, y };
    } catch (err) { return { success: false, error: err.message }; }
  }

  getStats() {
    return { ...this.stats, nutAvailable: this.nutAvailable, initialized: this.initialized };
  }
}

module.exports = DesktopController;
