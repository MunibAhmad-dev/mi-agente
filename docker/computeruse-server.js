'use strict';

/**
 * computeruse-server.js
 *
 * Lightweight HTTP server that runs inside the computeruse Docker container.
 * Exposes a minimal API so the main LibreChat backend can delegate
 * Playwright/browser tasks to this sidecar without installing browsers on the host.
 *
 * Routes:
 *   GET  /health           — liveness check (used by Docker healthcheck)
 *   POST /browse           — navigate to URL and return page HTML + text
 *   POST /screenshot       — screenshot a URL, returns base64 PNG
 *   POST /clone            — full-page clone (HTML + inline CSS + assets list)
 */

const http = require('http');
const { chromium } = require('playwright');

const PORT = process.env.PORT || 3099;

let _browser = null;

async function getBrowser() {
  if (!_browser || !_browser.isConnected()) {
    _browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  }
  return _browser;
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}'));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ── Health ────────────────────────────────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { ok: true, uptime: process.uptime() });
  }

  if (req.method !== 'POST') {
    return send(res, 404, { error: 'Not found' });
  }

  const body = await readBody(req);

  // ── Browse ────────────────────────────────────────────────────────────────
  if (url.pathname === '/browse') {
    const { targetUrl, waitUntil = 'domcontentloaded', timeout = 15000 } = body;
    if (!targetUrl) return send(res, 400, { error: 'targetUrl required' });

    let page;
    try {
      const browser = await getBrowser();
      const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (compatible; mi-agente/1.0)' });
      page = await ctx.newPage();
      await page.goto(targetUrl, { waitUntil, timeout });
      const html = await page.content();
      const text = await page.evaluate(() => document.body?.innerText || '');
      const title = await page.title();
      await ctx.close();
      return send(res, 200, { ok: true, url: targetUrl, title, html, text: text.slice(0, 20000) });
    } catch (e) {
      if (page) await page.context().close().catch(() => {});
      return send(res, 500, { error: e.message });
    }
  }

  // ── Screenshot ────────────────────────────────────────────────────────────
  if (url.pathname === '/screenshot') {
    const { targetUrl, fullPage = true, timeout = 15000 } = body;
    if (!targetUrl) return send(res, 400, { error: 'targetUrl required' });

    let page;
    try {
      const browser = await getBrowser();
      const ctx = await browser.newContext();
      page = await ctx.newPage();
      await page.goto(targetUrl, { waitUntil: 'networkidle', timeout });
      const png = await page.screenshot({ fullPage });
      await ctx.close();
      return send(res, 200, { ok: true, url: targetUrl, image: png.toString('base64') });
    } catch (e) {
      if (page) await page.context().close().catch(() => {});
      return send(res, 500, { error: e.message });
    }
  }

  // ── Clone ─────────────────────────────────────────────────────────────────
  if (url.pathname === '/clone') {
    const { targetUrl, timeout = 20000 } = body;
    if (!targetUrl) return send(res, 400, { error: 'targetUrl required' });

    let page;
    try {
      const browser = await getBrowser();
      const ctx = await browser.newContext();
      page = await ctx.newPage();
      await page.goto(targetUrl, { waitUntil: 'networkidle', timeout });

      const { html, css, assetUrls, title } = await page.evaluate(() => {
        // Inline all <link rel="stylesheet"> into a single CSS blob
        const sheets = Array.from(document.styleSheets).map((s) => {
          try { return Array.from(s.cssRules).map((r) => r.cssText).join('\n'); }
          catch { return ''; }
        }).join('\n');

        const images = Array.from(document.querySelectorAll('img[src]')).map((el) => el.src);
        const scripts = Array.from(document.querySelectorAll('script[src]')).map((el) => el.src);

        return {
          html: document.documentElement.outerHTML,
          css: sheets,
          assetUrls: [...new Set([...images, ...scripts])].slice(0, 50),
          title: document.title,
        };
      });

      await ctx.close();
      return send(res, 200, { ok: true, url: targetUrl, title, html, css, assetUrls });
    } catch (e) {
      if (page) await page.context().close().catch(() => {});
      return send(res, 500, { error: e.message });
    }
  }

  return send(res, 404, { error: 'Unknown route' });
});

// Pre-warm the browser so the first request is not slow
getBrowser().then(() => {
  console.log('[computeruse] Chromium warmed up');
}).catch((e) => {
  console.error('[computeruse] Browser warm-up failed:', e.message);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[computeruse] Listening on :${PORT}`);
});

process.on('SIGTERM', async () => {
  if (_browser) await _browser.close().catch(() => {});
  server.close(() => process.exit(0));
});
