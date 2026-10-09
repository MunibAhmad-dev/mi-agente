'use strict';

/**
 * OutputFormatter — Gen B output phase.
 * Formats output based on context, platform, and content type.
 *
 * Platforms: slack, email, markdown, plain, html, json
 * Content types: code, list, table, prose, mixed
 */

// Platform-specific rules
const PLATFORM_RULES = {
  slack: {
    codeBlock: (code, lang) => `\`\`\`${lang || ''}\n${code}\n\`\`\``,
    bold: (text) => `*${text}*`,
    italic: (text) => `_${text}_`,
    listItem: (item) => `• ${item}`,
    maxLength: 4000,
  },
  email: {
    codeBlock: (code) => `\n${code.split('\n').map((l) => `    ${l}`).join('\n')}\n`,
    bold: (text) => text.toUpperCase(),
    italic: (text) => text,
    listItem: (item) => `- ${item}`,
    maxLength: 10000,
  },
  markdown: {
    codeBlock: (code, lang) => `\`\`\`${lang || ''}\n${code}\n\`\`\``,
    bold: (text) => `**${text}**`,
    italic: (text) => `*${text}*`,
    listItem: (item) => `- ${item}`,
    maxLength: 50000,
  },
  plain: {
    codeBlock: (code) => code,
    bold: (text) => text,
    italic: (text) => text,
    listItem: (item) => `* ${item}`,
    maxLength: 50000,
  },
  html: {
    codeBlock: (code) => `<pre><code>${escapeHtml(code)}</code></pre>`,
    bold: (text) => `<strong>${text}</strong>`,
    italic: (text) => `<em>${text}</em>`,
    listItem: (item) => `<li>${item}</li>`,
    maxLength: 100000,
  },
  json: {
    codeBlock: (code) => code,
    bold: (text) => text,
    italic: (text) => text,
    listItem: (item) => item,
    maxLength: 100000,
  },
};

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, '  ')
    .replace(/[ ]{3,}/g, '  ')   // collapse triple+ spaces
    .replace(/\n{3,}/g, '\n\n')  // collapse triple+ newlines
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')     // strip HTML tags (for non-html platforms)
    .trim();
}

function detectContentType(text) {
  if (!text) return { contentType: 'prose', hasCode: false, hasList: false, estimatedFormat: 'plain' };
  const hasCode = /```[\s\S]*?```|`[^`]+`|^\s{4,}\S/m.test(text);
  const hasList = /^\s*[-*•]\s+\S/m.test(text) || /^\s*\d+\.\s+\S/m.test(text);
  const hasTable = /\|.+\|/.test(text) && /\|-+\|/.test(text);

  let contentType = 'prose';
  if (hasCode && hasList) contentType = 'mixed';
  else if (hasCode) contentType = 'code';
  else if (hasTable) contentType = 'table';
  else if (hasList) contentType = 'list';

  const estimatedFormat = hasCode ? 'markdown' : hasList ? 'markdown' : 'plain';

  return { contentType, hasCode, hasList, estimatedFormat };
}

function applyPlatformFormatting(text, platform, contentType) {
  const rules = PLATFORM_RULES[platform] || PLATFORM_RULES.plain;
  const changes = [];

  // For html platform: wrap code blocks and lists properly
  if (platform === 'html') {
    let result = escapeHtml(text);
    // convert markdown code blocks to HTML
    result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      changes.push('converted code block to HTML pre/code');
      return `<pre><code class="language-${lang || 'text'}">${code}</code></pre>`;
    });
    result = result.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
    result = result.replace(/\*\*([^*]+)\*\*/g, (_, t) => `<strong>${t}</strong>`);
    result = result.replace(/\*([^*]+)\*/g, (_, t) => `<em>${t}</em>`);
    return { text: result, changes };
  }

  // For plain/email: strip markdown syntax
  if (platform === 'plain' || platform === 'email') {
    let result = text
      .replace(/```[\w]*\n?/g, '')
      .replace(/```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/^#+\s+/gm, '');
    if (text !== result) changes.push('stripped markdown syntax for plain/email output');
    return { text: result, changes };
  }

  // For slack: ensure code blocks use slack syntax (no language hint needed)
  if (platform === 'slack') {
    let result = text.replace(/```(\w+)\n/g, '```\n');
    if (result !== text) changes.push('removed language hints from code blocks for Slack');
    return { text: result, changes };
  }

  return { text, changes };
}

class OutputFormatter {
  constructor() {
    this.stats = { formats: 0, detections: 0, cleans: 0 };
  }

  /**
   * Format text for a specific platform / content type.
   * @param {string} text
   * @param {{ platform?: string, contentType?: string, maxLength?: number }} opts
   * @returns {{ formatted: string, format: string, changes: string[] }}
   */
  format(text, opts = {}) {
    try {
      this.stats.formats++;
      if (!text || typeof text !== 'string') {
        return { formatted: '', format: opts.platform || 'plain', changes: [] };
      }

      const platform = (opts.platform || 'markdown').toLowerCase();
      const contentType = opts.contentType || detectContentType(text).contentType;
      const maxLength = opts.maxLength || PLATFORM_RULES[platform]?.maxLength || 50000;

      const { text: formatted, changes } = applyPlatformFormatting(text, platform, contentType);

      // Apply max length
      let result = formatted;
      if (result.length > maxLength) {
        result = result.substring(0, maxLength - 3) + '...';
        changes.push(`truncated to ${maxLength} characters`);
      }

      return { formatted: result, format: platform, changes };
    } catch (err) {
      return { formatted: text || '', format: 'plain', changes: [], error: err.message };
    }
  }

  /**
   * Detect content type from text.
   * @param {string} text
   * @returns {{ contentType: string, hasCode: boolean, hasList: boolean, estimatedFormat: string }}
   */
  detect(text) {
    try {
      this.stats.detections++;
      return detectContentType(text);
    } catch (err) {
      return { contentType: 'prose', hasCode: false, hasList: false, estimatedFormat: 'plain', error: err.message };
    }
  }

  /**
   * Clean text: normalize whitespace, quotes, strip unsafe HTML.
   * @param {string} text
   * @returns {string}
   */
  clean(text) {
    try {
      this.stats.cleans++;
      return cleanText(text);
    } catch (err) {
      return text || '';
    }
  }

  getStats() {
    return { ...this.stats };
  }
}

let _instance = null;
function getOutputFormatter() {
  if (!_instance) _instance = new OutputFormatter();
  return _instance;
}

module.exports = { OutputFormatter, getOutputFormatter };
