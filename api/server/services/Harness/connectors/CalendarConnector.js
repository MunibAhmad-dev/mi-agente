/**
 * CalendarConnector — Google Calendar integration via REST API.
 *
 * Actions:
 *   - listCalendars — List accessible calendars
 *   - listEvents    — List upcoming events
 *   - getEvent      — Get event details
 *   - createEvent   — Create a new event
 *   - updateEvent   — Update an existing event
 *   - deleteEvent   — Delete an event
 *
 * Auth: OAuth2 token
 * API: Google Calendar API v3
 */

const https = require('https');
const { BaseConnector } = require('./BaseConnector');

class CalendarConnector extends BaseConnector {
  constructor(config = {}) {
    super({
      rateLimitPerMinute: 100,
      timeout: 30000,
      ...config,
    });
    this._baseUrl = 'https://www.googleapis.com/calendar/v3';
    this._calendarId = config.calendarId || 'primary';
  }

  getId() { return 'calendar'; }
  getName() { return 'Google Calendar'; }

  getActions() {
    return [
      { name: 'listCalendars', description: 'List accessible calendars', params: [] },
      { name: 'listEvents', description: 'List upcoming events', params: ['maxResults', 'timeMin', 'timeMax'] },
      { name: 'getEvent', description: 'Get event details', params: ['eventId'] },
      { name: 'createEvent', description: 'Create a new event', params: ['summary', 'start', 'end', 'description', 'location'] },
      { name: 'updateEvent', description: 'Update an existing event', params: ['eventId', 'summary', 'start', 'end'] },
      { name: 'deleteEvent', description: 'Delete an event', params: ['eventId'] },
    ];
  }

  async execute(action, params = {}) {
    const token = this.getToken();
    if (!token) throw new Error('[Calendar] No auth token. Set via setToken()');

    try {
      let result;
      switch (action) {
        case 'listCalendars':
          result = await this._listCalendars();
          break;
        case 'listEvents':
          result = await this._listEvents(params.maxResults || 20, params.timeMin, params.timeMax);
          break;
        case 'getEvent':
          result = await this._getEvent(params.eventId);
          break;
        case 'createEvent':
          result = await this._createEvent(params);
          break;
        case 'updateEvent':
          result = await this._updateEvent(params.eventId, params);
          break;
        case 'deleteEvent':
          result = await this._deleteEvent(params.eventId);
          break;
        default:
          throw new Error(`[Calendar] Unknown action: ${action}`);
      }
      this._audit(action, params, result);
      return result;
    } catch (error) {
      this._audit(action, params, null, error);
      throw error;
    }
  }

  async _listCalendars() {
    return this._executeWithRetry(async () => {
      const res = await this._apiGet('/users/me/calendarList');
      return { calendars: (res.items || []).map(c => ({
        id: c.id, summary: c.summary, primary: c.primary, timeZone: c.timeZone,
      }))};
    });
  }

  async _listEvents(maxResults, timeMin, timeMax) {
    return this._executeWithRetry(async () => {
      const now = new Date().toISOString();
      const params = new URLSearchParams({
        maxResults: String(maxResults),
        timeMin: timeMin || now,
        timeMax: timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
      });
      const res = await this._apiGet(`/calendars/${encodeURIComponent(this._calendarId)}/events?${params}`);
      return { events: (res.items || []).map(e => ({
        id: e.id, summary: e.summary,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        location: e.location, description: e.description?.slice(0, 500),
        status: e.status, htmlLink: e.htmlLink,
      }))};
    });
  }

  async _getEvent(eventId) {
    return this._executeWithRetry(async () => {
      const res = await this._apiGet(`/calendars/${encodeURIComponent(this._calendarId)}/events/${eventId}`);
      return {
        id: res.id, summary: res.summary,
        start: res.start?.dateTime || res.start?.date,
        end: res.end?.dateTime || res.end?.date,
        location: res.location, description: res.description,
        attendees: res.attendees?.map(a => ({ email: a.email, name: a.displayName, status: a.responseStatus })),
        recurrence: res.recurrence,
      };
    });
  }

  async _createEvent({ summary, start, end, description, location, attendees }) {
    return this._executeWithRetry(async () => {
      const body = {
        summary: summary || 'New Event',
        start: this._parseDateTime(start),
        end: this._parseDateTime(end),
      };
      if (description) body.description = description;
      if (location) body.location = location;
      if (attendees) body.attendees = attendees.map(a => typeof a === 'string' ? { email: a } : a);

      const res = await this._apiPost(`/calendars/${encodeURIComponent(this._calendarId)}/events`, body);
      return { success: true, eventId: res.id, htmlLink: res.htmlLink };
    });
  }

  async _updateEvent(eventId, updates) {
    return this._executeWithRetry(async () => {
      const body = {};
      if (updates.summary) body.summary = updates.summary;
      if (updates.start) body.start = this._parseDateTime(updates.start);
      if (updates.end) body.end = this._parseDateTime(updates.end);
      if (updates.description) body.description = updates.description;
      if (updates.location) body.location = updates.location;

      const res = await this._apiPatch(`/calendars/${encodeURIComponent(this._calendarId)}/events/${eventId}`, body);
      return { success: true, eventId: res.id };
    });
  }

  async _deleteEvent(eventId) {
    return this._executeWithRetry(async () => {
      await this._apiDelete(`/calendars/${encodeURIComponent(this._calendarId)}/events/${eventId}`);
      return { success: true, eventId };
    });
  }

  _parseDateTime(dt) {
    if (!dt) return { dateTime: new Date().toISOString() };
    if (typeof dt === 'string') {
      // If it looks like a date-only (no time component), use date
      if (/^\d{4}-\d{2}-\d{2}$/.test(dt)) {
        return { date: dt };
      }
      return { dateTime: dt };
    }
    return dt;
  }

  async healthCheck() {
    try {
      await this._listCalendars();
      return { healthy: true, connector: 'calendar' };
    } catch (error) {
      return { healthy: false, connector: 'calendar', error: error.message };
    }
  }

  // HTTP helpers
  async _apiGet(path) { return this._request('GET', path); }
  async _apiPost(path, body) { return this._request('POST', path, body); }
  async _apiPatch(path, body) { return this._request('PATCH', path, body); }
  async _apiDelete(path) { return this._request('DELETE', path); }

  _request(method, path, body = null) {
    const token = this.getToken();
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'www.googleapis.com',
        path,
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
            if (res.statusCode === 429) {
              reject(new Error('Calendar API rate limited'));
            } else if (res.statusCode >= 400) {
              reject(new Error(`Calendar API ${res.statusCode}: ${data.slice(0, 200)}`));
            } else if (res.statusCode === 204) {
              resolve({ success: true });
            } else {
              resolve(JSON.parse(data));
            }
          } catch { reject(new Error('Invalid Calendar response')); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Calendar API timeout')); });
      req.setTimeout(this.config.timeout);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
}

module.exports = { CalendarConnector };
