'use strict';

const { Tool } = require('@librechat/agents/langchain/tools');

const browserToolJsonSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['navigate', 'search', 'extract', 'screenshot'],
      description:
        'navigate: open a URL; search: search the web with Bing; extract: get text from current page; screenshot: take screenshot.',
    },
    url: {
      type: 'string',
      description: 'URL to navigate to (required for action=navigate).',
    },
    query: {
      type: 'string',
      description: 'Search query (required for action=search).',
    },
  },
  required: ['action'],
};

/**
 * BrowserTool — agent tool that wraps Playwright BrowserManager.
 *
 * Opens a real browser window (headed when BROWSER_HEADLESS=false) so the
 * agent can navigate URLs, search the web, and extract page content.
 * One BrowserManager instance is kept alive for the lifetime of the tool.
 */
class BrowserTool extends Tool {
  static lc_name() {
    return 'browser_use';
  }

  static get jsonSchema() {
    return browserToolJsonSchema;
  }

  constructor(fields = {}) {
    super(fields);
    this.name = 'browser_use';
    this.description =
      'Open a real web browser, navigate to URLs, search the internet with Bing, ' +
      'and extract text content from web pages. Use this to browse the web, research topics, ' +
      'download information, and interact with online resources.';
    this.schema = browserToolJsonSchema;
    this._manager = null;
    this._ready = false;
  }

  async _ensureBrowser() {
    if (this._ready) return;
    const BrowserManager = require('~/server/services/Harness/tools/BrowserManager');
    this._manager = new BrowserManager();
    const headless = process.env.BROWSER_HEADLESS !== 'false';
    const result = await this._manager.launch({ headless });
    if (!result.success) throw new Error(`Browser launch failed: ${result.error}`);
    this._ready = true;
  }

  async _call(input) {
    try {
      const { action, url, query } = input;
      await this._ensureBrowser();

      if (action === 'navigate') {
        if (!url) return JSON.stringify({ error: 'url is required for action=navigate' });
        const nav = await this._manager.navigate(url);
        if (!nav.success) return JSON.stringify({ error: nav.error });
        const content = await this._manager.getContent();
        const text = content.success
          ? _stripHtml(content.content).slice(0, 4000)
          : '';
        return JSON.stringify({ url: nav.url, title: nav.title, text });
      }

      if (action === 'search') {
        if (!query) return JSON.stringify({ error: 'query is required for action=search' });
        // Try multiple engines in order — fall through if one blocks or returns empty results
        const engines = [
          `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
          `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`,
          `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
        ];
        for (const searchUrl of engines) {
          const nav = await this._manager.navigate(searchUrl);
          if (!nav.success) continue;
          const content = await this._manager.getContent();
          if (!content.success) continue;
          const text = _stripHtml(content.content).slice(0, 4000);
          // Detect bot-detection / empty result pages and try next engine
          const blocked = /captcha|robot|are you human|bot detection|verify you|confirm.*search.*human/i.test(text);
          const tooShort = text.trim().length < 200;
          if (blocked || tooShort) continue;
          return JSON.stringify({ query, url: nav.url, results: text });
        }
        return JSON.stringify({ query, error: 'All search engines returned no results or blocked the request. Try navigating directly to a URL.' });
      }

      if (action === 'extract') {
        const content = await this._manager.getContent();
        if (!content.success) return JSON.stringify({ error: content.error });
        return JSON.stringify({
          url: content.url,
          title: content.title,
          text: _stripHtml(content.content).slice(0, 4000),
        });
      }

      if (action === 'screenshot') {
        const shot = await this._manager.screenshot();
        return JSON.stringify({ success: shot.success, path: shot.path });
      }

      return JSON.stringify({ error: `Unknown action: ${action}` });
    } catch (err) {
      return JSON.stringify({ error: err.message });
    }
  }
}

function _stripHtml(html) {
  return (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = BrowserTool;
