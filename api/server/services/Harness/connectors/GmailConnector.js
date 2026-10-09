/**
 * GmailConnector — Gmail integration via REST API.
 *
 * Actions:
 *   - search   — Search emails by query
 *   - read     — Read email by ID
 *   - send     — Send an email
 *   - list     — List recent emails
 *   - labels   — List labels/folders
 *
 * Auth: OAuth2 token or API key (set via setToken)
 * API: Gmail REST API v1 (https://gmail.googleapis.com/gmail/v1)
 */

const https = require('https');
const querystring = require('querystring');
const { BaseConnector } = require('./BaseConnector');

class GmailConnector extends BaseConnector {
  constructor(config = {}) {
    super({
      rateLimitPerMinute: 250, // Gmail API limit
      timeout: 30000,
      ...config,
    });
    this._baseUrl = 'https://gmail.googleapis.com/gmail/v1';
    this._userId = config.userId || 'me';
  }

  getId() { return 'gmail'; }
  getName() { return 'Gmail'; }

  getActions() {
    return [
      { name: 'search', description: 'Search emails by query (Gmail search syntax)', params: ['query', 'maxResults'] },
      { name: 'read', description: 'Read email content by message ID', params: ['messageId'] },
      { name: 'send', description: 'Send an email', params: ['to', 'subject', 'body', 'cc', 'bcc'] },
      { name: 'list', description: 'List recent emails', params: ['maxResults', 'labelId'] },
      { name: 'labels', description: 'List all labels/folders', params: [] },
    ];
  }

  async execute(action, params = {}) {
    const token = this.getToken();
    if (!token) {
      throw new Error('[Gmail] No auth token. Set token via setToken()');
    }

    try {
      let result;
      switch (action) {
        case 'search':
          result = await this._search(params.query, params.maxResults || 10);
          break;
        case 'read':
          result = await this._read(params.messageId);
          break;
        case 'send':
          result = await this._send(params);
          break;
        case 'list':
          result = await this._list(params.maxResults || 10, params.labelId);
          break;
        case 'labels':
          result = await this._labels();
          break;
        default:
          throw new Error(`[Gmail] Unknown action: ${action}`);
      }
      this._audit(action, params, result);
      return result;
    } catch (error) {
      this._audit(action, params, null, error);
      throw error;
    }
  }

  async _search(query, maxResults) {
    return this._executeWithRetry(async () => {
      const res = await this._apiGet(`/users/${this._userId}/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`);
      const messages = res.messages || [];
      // Fetch headers for each message
      const results = [];
      for (const msg of messages.slice(0, Math.min(maxResults, 10))) {
        try {
          const detail = await this._apiGet(`/users/${this._userId}/messages/${msg.id}?format=metadata`);
          const headers = {};
          for (const h of detail.payload?.headers || []) {
            if (['From', 'To', 'Subject', 'Date'].includes(h.name)) {
              headers[h.name.toLowerCase()] = h.value;
            }
          }
          results.push({ id: msg.id, ...headers, snippet: detail.snippet });
        } catch { /* skip unreadable messages */ }
      }
      return { emails: results, total: res.resultSizeEstimate || results.length };
    });
  }

  async _read(messageId) {
    return this._executeWithRetry(async () => {
      const msg = await this._apiGet(`/users/${this._userId}/messages/${messageId}?format=full`);
      const headers = {};
      for (const h of msg.payload?.headers || []) {
        headers[h.name.toLowerCase()] = h.value;
      }
      // Extract body
      let body = '';
      const extractBody = (part) => {
        if (part.body?.data) {
          body += Buffer.from(part.body.data, 'base64url').toString('utf-8');
        }
        if (part.parts) {
          for (const p of part.parts) extractBody(p);
        }
      };
      extractBody(msg.payload || {});
      return {
        id: messageId,
        ...headers,
        body: body.slice(0, 10000),
        labels: msg.labelIds,
        snippet: msg.snippet,
      };
    });
  }

  async _send({ to, subject, body, cc,bcc }) {
    return this._executeWithRetry(async () => {
      const email = [
        `To: ${to}`,
        cc ? `Cc: ${cc}` : '',
        bcc ? `Bcc: ${bcc}` : '',
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body,
      ].filter(Boolean).join('\r\n');

      const encodedMessage = Buffer.from(email).toString('base64url');
      const res = await this._apiPost(`/users/${this._userId}/messages/send`, {
        raw: encodedMessage,
      });
      return { success: true, messageId: res.id };
    });
  }

  async _list(maxResults, labelId) {
    return this._executeWithRetry(async () => {
      const params = `maxResults=${maxResults}${labelId ? `&labelIds=${labelId}` : ''}`;
      const res = await this._apiGet(`/users/${this._userId}/messages?${params}`);
      const messages = [];
      for (const msg of (res.messages || []).slice(0, maxResults)) {
        try {
          const detail = await this._apiGet(`/users/${this._userId}/messages/${msg.id}?format=metadata`);
          const headers = {};
          for (const h of detail.payload?.headers || []) {
            if (['From', 'Subject', 'Date'].includes(h.name)) {
              headers[h.name.toLowerCase()] = h.value;
            }
          }
          messages.push({ id: msg.id, ...headers, snippet: detail.snippet });
        } catch { /* skip */ }
      }
      return { emails: messages };
    });
  }

  async _labels() {
    return this._executeWithRetry(async () => {
      const res = await this._apiGet(`/users/${this._userId}/labels`);
      return { labels: (res.labels || []).map(l => ({ id: l.id, name: l.name, type: l.type })) };
    });
  }

  async healthCheck() {
    try {
      await this._labels();
      return { healthy: true, connector: 'gmail' };
    } catch (error) {
      return { healthy: false, connector: 'gmail', error: error.message };
    }
  }

  // HTTP helpers
  async _apiGet(path) {
    return this._request('GET', path);
  }

  async _apiPost(path, body) {
    return this._request('POST', path, body);
  }

  _request(method, path, body = null) {
    const token = this.getToken();
    return new Promise((resolve, reject) => {
      const url = new URL(this._baseUrl + path);
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode >= 400) {
              reject(new Error(`Gmail API ${res.statusCode}: ${data.slice(0, 200)}`));
            } else {
              resolve(JSON.parse(data));
            }
          } catch {
            reject(new Error(`Gmail API invalid response: ${data.slice(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Gmail API timeout')); });
      req.setTimeout(this.config.timeout);

      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
}

module.exports = { GmailConnector };
