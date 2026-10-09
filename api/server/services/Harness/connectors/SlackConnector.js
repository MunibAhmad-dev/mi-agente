/**
 * SlackConnector — Slack integration via Web API.
 *
 * Actions:
 *   - postMessage  — Send a message to a channel
 *   - search       — Search messages
 *   - channels     — List channels
 *   - history      — Get channel history
 *   - users        — List users
 *
 * Auth: Bot token (xoxb-...) or user token (xoxp-...)
 * API: Slack Web API (https://slack.com/api)
 */

const https = require('https');
const { BaseConnector } = require('./BaseConnector');

class SlackConnector extends BaseConnector {
  constructor(config = {}) {
    super({
      rateLimitPerMinute: 50, // Slack tier 3
      timeout: 30000,
      ...config,
    });
    this._baseUrl = 'https://slack.com/api';
  }

  getId() { return 'slack'; }
  getName() { return 'Slack'; }

  getActions() {
    return [
      { name: 'postMessage', description: 'Send message to channel', params: ['channel', 'text'] },
      { name: 'search', description: 'Search messages', params: ['query', 'count'] },
      { name: 'channels', description: 'List channels', params: ['types'] },
      { name: 'history', description: 'Get channel history', params: ['channel', 'limit'] },
      { name: 'users', description: 'List workspace users', params: [] },
    ];
  }

  async execute(action, params = {}) {
    const token = this.getToken();
    if (!token) throw new Error('[Slack] No auth token. Set via setToken()');

    try {
      let result;
      switch (action) {
        case 'postMessage':
          result = await this._postMessage(params.channel, params.text);
          break;
        case 'search':
          result = await this._search(params.query, params.count || 20);
          break;
        case 'channels':
          result = await this._channels(params.types || 'public_channel,private_channel');
          break;
        case 'history':
          result = await this._history(params.channel, params.limit || 50);
          break;
        case 'users':
          result = await this._users();
          break;
        default:
          throw new Error(`[Slack] Unknown action: ${action}`);
      }
      this._audit(action, params, result);
      return result;
    } catch (error) {
      this._audit(action, params, null, error);
      throw error;
    }
  }

  async _postMessage(channel, text) {
    return this._executeWithRetry(async () => {
      const res = await this._apiPost('chat.postMessage', { channel, text });
      if (!res.ok) throw new Error(res.error || 'Failed to post message');
      return { success: true, ts: res.ts, channel };
    });
  }

  async _search(query, count) {
    return this._executeWithRetry(async () => {
      const res = await this._apiGet(`search.messages?query=${encodeURIComponent(query)}&count=${count}`);
      if (!res.ok) throw new Error(res.error || 'Search failed');
      const messages = (res.messages?.matches || []).map(m => ({
        user: m.user,
        text: m.text?.slice(0, 500),
        channel: m.channel?.name,
        ts: m.ts,
        permalink: m.permalink,
      }));
      return { messages, total: res.messages?.total || 0 };
    });
  }

  async _channels(types) {
    return this._executeWithRetry(async () => {
      const res = await this._apiGet(`conversations.list?types=${types}&limit=200&exclude_archived=true`);
      if (!res.ok) throw new Error(res.error || 'Failed to list channels');
      return { channels: (res.channels || []).map(c => ({ id: c.id, name: c.name, members: c.num_members })) };
    });
  }

  async _history(channel, limit) {
    return this._executeWithRetry(async () => {
      const res = await this._apiGet(`conversations.history?channel=${channel}&limit=${limit}`);
      if (!res.ok) throw new Error(res.error || 'Failed to get history');
      const messages = (res.messages || []).map(m => ({
        user: m.user,
        text: m.text?.slice(0, 1000),
        ts: m.ts,
        type: m.type,
      }));
      return { messages };
    });
  }

  async _users() {
    return this._executeWithRetry(async () => {
      const res = await this._apiGet('users.list?limit=200');
      if (!res.ok) throw new Error(res.error || 'Failed to list users');
      return { users: (res.members || []).map(u => ({ id: u.id, name: u.name, real_name: u.real_name })) };
    });
  }

  async healthCheck() {
    try {
      const res = await this._apiGet('auth.test');
      return { healthy: res.ok, connector: 'slack', team: res.team, user: res.user };
    } catch (error) {
      return { healthy: false, connector: 'slack', error: error.message };
    }
  }

  // HTTP helpers
  async _apiGet(path) {
    return this._request('GET', `https://slack.com/api/${path}`);
  }

  async _apiPost(endpoint, body) {
    return this._request('POST', `https://slack.com/api/${endpoint}`, body);
  }

  _request(method, url, body = null) {
    const token = this.getToken();
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const options = {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode === 429) {
              reject(new Error('Slack rate limited'));
            } else if (res.statusCode >= 400) {
              reject(new Error(`Slack API ${res.statusCode}`));
            } else {
              resolve(JSON.parse(data));
            }
          } catch { reject(new Error('Invalid Slack response')); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Slack API timeout')); });
      req.setTimeout(this.config.timeout);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
}

module.exports = { SlackConnector };
