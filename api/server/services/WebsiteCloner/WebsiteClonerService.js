'use strict';

/**
 * WebsiteClonerService — Face 18: Website Cloning & Reverse Engineering.
 *
 * Given a URL:
 * 1. Navigates with Playwright (via BrowserRuntime)
 * 2. Extracts full HTML, inline CSS, linked stylesheets, scripts
 * 3. Extracts DOM structure as a component tree
 * 4. Returns an editable codebase scaffold (HTML + CSS + assets list)
 *
 * Requires Playwright to be installed: `npx playwright install chromium`
 */

const logger = {
  info: (...a) => console.log('[WebsiteCloner]', ...a),
  warn: (...a) => console.warn('[WebsiteCloner]', ...a),
  error: (...a) => console.error('[WebsiteCloner]', ...a),
};

/**
 * Extract structural metadata from HTML string.
 * Returns: colors, fonts, headings, nav links, image count, form count.
 */
function analyzeStructure(html) {
  const structure = {
    headings: [],
    navLinks: [],
    colors: new Set(),
    fonts: new Set(),
    imageCount: 0,
    formCount: 0,
    hasHeader: false,
    hasFooter: false,
    hasNav: false,
    sections: 0,
  };

  // Basic regex analysis (no DOM library dependency)
  structure.headings = [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({
    level: Number(m[1]),
    text: m[2].replace(/<[^>]+>/g, '').trim().slice(0, 80),
  }));

  structure.navLinks = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, '').trim().slice(0, 60) }))
    .filter((l) => l.text && !l.href.startsWith('javascript'));

  structure.imageCount = (html.match(/<img\b/gi) || []).length;
  structure.formCount = (html.match(/<form\b/gi) || []).length;
  structure.hasHeader = /<header\b/i.test(html);
  structure.hasFooter = /<footer\b/i.test(html);
  structure.hasNav = /<nav\b/i.test(html);
  structure.sections = (html.match(/<section\b/gi) || []).length;

  // Extract inline colors
  const colorMatches = html.matchAll(/#([0-9a-f]{3,6})\b|rgb\([^)]+\)/gi);
  for (const m of colorMatches) {
    if (structure.colors.size < 20) structure.colors.add(m[0].toLowerCase());
  }

  // Extract font families
  const fontMatches = html.matchAll(/font-family:\s*([^;}"]+)/gi);
  for (const m of fontMatches) {
    const face = m[1].split(',')[0].replace(/['"]/g, '').trim();
    if (face && face.length < 50) structure.fonts.add(face);
  }

  return {
    ...structure,
    colors: [...structure.colors],
    fonts: [...structure.fonts],
  };
}

/**
 * Generate a minimal editable codebase scaffold from extracted data.
 * Returns: { indexHtml, stylesCss, readmeMd, assetUrls }
 */
function generateScaffold({ url, title, html, css, assetUrls, structure }) {
  const hostname = (() => { try { return new URL(url).hostname; } catch { return 'website'; } })();

  const readmeMd = [
    `# ${title || hostname} — Cloned Scaffold`,
    ``,
    `**Source URL:** ${url}`,
    `**Cloned at:** ${new Date().toISOString()}`,
    ``,
    `## Structure`,
    `- Has header: ${structure.hasHeader}`,
    `- Has nav: ${structure.hasNav}`,
    `- Has footer: ${structure.hasFooter}`,
    `- Sections: ${structure.sections}`,
    `- Forms: ${structure.formCount}`,
    `- Images: ${structure.imageCount}`,
    ``,
    `## Colors detected`,
    structure.colors.map((c) => `- \`${c}\``).join('\n') || '- (none)',
    ``,
    `## Fonts detected`,
    structure.fonts.map((f) => `- ${f}`).join('\n') || '- (none)',
    ``,
    `## Assets to download`,
    assetUrls.slice(0, 30).map((u) => `- ${u}`).join('\n') || '- (none)',
    ``,
    `## Files`,
    `- \`index.html\` — full page HTML`,
    `- \`styles.css\` — extracted CSS`,
  ].join('\n');

  return {
    indexHtml: html,
    stylesCss: css || `/* Extracted from ${url} */\n`,
    readmeMd,
    assetUrls,
  };
}

/**
 * Clone a website by URL.
 * @param {string} url
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=30000]
 * @param {boolean} [opts.waitForNetworkIdle=true]
 * @returns {Promise<{url, title, html, css, assetUrls, structure, scaffold}>}
 */
async function cloneWebsite(url, opts = {}) {
  const timeoutMs = opts.timeoutMs || 30000;
  logger.info(`Cloning: ${url}`);

  // Try Playwright first
  let playwright;
  try {
    playwright = require('playwright');
  } catch {
    throw new Error(
      'Playwright is not installed. Run: npx playwright install chromium\n' +
      'Then restart the server.',
    );
  }

  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (compatible; mi-agente-cloner/1.0)',
  });

  try {
    await page.goto(url, {
      waitUntil: opts.waitForNetworkIdle !== false ? 'networkidle' : 'domcontentloaded',
      timeout: timeoutMs,
    });

    const title = await page.title().catch(() => '');

    // Extract full rendered HTML
    const html = await page.content();

    // Extract all <style> blocks
    const cssBlocks = await page.$$eval('style', (els) => els.map((e) => e.textContent || ''));
    const css = cssBlocks.join('\n\n');

    // Extract external stylesheet URLs
    const stylesheetUrls = await page.$$eval('link[rel="stylesheet"]', (els) =>
      els.map((e) => e.href).filter(Boolean),
    );

    // Extract external script URLs
    const scriptUrls = await page.$$eval('script[src]', (els) =>
      els.map((e) => e.src).filter(Boolean),
    );

    // Extract image URLs
    const imageUrls = await page.$$eval('img[src]', (els) =>
      els.map((e) => e.src).filter(Boolean),
    );

    const assetUrls = [...new Set([...stylesheetUrls, ...scriptUrls, ...imageUrls])];

    const structure = analyzeStructure(html);
    const scaffold = generateScaffold({ url, title, html, css, assetUrls, structure });

    return { url, title, html, css, assetUrls, structure, scaffold };
  } finally {
    await browser.close();
  }
}

module.exports = { cloneWebsite, analyzeStructure, generateScaffold };
