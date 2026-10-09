'use strict';

/**
 * BrowserManager - Full browser automation using Playwright
 * Supports navigation, screenshots, clicks, typing, PDF generation, multi-tab
 */
class BrowserManager {
  constructor() {
    this.browser = null;
    this.context = null;
    this.pages = new Map(); // name -> page
    this.activePage = null;
    this.screenshotDir = './screenshots';
    this.initialized = false;
  }

  /**
   * Initialize browser
   */
  async launch(options = {}) {
    try {
      const { chromium } = require('playwright');
      this.browser = await chromium.launch({
        headless: options.headless !== false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
      this.context = await this.browser.newContext({
        viewport: options.viewport || { width: 1280, height: 720 },
        userAgent: options.userAgent,
        locale: options.locale || 'en-US',
      });
      this.initialized = true;
      return { success: true, message: 'Browser launched' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Navigate to URL
   */
  async navigate(url, options = {}) {
    if (!this.initialized) return { success: false, error: 'Browser not initialized' };
    try {
      const page = await this.context.newPage();
      const response = await page.goto(url, {
        waitUntil: options.waitUntil || 'domcontentloaded',
        timeout: options.timeout || 30000,
      });
      const pageName = options.name || url;
      this.pages.set(pageName, page);
      this.activePage = page;
      return {
        success: true,
        url: page.url(),
        title: await page.title(),
        status: response?.status(),
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Take screenshot
   */
  async screenshot(options = {}) {
    const page = options.page || this.activePage;
    if (!page) return { success: false, error: 'No active page' };
    try {
      const path = options.path || `${this.screenshotDir}/screenshot_${Date.now()}.png`;
      await page.screenshot({ path, fullPage: options.fullPage || false });
      return { success: true, path };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Click element
   */
  async click(selector, options = {}) {
    const page = options.page || this.activePage;
    if (!page) return { success: false, error: 'No active page' };
    try {
      await page.click(selector, { timeout: options.timeout || 5000 });
      return { success: true, selector };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Type text
   */
  async type(selector, text, options = {}) {
    const page = options.page || this.activePage;
    if (!page) return { success: false, error: 'No active page' };
    try {
      await page.fill(selector, text, { timeout: options.timeout || 5000 });
      return { success: true, selector, text };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Evaluate JavaScript in page
   */
  async evaluate(expression, options = {}) {
    const page = options.page || this.activePage;
    if (!page) return { success: false, error: 'No active page' };
    try {
      const result = await page.evaluate(expression);
      return { success: true, result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get page content
   */
  async getContent(options = {}) {
    const page = options.page || this.activePage;
    if (!page) return { success: false, error: 'No active page' };
    try {
      const content = await page.content();
      const title = await page.title();
      const url = page.url();
      return { success: true, content, title, url };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Extract text from page
   */
  async extractText(options = {}) {
    const page = options.page || this.activePage;
    if (!page) return { success: false, error: 'No active page' };
    try {
      const text = await page.evaluate(() => document.body.innerText);
      return { success: true, text };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Generate PDF from page
   */
  async pdf(path, options = {}) {
    const page = options.page || this.activePage;
    if (!page) return { success: false, error: 'No active page' };
    try {
      const pdfPath = path || `./output/page_${Date.now()}.pdf`;
      await page.pdf({ path: pdfPath, format: 'A4' });
      return { success: true, path: pdfPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Wait for selector
   */
  async waitForSelector(selector, options = {}) {
    const page = options.page || this.activePage;
    if (!page) return { success: false, error: 'No active page' };
    try {
      await page.waitForSelector(selector, { timeout: options.timeout || 10000 });
      return { success: true, selector };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Scroll page
   */
  async scroll(direction = 'down', amount = 500, options = {}) {
    const page = options.page || this.activePage;
    if (!page) return { success: false, error: 'No active page' };
    try {
      const delta = direction === 'up' ? -amount : amount;
      await page.evaluate(delta => window.scrollBy(0, delta), delta);
      return { success: true, direction, amount };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get all links on page
   */
  async getLinks(options = {}) {
    const page = options.page || this.activePage;
    if (!page) return { success: false, error: 'No active page' };
    try {
      const links = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href]')).map(a => ({
          text: a.textContent.trim(),
          href: a.href,
        }))
      );
      return { success: true, links };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Close specific page
   */
  async closePage(name) {
    const page = this.pages.get(name);
    if (page) {
      await page.close();
      this.pages.delete(name);
      if (this.activePage === page) {
        this.activePage = this.pages.values().next().value || null;
      }
      return { success: true };
    }
    return { success: false, error: 'Page not found' };
  }

  /**
   * Close browser
   */
  async close() {
    try {
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
      this.pages.clear();
      this.activePage = null;
      this.initialized = false;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      initialized: this.initialized,
      openPages: this.pages.size,
      activePage: this.activePage ? this.activePage.url() : null,
    };
  }
}

module.exports = BrowserManager;
