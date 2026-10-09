/**
 * CalendarManager.js
 * 
 * Sistema de calendario completo usando CalDAV (protocolo abierto RFC 4791)
 * Reemplaza googleapis Calendar con acceso directo sin API keys, sin límites, sin bloqueos.
 * 
 * Protocolo: CalDAV (RFC 4791)
 * Paquete: dav (MIT)
 * Licencia: MIT
 * RAM: ~5MB
 */

const dav = require('dav');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class CalendarManager extends EventEmitter {
    constructor() {
        super();
        this._initialized = false;
        this._accounts = new Map();
        this._calendars = new Map();
        this._events = new Map();
    }

    async initialize(config = {}) {
        if (this._initialized) return;
        this._config = {
            storageDir: config.storageDir || path.join(process.cwd(), 'data', 'calendar'),
            cacheDir: config.cacheDir || path.join(process.cwd(), 'data', 'calendar-cache'),
            syncInterval: config.syncInterval || 300000,
            ...config
        };

        for (const dir of [this._config.storageDir, this._config.cacheDir]) {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        }

        this._initialized = true;
        this.emit('initialized');
        return { success: true, module: 'CalendarManager' };
    }

    /**
     * Add a CalDAV account
     * Supports: Nextcloud, Baikal, Radicale, Google CalDAV (read-only), Apple iCloud, etc.
     */
    async addAccount(name, config) {
        const account = {
            name,
            server: config.server,     // e.g. 'https://cloud.example.com/dav'
            username: config.username,
            password: config.password,
            authMethod: config.authMethod || 'basic', // basic, oauth2
            calendars: []
        };

        this._accounts.set(name, account);
        this.emit('accountAdded', { name });
        return { success: true, account: name };
    }

    /**
     * Discover and connect to CalDAV server
     */
    async connect(accountName) {
        const account = this._accounts.get(accountName);
        if (!account) throw new Error(`Account not found: ${accountName}`);

        try {
            // Use dav library to discover calendars
            const xhr = new dav.Transport.Basic(
                new dav.Credentials({
                    username: account.username,
                    password: account.password
                })
            );

            const principalUrl = await dav.direshody({
                url: account.server,
                xhr: xhr
            });

            // Find calendar home set
            const caldavUrl = account.server.includes('/dav')
                ? account.server
                : `${account.server}/dav`;

            // List calendars
            const calendarResults = await dav.listCalendars({
                url: caldavUrl,
                xhr: xhr
            });

            account.calendars = calendarResults.map(cal => ({
                name: cal.displayName || cal.url,
                url: cal.url,
                ctag: cal.ctag,
                description: cal.description,
                color: cal.color
            }));

            this.emit('connected', { account: accountName, calendars: account.calendars.length });
            return { success: true, calendars: account.calendars };
        } catch (error) {
            this.emit('connectionError', { account: accountName, error: error.message });
            throw new Error(`CalDAV connection failed: ${error.message}`);
        }
    }

    /**
     * List all calendars
     */
    async listCalendars(accountName) {
        const account = this._accounts.get(accountName);
        if (!account) throw new Error(`Account not found: ${accountName}`);
        return { success: true, calendars: account.calendars || [] };
    }

    /**
     * Fetch events from a calendar
     */
    async fetchEvents(accountName, calendarUrl, options = {}) {
        const account = this._accounts.get(accountName);
        if (!account) throw new Error(`Account not found: ${accountName}`);

        const { start, end, limit = 100 } = options;

        try {
            const xhr = new dav.Transport.Basic(
                new dav.Credentials({
                    username: account.username,
                    password: account.password
                })
            );

            const cal = new dav.Calendar({
                url: calendarUrl,
                xhr: xhr
            });

            const events = await dav.listCalendarObjects(cal, { xhr });

            let parsedEvents = events.map(evt => this._parseVEVENT(evt.data));
            
            // Filter by date range
            if (start || end) {
                parsedEvents = parsedEvents.filter(evt => {
                    if (!evt || !evt.startDate) return false;
                    if (start && evt.startDate < new Date(start)) return false;
                    if (end && evt.endDate > new Date(end)) return false;
                    return true;
                });
            }

            // Limit results
            parsedEvents = parsedEvents.slice(0, limit);

            return { success: true, events: parsedEvents, calendar: calendarUrl };
        } catch (error) {
            throw new Error(`Failed to fetch events: ${error.message}`);
        }
    }

    /**
     * Create a new event
     */
    async createEvent(accountName, calendarUrl, eventData) {
        const account = this._accounts.get(accountName);
        if (!account) throw new Error(`Account not found: ${accountName}`);

        const {
            summary,
            description = '',
            location = '',
            startDate,
            endDate,
            allDay = false,
            recurrence,
            attendees = [],
            reminders = [{ minutes: 15 }]
        } = eventData;

        // Build iCalendar VEVENT
        const vevent = this._buildVEVENT({
            uid: this._generateUID(),
            summary,
            description,
            location,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            allDay,
            recurrence,
            attendees,
            reminders
        });

        try {
            const xhr = new dav.Transport.Basic(
                new dav.Credentials({
                    username: account.username,
                    password: account.password
                })
            );

            // Create calendar object
            const cal = new dav.Calendar({ url: calendarUrl, xhr });
            
            const result = await dav.createCalendarObject(cal, {
                data: vevent,
                filename: `${this._generateUID()}.ics`,
                xhr: xhr
            });

            this.emit('eventCreated', { calendar: calendarUrl, event: summary });
            return { success: true, uid: this._generateUID(), event: summary };
        } catch (error) {
            throw new Error(`Failed to create event: ${error.message}`);
        }
    }

    /**
     * Update an existing event
     */
    async updateEvent(accountName, calendarUrl, eventUrl, eventData) {
        const account = this._accounts.get(accountName);
        if (!account) throw new Error(`Account not found: ${accountName}`);

        const vevent = this._buildVEVENT({
            ...eventData,
            uid: eventData.uid || this._generateUID()
        });

        try {
            const xhr = new dav.Transport.Basic(
                new dav.Credentials({
                    username: account.username,
                    password: account.password
                })
            );

            await dav.updateCalendarObject(
                new dav.CalendarObject({ url: eventUrl, data: vevent, xhr }),
                { xhr }
            );

            this.emit('eventUpdated', { calendar: calendarUrl, uid: eventData.uid });
            return { success: true };
        } catch (error) {
            throw new Error(`Failed to update event: ${error.message}`);
        }
    }

    /**
     * Delete an event
     */
    async deleteEvent(accountName, calendarUrl, eventUrl) {
        const account = this._accounts.get(accountName);
        if (!account) throw new Error(`Account not found: ${accountName}`);

        try {
            const xhr = new dav.Transport.Basic(
                new dav.Credentials({
                    username: account.username,
                    password: account.password
                })
            );

            await dav.deleteCalendarObject(
                new dav.CalendarObject({ url: eventUrl, xhr }),
                { xhr }
            );

            this.emit('eventDeleted', { calendar: calendarUrl });
            return { success: true };
        } catch (error) {
            throw new Error(`Failed to delete event: ${error.message}`);
        }
    }

    /**
     * Get today's schedule
     */
    async getTodaySchedule(accountName) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const account = this._accounts.get(accountName);
        if (!account) throw new Error(`Account not found: ${accountName}`);

        const allEvents = [];
        for (const cal of account.calendars) {
            try {
                const result = await this.fetchEvents(accountName, cal.url, {
                    start: today.toISOString(),
                    end: tomorrow.toISOString()
                });
                allEvents.push(...(result.events || []));
            } catch (e) { /* skip unaccessible calendars */ }
        }

        // Sort by start time
        allEvents.sort((a, b) => (a.startDate || 0) - (b.startDate || 0));

        return { success: true, date: today.toISOString().split('T')[0], events: allEvents };
    }

    /**
     * Get upcoming events (next N days)
     */
    async getUpcomingEvents(accountName, days = 7) {
        const start = new Date();
        const end = new Date();
        end.setDate(end.getDate() + days);

        const account = this._accounts.get(accountName);
        if (!account) throw new Error(`Account not found: ${accountName}`);

        const allEvents = [];
        for (const cal of account.calendars) {
            try {
                const result = await this.fetchEvents(accountName, cal.url, {
                    start: start.toISOString(),
                    end: end.toISOString()
                });
                allEvents.push(...(result.events || []));
            } catch (e) { /* skip */ }
        }

        allEvents.sort((a, b) => (a.startDate || 0) - (b.startDate || 0));

        return { success: true, events: allEvents, period: `${days} days` };
    }

    /**
     * Export calendar to ICS file
     */
    async exportICS(accountName, calendarUrl, outputPath) {
        const account = this._accounts.get(accountName);
        if (!account) throw new Error(`Account not found: ${accountName}`);

        const result = await this.fetchEvents(accountName, calendarUrl, { limit: 10000 });

        let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Freebuff//EmailManager//EN\r\n';
        for (const evt of result.events) {
            ics += this._buildVEVENT(evt);
        }
        ics += 'END:VCALENDAR\r\n';

        const outPath = outputPath || path.join(this._config.storageDir, `calendar_${Date.now()}.ics`);
        fs.writeFileSync(outPath, ics);
        return { success: true, path: outPath, events: result.events.length };
    }

    /**
     * Get free/busy times for a date range
     */
    async getFreeBusy(accountName, date, startHour = 8, endHour = 20) {
        const schedule = await this.fetchEvents(accountName, this._accounts.get(accountName)?.calendars?.[0]?.url, {
            start: new Date(date).toISOString(),
            end: new Date(new Date(date).getTime() + 86400000).toISOString()
        });

        const busy = (schedule.events || []).map(evt => ({
            start: evt.startDate,
            end: evt.endDate,
            summary: evt.summary
        }));

        // Generate free slots
        const freeSlots = [];
        const dayStart = new Date(date);
        dayStart.setHours(startHour, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(endHour, 0, 0, 0);

        let current = new Date(dayStart);
        for (const b of busy) {
            const busyStart = new Date(b.start);
            const busyEnd = new Date(b.end);
            if (current < busyStart) {
                freeSlots.push({ start: new Date(current), end: new Date(busyStart) });
            }
            if (busyEnd > current) current = busyEnd;
        }
        if (current < dayEnd) {
            freeSlots.push({ start: new Date(current), end: new Date(dayEnd) });
        }

        return { success: true, date, busy, freeSlots };
    }

    // ── Internal Helpers ──────────────────────────────────────

    _parseVEVENT(data) {
        if (!data) return null;

        try {
            const result = {
                uid: this._extractICalField(data, 'UID'),
                summary: this._extractICalField(data, 'SUMMARY'),
                description: this._extractICalField(data, 'DESCRIPTION'),
                location: this._extractICalField(data, 'LOCATION'),
                startDate: this._parseICalDate(this._extractICalField(data, 'DTSTART')),
                endDate: this._parseICalDate(this._extractICalField(data, 'DTEND')),
                status: this._extractICalField(data, 'STATUS'),
                organizer: this._extractICalField(data, 'ORGANIZER'),
                created: this._parseICalDate(this._extractICalField(data, 'DTSTAMP')),
                lastModified: this._parseICalDate(this._extractICalField(data, 'LAST-MODIFIED'))
            };
            return result;
        } catch (e) {
            return null;
        }
    }

    _extractICalField(data, fieldName) {
        const regex = new RegExp(`${fieldName}[^:]*:(.+?)(?:\\r?\\n(?! ))`, 'ims');
        const match = data.match(regex);
        return match ? match[1].trim() : null;
    }

    _parseICalDate(dateStr) {
        if (!dateStr) return null;
        // Parse iCalendar date format: 20240115T090000Z or 20240115
        const cleaned = dateStr.replace(/[^0-9T]/g, '');
        if (cleaned.length === 8) {
            return new Date(`${cleaned.slice(0,4)}-${cleaned.slice(4,6)}-${cleaned.slice(6,8)}`);
        }
        if (cleaned.length >= 15) {
            return new Date(
                cleaned.slice(0,4),
                parseInt(cleaned.slice(4,6)) - 1,
                cleaned.slice(6,8),
                cleaned.slice(9,11),
                cleaned.slice(11,13),
                cleaned.slice(13,15)
            );
        }
        return new Date(dateStr);
    }

    _buildVEVENT(opts) {
        const now = this._formatICalDate(new Date());
        const start = this._formatICalDate(new Date(opts.startDate));
        const end = this._formatICalDate(new Date(opts.endDate));

        let vevent = `BEGIN:VEVENT\r\n`;
        vevent += `UID:${opts.uid || this._generateUID()}\r\n`;
        vevent += `DTSTAMP:${now}\r\n`;
        vevent += `DTSTART:${start}\r\n`;
        vevent += `DTEND:${end}\r\n`;
        vevent += `SUMMARY:${opts.summary || ''}\r\n`;
        if (opts.description) vevent += `DESCRIPTION:${opts.description.replace(/\n/g, '\\n')}\r\n`;
        if (opts.location) vevent += `LOCATION:${opts.location}\r\n`;
        if (opts.status) vevent += `STATUS:${opts.status}\r\n`;

        // Reminders
        if (opts.reminders) {
            for (const r of opts.reminders) {
                vevent += `BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Reminder\r\nTRIGGER:-PT${r.minutes}M\r\nEND:VALARM\r\n`;
            }
        }

        vevent += `END:VEVENT\r\n`;
        return vevent;
    }

    _formatICalDate(date) {
        if (!(date instanceof Date) || isNaN(date)) return '';
        const pad = n => String(n).padStart(2, '0');
        return `${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}Z`;
    }

    _generateUID() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}@freebuff`;
    }

    /**
     * Health check
     */
    async healthCheck() {
        const status = {};
        for (const [name, acc] of this._accounts) {
            status[name] = {
                connected: !!acc.calendars?.length,
                calendars: acc.calendars?.length || 0
            };
        }
        return { module: 'CalendarManager', initialized: this._initialized, accounts: status };
    }

    async disconnectAll() {
        this._accounts.clear();
        this._calendars.clear();
        this._events.clear();
        this.emit('disconnected');
    }
}

module.exports = { CalendarManager };
module.exports.default = CalendarManager;
