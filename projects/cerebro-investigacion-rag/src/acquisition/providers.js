'use strict';

/**
 * Face 26 — Source Providers. Independent adapters sharing one interface:
 *   search(query, opts) -> [{ url, title, snippet, meta }]
 * Providers never fabricate results: unreachable sources become
 * ACCESS_LIMITED and the research continues (plan §14). Public, permitted
 * endpoints only — no auth/CAPTCHA/paywall bypass.
 */

const HttpTransport = require('./HttpTransport');
const DocumentExtractor = require('./DocumentExtractor');
const { config } = require('../core/config');
const { truncate } = require('../core/text');

const LIMIT = { access_status: 'ACCESS_LIMITED' };

async function _get(url) {
  const res = await HttpTransport.fetchRaw(url);
  return res;
}

/* ---------------- Web / general ---------------- */

async function webSearch(query, opts = {}) {
  // DuckDuckGo HTML endpoint (public, no key). Parsing may break; that is
  // fine: on failure we return ACCESS_LIMITED, not invented results.
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await _get(url);
    const html = res.body.toString('utf8');
    const results = [];
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) && results.length < (opts.limit || 10)) {
      let href = m[1];
      const ud = href.match(/uddg=([^&]+)/);
      if (ud) href = decodeURIComponent(ud[1]);
      results.push({
        url: href,
        title: DocumentExtractor.stripTags(m[2]),
        snippet: '',
        provider: 'ddg',
      });
    }
    if (!results.length) return { results: [], ...LIMIT };
    return { results };
  } catch (err) {
    return { results: [], access_status: 'ACCESS_LIMITED', error: err.message };
  }
}

/* ---------------- Academic ---------------- */

async function academicSearch(query, opts = {}) {
  try {
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=${opts.limit || 8}`;
    const res = await _get(url);
    const xml = res.body.toString('utf8');
    const entries = xml.split('<entry>').slice(1);
    const results = entries.map((e) => ({
      url: (e.match(/<id>([^<]+)<\/id>/) || [])[1],
      title: DocumentExtractor.stripTags((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ''),
      snippet: truncate(DocumentExtractor.stripTags((e.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1] || ''), 400),
      provider: 'arxiv',
      meta: { published: (e.match(/<published>([^<]+)/) || [])[1] },
    })).filter((r) => r.url);
    return { results };
  } catch (err) {
    return { results: [], access_status: 'ACCESS_LIMITED', error: err.message };
  }
}

/* ---------------- GitHub ---------------- */

async function githubSearch(query, opts = {}) {
  try {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${opts.limit || 5}`;
    const res = await _get(url);
    const data = JSON.parse(res.body.toString('utf8'));
    const results = (data.items || []).map((r) => ({
      url: r.html_url,
      title: r.full_name,
      snippet: truncate(r.description || '', 300),
      provider: 'github',
      meta: { stars: r.stargazers_count, language: r.language, updated: r.updated_at },
    }));
    return { results };
  } catch (err) {
    return { results: [], access_status: 'ACCESS_LIMITED', error: err.message };
  }
}

/* ---------------- Wikipedia / wikis ---------------- */

async function wikiSearch(query, opts = {}) {
  try {
    const lang = opts.lang || 'en';
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${opts.limit || 5}`;
    const res = await _get(url);
    const data = JSON.parse(res.body.toString('utf8'));
    const results = ((data.query || {}).search || []).map((r) => ({
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
      title: r.title,
      snippet: truncate(r.snippet.replace(/<[^>]+>/g, ''), 300),
      provider: 'wikipedia',
    }));
    return { results };
  } catch (err) {
    return { results: [], access_status: 'ACCESS_LIMITED', error: err.message };
  }
}

/** Fetch a Wikipedia page and extract its citations (for the wiki auditor). */
async function wikiPage(title, opts = {}) {
  try {
    const lang = opts.lang || 'en';
    const url = `https://${lang}.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json`;
    const res = await _get(url);
    const data = JSON.parse(res.body.toString('utf8'));
    const wikitext = (data.parse || {}).wikitext ? data.parse.wikitext['*'] : '';
    const citations = [...wikitext.matchAll(/\[https?:\/\/([^\s\]]+)[^\]]*\]/g)].map((m) => m[1].split('/')[0]).slice(0, 100);
    return { ok: true, title, wikitext, citation_domains: [...new Set(citations)] };
  } catch (err) {
    return { ok: false, access_status: 'ACCESS_LIMITED', error: err.message };
  }
}

/* ---------------- Reddit (public JSON) ---------------- */

async function redditSearch(query, opts = {}) {
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=${opts.limit || 8}`;
    const res = await _get(url);
    const data = JSON.parse(res.body.toString('utf8'));
    const results = (((data || {}).data || {}).children || []).map((c) => ({
      url: 'https://www.reddit.com' + (c.data.permalink || ''),
      title: c.data.title,
      snippet: truncate((c.data.selftext || '').replace(/\s+/g, ' '), 300),
      provider: 'reddit',
      meta: { subreddit: c.data.subreddit, score: c.data.score, created: new Date(c.data.created_utc * 1000).toISOString() },
    }));
    return { results };
  } catch (err) {
    return { results: [], access_status: 'ACCESS_LIMITED', error: err.message };
  }
}

/* ---------------- RSS / news feeds ---------------- */

async function rssSearch(feedUrl, opts = {}) {
  try {
    const res = await _get(feedUrl);
    const xml = res.body.toString('utf8');
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/g)]
      .slice(0, opts.limit || 10)
      .map((it) => {
        const body = it[1] || it[2] || '';
        const title = DocumentExtractor.stripTags((body.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
        const link = (body.match(/<link>([\s\S]*?)<\/link>/) || body.match(/href="([^"]+)"/) || [])[1] || '';
        const desc = DocumentExtractor.stripTags((body.match(/<description>([\s\S]*?)<\/description>/) || body.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1] || '');
        const date = (body.match(/<pubDate>([^<]+)/) || body.match(/<updated>([^<]+)/) || [])[1];
        return { url: link.trim(), title, snippet: truncate(desc, 300), provider: 'rss', meta: { published: date } };
      })
      .filter((r) => r.url);
    return { results };
  } catch (err) {
    return { results: [], access_status: 'ACCESS_LIMITED', error: err.message };
  }
}

/* ---------------- Video (public metadata; transcription via STT sidecar) ---- */

async function videoSearch(query, opts = {}) {
  // Invidious public instances are unstable; treat as best-effort enrichment.
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent('site:youtube.com ' + query)}`;
    const res = await _get(url);
    const html = res.body.toString('utf8');
    const results = [];
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) && results.length < (opts.limit || 6)) {
      let href = m[1];
      const ud = href.match(/uddg=([^&]+)/);
      if (ud) href = decodeURIComponent(ud[1]);
      if (!/youtube\.com|youtu\.be/.test(href)) continue;
      results.push({ url: href, title: DocumentExtractor.stripTags(m[2]), snippet: '', provider: 'video' });
    }
    return { results };
  } catch (err) {
    return { results: [], access_status: 'ACCESS_LIMITED', error: err.message };
  }
}

const REGISTRY = {
  web: webSearch,
  academic: academicSearch,
  github: githubSearch,
  wiki: wikiSearch,
  reddit: redditSearch,
  news: rssSearch,
  video: videoSearch,
};

module.exports = { REGISTRY, webSearch, academicSearch, githubSearch, wikiSearch, redditSearch, rssSearch, videoSearch, wikiPage };
