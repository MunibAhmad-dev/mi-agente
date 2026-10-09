'use strict';

/**
 * Face 26 — DocumentExtractor: HTML/PDF-lite/JSON/CSV/TXT/Markdown to
 * normalized text. HTML extraction strips script/style/nav junk and keeps
 * main content heuristically; titles and links are preserved for provenance.
 */

const { truncate } = require('../core/text');

function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(nav|footer|header|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<a [^>]*href=("[^"]+"|'[^']+')><?=/gi, (m, href) => ` ${href.replace(/["']/g, '')} `)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHtml(raw, url) {
  const html = raw.toString('utf8');
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const text = stripTags(html);
  return {
    title: titleMatch ? stripTags(titleMatch[1]).slice(0, 300) : null,
    description: metaDesc ? metaDesc[1] : null,
    text,
    extraction_method: 'html_heuristic',
    links: (html.match(/href="(https?:\/\/[^"]+)"/g) || []).slice(0, 200).map((h) => h.slice(6, -1)),
  };
}

/** Minimal PDF text extraction: uncompressed text objects + metadata hints. */
function extractPdf(raw) {
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  const latin = buf.toString('latin1');
  const out = [];
  const re = /\((?:\\.|[^()\\])*\)/g;
  let m;
  while ((m = re.exec(latin)) && out.length < 20000) {
    const s = m[0].slice(1, -1).replace(/\\([()\\])/g, '$1');
    if (/[A-Za-z0-9]\s+[A-Za-z0-9]/.test(s) && s.length > 3) out.push(s);
  }
  return {
    title: (latin.match(/\/Title\s*\(([^)]{1,300})\)/) || [])[1] || null,
    text: out.join(' ').replace(/\s+/g, ' ').trim(),
    extraction_method: 'pdf_lite',
  };
}

function extractJson(raw) {
  try {
    const obj = JSON.parse(raw.toString('utf8'));
    const texts = [];
    (function walk(v) {
      if (typeof v === 'string') texts.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    })(obj);
    return { title: null, text: texts.join(' ').slice(0, 500000), extraction_method: 'json' };
  } catch {
    return { title: null, text: '', extraction_method: 'json_failed' };
  }
}

function extractCsv(raw) {
  const lines = raw.toString('utf8').split(/\r?\n/).filter(Boolean).slice(0, 20000);
  const text = lines.map((l) => l.split(',').join(' ')).join('. ');
  return { title: null, text, extraction_method: 'csv' };
}

function extractText(raw) {
  return { title: null, text: raw.toString('utf8'), extraction_method: 'plain' };
}

/**
 * @returns { title, text, extraction_method, links? }
 */
function extract(raw, mimeHint, url) {
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw));
  const mime = (mimeHint || '').toLowerCase();
  const head = buf.subarray(0, 5).toString('latin1');
  if (head === '%PDF-') return extractPdf(buf);
  if (mime.includes('json') || /^\s*[[{]/.test(buf.toString('utf8').slice(0, 50))) return extractJson(buf);
  if (mime.includes('csv') || /\.(csv)(\?|$)/i.test(url || '')) return extractCsv(buf);
  if (mime.includes('html') || /<html[\s>]/i.test(buf.toString('utf8', 0, 2000))) return extractHtml(buf, url);
  return extractText(buf);
}

module.exports = { extract, extractHtml, extractPdf, stripTags, truncate };
