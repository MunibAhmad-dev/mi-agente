// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL WEB RECONSTRUCTION ENGINE — Browser Agent (Playwright)
// ═══════════════════════════════════════════════════════════════════════════════

import { AgentBase } from '../core/agent-base.js';
import { ensureDir, projectDir, writeJSON, timestamp, genId } from '../core/utils.js';
import { chromium } from 'playwright';
import { join, basename } from 'node:path';

export class BrowserAgent extends AgentBase {
  constructor(config = {}) {
    super({
      ...config,
      type: 'browser',
      name: 'Browser Agent',
      capabilities: [
        'browser-automation', 'url-discovery', 'dom-extraction',
        'css-extraction', 'screenshot-capture', 'asset-extraction',
      ],
      requiredSkills: ['browser-automation'],
    });
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async perform(task, context) {
    const { action } = task;
    this.log.info(`Browser action: ${action}`);

    switch (action) {
      case 'launch': return this.launch(task, context);
      case 'capture': return this.capturePage(task, context);
      case 'explore': return this.exploreApplication(task, context);
      case 'extract-dom': return this.extractDOM(task, context);
      case 'extract-css': return this.extractCSS(task, context);
      case 'extract-assets': return this.extractAssets(task, context);
      case 'interact': return this.interact(task, context);
      case 'responsive': return this.captureResponsive(task, context);
      case 'close': return this.close();
      default: throw new Error(`Unknown browser action: ${action}`);
    }
  }

  // ─── Launch ──────────────────────────────────────────────────────────────

  async launch(task, context) {
    this.log.info('Launching browser...');
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    const viewport = task.viewport || { width: 1440, height: 900 };
    this.context = await this.browser.newContext({
      viewport,
      userAgent: task.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: task.locale || 'en-US',
      deviceScaleFactor: task.deviceScaleFactor || 1,
    });
    this.page = await this.context.newPage();
    this.log.info(`Browser launched: viewport ${viewport.width}x${viewport.height}`);
    return { success: true };
  }

  // ─── Capture Page ────────────────────────────────────────────────────────

  async capturePage(task, context) {
    if (!this.browser) await this.launch(task, context);

    const { url, projectId, viewport } = task;
    this.log.info(`Capturing: ${url}`);

    // Navigate
    const navResult = { loaded: false, title: '', errors: [] };
    this.page.on('pageerror', err => navResult.errors.push(err.message));

    try {
      await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      navResult.loaded = true;
      navResult.title = await this.page.title();
    } catch (e) {
      this.log.warn(`Navigation issue: ${e.message}, continuing...`);
      try { await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch {}
    }

    await this.page.waitForTimeout(2000);

    // Capture viewport screenshot
    const outDir = ensureDir(projectDir(projectId || 'default') + '/screenshots');
    const vpScreenshot = join(outDir, 'viewport.png');
    await this.page.screenshot({ path: vpScreenshot, fullPage: false });
    this.log.info(`Viewport screenshot saved: ${vpScreenshot}`);

    // Capture full-page screenshot
    const fullScreenshot = join(outDir, 'fullpage.png');
    await this.page.screenshot({ path: fullScreenshot, fullPage: true });
    this.log.info(`Full-page screenshot saved: ${fullScreenshot}`);

    // Extract basic page info
    const pageInfo = await this.page.evaluate(() => ({
      title: document.title,
      meta: Object.fromEntries([...document.querySelectorAll('meta')].map(m =>
        [m.getAttribute('name') || m.getAttribute('property') || m.getAttribute('http-equiv'), m.getAttribute('content')]
      ).filter(([k]) => k)),
      frameworks: {
        hasNextData: !!document.getElementById('__NEXT_DATA__'),
        hasReactRoot: !!document.getElementById('root') || !!document.getElementById('__next'),
        hasVueInstance: !!window.__VUE__,
        hasAngular: !!window.ng || !!document.querySelector('[ng-version]'),
      },
      elementCount: document.querySelectorAll('*').length,
      linkCount: document.querySelectorAll('a[href]').length,
      imageCount: document.querySelectorAll('img').length,
      formCount: document.querySelectorAll('form').length,
      scriptCount: document.querySelectorAll('script[src]').length,
      stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map(l => l.href),
    }));

    if (projectId) {
      writeJSON(join(outDir, 'page-info.json'), { ...pageInfo, url, navResult });
    }

    return {
      evidence: [
        { type: 'screenshot', description: 'Viewport screenshot', path: vpScreenshot },
        { type: 'screenshot', description: 'Full-page screenshot', path: fullScreenshot },
        { type: 'log', description: 'Page info extracted', data: { ...pageInfo, navResult } },
      ],
    };
  }

  // ─── Explore Application ─────────────────────────────────────────────────

  async exploreApplication(task, context) {
    if (!this.page) throw new Error('Browser not launched');

    this.log.info('Exploring application...');
    const discovery = {
      pages: [],
      routes: [],
      components: [],
      buttons: [],
      links: [],
      forms: [],
      modals: [],
      navigation: [],
    };

    // Collect all links and routes
    const links = await this.page.evaluate(() =>
      [...document.querySelectorAll('a[href]')].map(a => ({
        text: a.textContent.trim(),
        href: a.href,
        rect: a.getBoundingClientRect(),
      }))
    );
    discovery.links = links;

    // Collect buttons
    const buttons = await this.page.evaluate(() =>
      [...document.querySelectorAll('button, [role="button"], input[type="submit"]')].map(b => ({
        text: b.textContent.trim(),
        type: b.tagName,
        disabled: b.disabled,
        rect: b.getBoundingClientRect(),
      }))
    );
    discovery.buttons = buttons;

    // Collect forms
    const forms = await this.page.evaluate(() =>
      [...document.querySelectorAll('form')].map(f => ({
        action: f.action,
        method: f.method,
        inputs: [...f.querySelectorAll('input, select, textarea')].map(i => ({
          name: i.name, type: i.type, placeholder: i.placeholder,
        })),
      }))
    );
    discovery.forms = forms;

    // Detect navigation structure
    const navItems = await this.page.evaluate(() =>
      [...document.querySelectorAll('nav a, [role="navigation"] a, .sidebar a, .menu a')].map(a => ({
        text: a.textContent.trim(),
        href: a.href,
        active: a.classList.contains('active') || a.getAttribute('aria-current') === 'page',
      }))
    );
    discovery.navigation = navItems;

    this.log.info(`Discovery: ${links.length} links, ${buttons.length} buttons, ${forms.length} forms`);

    return {
      evidence: [{ type: 'log', description: 'Application explored', data: discovery }],
    };
  }

  // ─── Extract DOM ─────────────────────────────────────────────────────────

  async extractDOM(task, context) {
    if (!this.page) throw new Error('Browser not launched');

    this.log.info('Extracting DOM structure...');
    const dom = await this.page.evaluate(() => {
      function serializeNode(node, depth = 0, maxDepth = 10) {
        if (depth > maxDepth) return null;
        if (node.nodeType !== Node.ELEMENT_NODE) return null;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG'].includes(node.tagName)) return null;

        const rect = node.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return null;

        const computed = window.getComputedStyle(node);
        return {
          tag: node.tagName.toLowerCase(),
          id: node.id || undefined,
          classes: [...node.classList].join(' ') || undefined,
          role: node.getAttribute('role') || undefined,
          ariaLabel: node.getAttribute('aria-label') || undefined,
          text: node.childNodes.length === 1 && node.childNodes[0].nodeType === 3
            ? node.childNodes[0].textContent.trim() : undefined,
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          styles: {
            display: computed.display,
            position: computed.position,
            backgroundColor: computed.backgroundColor,
            color: computed.color,
            fontSize: computed.fontSize,
            fontFamily: computed.fontFamily,
            fontWeight: computed.fontWeight,
            padding: computed.padding,
            margin: computed.margin,
            border: computed.border,
            borderRadius: computed.borderRadius,
            boxShadow: computed.boxShadow,
            gap: computed.gap,
          },
          children: [...node.children].map(c => serializeNode(c, depth + 1, maxDepth)).filter(Boolean),
        };
      }
      return serializeNode(document.body);
    });

    const projectId = context?.projectId;
    if (projectId) {
      writeJSON(projectDir(projectId) + '/analysis/dom.json', dom);
    }

    return {
      evidence: [{ type: 'file', description: 'DOM structure extracted', data: dom }],
    };
  }

  // ─── Extract CSS ─────────────────────────────────────────────────────────

  async extractCSS(task, context) {
    if (!this.page) throw new Error('Browser not launched');

    this.log.info('Extracting computed CSS...');
    const css = await this.page.evaluate(() => {
      const computedStyles = [];
      const allElements = document.querySelectorAll('*');
      const seen = new Set();

      for (const el of allElements) {
        const computed = window.getComputedStyle(el);
        const key = el.tagName + '.' + [...el.classList].join('.');
        if (seen.has(key)) continue;
        seen.add(key);

        computedStyles.push({
          selector: key,
          tag: el.tagName,
          classes: [...el.classList],
          styles: {
            display: computed.display,
            position: computed.position,
            top: computed.top, left: computed.left, right: computed.right, bottom: computed.bottom,
            width: computed.width, height: computed.height,
            maxWidth: computed.maxWidth, maxHeight: computed.maxHeight,
            minWidth: computed.minWidth, minHeight: computed.minHeight,
            padding: computed.padding,
            margin: computed.margin,
            gap: computed.gap,
            backgroundColor: computed.backgroundColor,
            backgroundImage: computed.backgroundImage,
            color: computed.color,
            fontSize: computed.fontSize,
            fontFamily: computed.fontFamily,
            fontWeight: computed.fontWeight,
            lineHeight: computed.lineHeight,
            letterSpacing: computed.letterSpacing,
            textAlign: computed.textAlign,
            textTransform: computed.textTransform,
            border: computed.border,
            borderRadius: computed.borderRadius,
            boxShadow: computed.boxShadow,
            textShadow: computed.textShadow,
            opacity: computed.opacity,
            overflow: computed.overflow,
            zIndex: computed.zIndex,
            transition: computed.transition,
            animation: computed.animation,
            transform: computed.transform,
          },
        });
      }
      return computedStyles;
    });

    const projectId = context?.projectId;
    if (projectId) {
      writeJSON(projectDir(projectId) + '/analysis/computed-styles.json', css);
    }

    return {
      evidence: [{ type: 'file', description: `Computed CSS extracted for ${css.length} elements`, data: css }],
    };
  }

  // ─── Extract Assets ──────────────────────────────────────────────────────

  async extractAssets(task, context) {
    if (!this.page) throw new Error('Browser not launched');

    this.log.info('Extracting assets...');
    const assets = await this.page.evaluate(() => {
      const items = [];

      // Images
      document.querySelectorAll('img').forEach(img => {
        items.push({ type: 'image', src: img.src, alt: img.alt, width: img.naturalWidth, height: img.naturalHeight });
      });

      // SVGs
      document.querySelectorAll('svg').forEach((svg, i) => {
        items.push({ type: 'svg', html: svg.outerHTML, index: i });
      });

      // Background images
      document.querySelectorAll('*').forEach(el => {
        const bg = window.getComputedStyle(el).backgroundImage;
        if (bg && bg !== 'none') {
          const match = bg.match(/url\(["']?(.+?)["']?\)/);
          if (match) items.push({ type: 'background-image', url: match[1] });
        }
      });

      // Favicon
      const favicon = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
      if (favicon) items.push({ type: 'favicon', href: favicon.href });

      // Fonts
      document.querySelectorAll('link[rel="preload"][as="font"], link[href*="fonts"]').forEach(link => {
        items.push({ type: 'font', href: link.href });
      });

      return items;
    });

    return {
      evidence: [{ type: 'file', description: `Found ${assets.length} assets`, data: assets }],
    };
  }

  // ─── Responsive Capture ──────────────────────────────────────────────────

  async captureResponsive(task, context) {
    if (!this.browser) throw new Error('Browser not launched');
    const { url, projectId } = task;
    const viewports = [
      { width: 1920, height: 1080, name: 'desktop-hd' },
      { width: 1440, height: 900, name: 'desktop' },
      { width: 1024, height: 768, name: 'tablet-landscape' },
      { width: 768, height: 1024, name: 'tablet-portrait' },
      { width: 375, height: 812, name: 'mobile' },
    ];

    const outDir = ensureDir(projectDir(projectId || 'default') + '/screenshots/responsive');
    const results = [];

    for (const vp of viewports) {
      await this.page.setViewportSize({ width: vp.width, height: vp.height });
      await this.page.waitForTimeout(500);
      const path = join(outDir, `${vp.name}.png`);
      await this.page.screenshot({ path, fullPage: false });
      results.push({ viewport: vp, path });
      this.log.info(`Captured ${vp.name}: ${vp.width}x${vp.height}`);
    }

    return {
      evidence: [{ type: 'file', description: 'Responsive screenshots captured', data: results }],
    };
  }

  // ─── Interact ────────────────────────────────────────────────────────────

  async interact(task, context) {
    if (!this.page) throw new Error('Browser not launched');
    const { selector, action: interaction, value } = task;

    switch (interaction) {
      case 'click': await this.page.click(selector); break;
      case 'type': await this.page.fill(selector, value); break;
      case 'hover': await this.page.hover(selector); break;
      case 'scroll': await this.page.evaluate((y) => window.scrollTo(0, y), value || 500); break;
      case 'wait': await this.page.waitForTimeout(value || 1000); break;
      case 'press': await this.page.keyboard.press(value || 'Enter'); break;
    }

    return { evidence: [{ type: 'log', description: `Interacted: ${interaction} on ${selector}` }] };
  }

  // ─── Close ───────────────────────────────────────────────────────────────

  async close() {
    if (this.context) await this.context.close().catch(() => {});
    if (this.browser) await this.browser.close().catch(() => {});
    this.browser = null;
    this.context = null;
    this.page = null;
    this.log.info('Browser closed');
  }
}
