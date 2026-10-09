/**
 * EmailManager.js
 * 
 * Sistema de email completo usando protocolos abiertos (IMAP/SMTP)
 * Reemplaza googleapis Gmail con acceso directo sin API keys, sin límites, sin bloqueos.
 * 
 * Protocolos: IMAP (leer) + SMTP (enviar)
 * Paquetes: imapflow + nodemailer
 * Licencia: MIT
 * RAM: ~5MB
 */

const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class EmailManager extends EventEmitter {
    constructor() {
        super();
        this._initialized = false;
        this._accounts = new Map();
        this._transports = new Map();
        this._connections = new Map();
    }

    async initialize(config = {}) {
        if (this._initialized) return;
        this._config = {
            storageDir: config.storageDir || path.join(process.cwd(), 'data', 'emails'),
            cacheDir: config.cacheDir || path.join(process.cwd(), 'data', 'email-cache'),
            maxCacheSize: config.maxCacheSize || 1000,
            syncInterval: config.syncInterval || 300000, // 5 min
            maxRetries: config.maxRetries || 3,
            ...config
        };

        // Ensure directories exist
        for (const dir of [this._config.storageDir, this._config.cacheDir]) {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        }

        this._initialized = true;
        this.emit('initialized');
        return { success: true, module: 'EmailManager' };
    }

    /**
     * Add an email account (IMAP + SMTP)
     */
    async addAccount(name, imapConfig, smtpConfig) {
        const account = {
            name,
            imap: {
                host: imapConfig.host,
                port: imapConfig.port || 993,
                secure: imapConfig.secure !== false,
                auth: {
                    user: imapConfig.user,
                    pass: imapConfig.pass
                },
                logger: false,
                tls: { rejectUnauthorized: false }
            },
            smtp: smtpConfig ? {
                host: smtpConfig.host,
                port: smtpConfig.port || 587,
                secure: smtpConfig.secure || false,
                auth: {
                    user: smtpConfig.user || imapConfig.user,
                    pass: smtpConfig.pass || imapConfig.pass
                },
                tls: { rejectUnauthorized: false }
            } : null,
            folders: ['INBOX', 'Sent', 'Drafts', 'Trash'],
            lastSync: null
        };

        this._accounts.set(name, account);

        // Create SMTP transport
        if (account.smtp) {
            this._transports.set(name, nodemailer.createTransport(account.smtp));
        }

        this.emit('accountAdded', { name });
        return { success: true, account: name };
    }

    /**
     * Connect to IMAP server
     */
    async connect(accountName) {
        const account = this._accounts.get(accountName);
        if (!account) throw new Error(`Account not found: ${accountName}`);

        try {
            const client = new ImapFlow(account.imap);
            await client.connect();
            this._connections.set(accountName, client);
            this.emit('connected', { account: accountName });
            return { success: true, account: accountName };
        } catch (error) {
            this.emit('connectionError', { account: accountName, error: error.message });
            throw error;
        }
    }

    /**
     * List folders/mailboxes
     */
    async listFolders(accountName) {
        const client = this._getClient(accountName);
        const lock = await client.getMailboxLock('INBOX');
        try {
            const folders = [];
            for await (const folder of client.list()) {
                folders.push({
                    name: folder.name,
                    flags: [...folder.flags],
                    delimiter: folder.delimiter,
                    path: folder.path
                });
            }
            return { success: true, folders };
        } finally {
            lock.release();
        }
    }

    /**
     * List emails in a folder
     */
    async listEmails(accountName, folder = 'INBOX', options = {}) {
        const client = this._getClient(accountName);
        const { limit = 50, offset = 0, since, before, unseenOnly = false } = options;

        try {
            const lock = await client.getMailboxLock(folder);
            try {
                const searchCriteria = {};
                if (since) searchCriteria.since = new Date(since);
                if (before) searchCriteria.before = new Date(before);
                if (unseenOnly) searchCriteria.unseen = true;

                const messages = [];
                let count = 0;
                
                for await (const message of client.fetch(searchCriteria || '*', {
                    envelope: true,
                    flags: true,
                    source: false,
                    uid: true
                })) {
                    count++;
                    if (count <= offset) continue;
                    if (messages.length >= limit) break;

                    messages.push({
                        uid: message.uid,
                        from: message.envelope?.from?.map(f => ({
                            name: f.name,
                            address: f.mailbox + '@' + f.host
                        })) || [],
                        to: message.envelope?.to?.map(t => ({
                            name: t.name,
                            address: t.mailbox + '@' + t.host
                        })) || [],
                        subject: message.envelope?.subject || '(No subject)',
                        date: message.envelope?.date,
                        flags: [...message.flags],
                        unread: !message.flags?.includes('\\Seen')
                    });
                }

                return { success: true, messages, total: count, folder };
            } finally {
                lock.release();
            }
        } catch (error) {
            throw new Error(`Failed to list emails: ${error.message}`);
        }
    }

    /**
     * Read a specific email by UID
     */
    async readEmail(accountName, uid, folder = 'INBOX') {
        const client = this._getClient(accountName);

        try {
            const lock = await client.getMailboxLock(folder);
            try {
                const message = await client.fetchOne(uid, {
                    source: true,
                    envelope: true,
                    flags: true,
                    bodyStructure: true,
                    uid: true
                }, { uid: true });

                if (!message) throw new Error('Message not found');

                // Parse the raw source for body content
                const body = this._parseEmailBody(message.source, message.bodyStructure);

                return {
                    success: true,
                    email: {
                        uid: message.uid,
                        from: message.envelope?.from,
                        to: message.envelope?.to,
                        cc: message.envelope?.cc,
                        bcc: message.envelope?.bcc,
                        subject: message.envelope?.subject,
                        date: message.envelope?.date,
                        body: body.text,
                        htmlBody: body.html,
                        attachments: body.attachments,
                        flags: [...message.flags],
                        headers: message.envelope
                    }
                };
            } finally {
                lock.release();
            }
        } catch (error) {
            throw new Error(`Failed to read email: ${error.message}`);
        }
    }

    /**
     * Send email via SMTP
     */
    async sendEmail(accountName, options) {
        const transport = this._transports.get(accountName);
        if (!transport) throw new Error(`No SMTP transport for: ${accountName}`);

        const { to, cc, bcc, subject, text, html, attachments, replyTo } = options;

        try {
            const result = await transport.sendMail({
                from: this._accounts.get(accountName).imap.auth.user,
                to: Array.isArray(to) ? to.join(', ') : to,
                cc: cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined,
                bcc: bcc ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : undefined,
                subject,
                text,
                html,
                attachments: attachments || [],
                replyTo
            });

            this.emit('emailSent', { account: accountName, messageId: result.messageId });
            return { success: true, messageId: result.messageId };
        } catch (error) {
            this.emit('sendError', { account: accountName, error: error.message });
            throw new Error(`Failed to send email: ${error.message}`);
        }
    }

    /**
     * Reply to an email
     */
    async replyEmail(accountName, uid, folder, replyBody, replyAll = false) {
        const original = await this.readEmail(accountName, uid, folder);
        if (!original.success) throw new Error('Failed to read original email');

        const email = original.email;
        const to = replyAll
            ? [email.from?.[0]?.address, ...(email.to?.map(t => t.address) || [])]
            : [email.from?.[0]?.address];

        return this.sendEmail(accountName, {
            to: [...new Set(to)], // deduplicate
            subject: email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
            text: replyBody,
            replyTo: email.from?.[0]?.address
        });
    }

    /**
     * Forward an email
     */
    async forwardEmail(accountName, uid, folder, to,附加Text = '') {
        const original = await this.readEmail(accountName, uid, folder);
        if (!original.success) throw new Error('Failed to read original email');

        const email = original.email;
        const forwardedBody =附加Text + '\n\n--- Forwarded message ---\n' +
            `From: ${email.from?.map(f => f.name || f.address).join(', ')}\n` +
            `Date: ${email.date}\n` +
            `Subject: ${email.subject}\n` +
            `To: ${email.to?.map(t => t.name || t.address).join(', ')}\n\n` +
            email.body;

        return this.sendEmail(accountName, {
            to: Array.isArray(to) ? to : [to],
            subject: `Fwd: ${email.subject}`,
            text: forwardedBody
        });
    }

    /**
     * Search emails
     */
    async searchEmails(accountName, folder, query) {
        const client = this._getClient(accountName);

        try {
            const lock = await client.getMailboxLock(folder);
            try {
                const searchCriteria = {};
                
                // Build search criteria from query
                if (query.from) searchCriteria.from = query.from;
                if (query.to) searchCriteria.to = query.to;
                if (query.subject) searchCriteria.subject = query.subject;
                if (query.body) searchCriteria.body = query.body;
                if (query.since) searchCriteria.since = new Date(query.since);
                if (query.before) searchCriteria.before = new Date(query.before);
                if (query.unseen) searchCriteria.unseen = true;
                if (query.flagged) searchCriteria.flagged = true;

                const uids = await client.search(searchCriteria, { uid: true });
                
                return { success: true, uids, count: uids.length };
            } finally {
                lock.release();
            }
        } catch (error) {
            throw new Error(`Search failed: ${error.message}`);
        }
    }

    /**
     * Move email to folder
     */
    async moveEmail(accountName, uid, fromFolder, toFolder) {
        const client = this._getClient(accountName);
        try {
            const lock = await client.getMailboxLock(fromFolder);
            try {
                await client.messageMove(uid, toFolder, { uid: true });
                return { success: true, moved: { uid, from: fromFolder, to: toFolder } };
            } finally {
                lock.release();
            }
        } catch (error) {
            throw new Error(`Move failed: ${error.message}`);
        }
    }

    /**
     * Delete email (move to Trash)
     */
    async deleteEmail(accountName, uid, folder = 'INBOX') {
        return this.moveEmail(accountName, uid, folder, 'Trash');
    }

    /**
     * Mark as read/unread
     */
    async setReadStatus(accountName, uid, folder, unread = false) {
        const client = this._getClient(accountName);
        try {
            const lock = await client.getMailboxLock(folder);
            try {
                if (unread) {
                    await client.messageFlagsRemove(uid, ['\\Seen'], { uid: true });
                } else {
                    await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
                }
                return { success: true };
            } finally {
                lock.release();
            }
        } catch (error) {
            throw new Error(`Flag update failed: ${error.message}`);
        }
    }

    /**
     * Sync all accounts
     */
    async syncAll() {
        const results = [];
        for (const [name] of this._accounts) {
            try {
                if (!this._connections.has(name)) {
                    await this.connect(name);
                }
                const emails = await this.listEmails(name, 'INBOX', { limit: 100 });
                results.push({ account: name, success: true, count: emails.messages?.length || 0 });
            } catch (error) {
                results.push({ account: name, success: false, error: error.message });
            }
        }
        return { success: true, results };
    }

    /**
     * Get account statistics
     */
    async getStats(accountName) {
        const client = this._getClient(accountName);
        const stats = {};

        try {
            const lock = await client.getMailboxLock('INBOX');
            try {
                const status = await client.status('INBOX', {
                    messages: true,
                    unseen: true,
                    uidNext: true
                });
                stats.inbox = {
                    total: status.messages,
                    unread: status.unseen
                };
            } finally {
                lock.release();
            }
        } catch (error) {
            stats.inbox = { error: error.message };
        }

        return { success: true, stats };
    }

    /**
     * Export emails to JSON
     */
    async exportEmails(accountName, folder, outputPath, limit = 1000) {
        const emails = await this.listEmails(accountName, folder, { limit });
        const outputPath_resolved = outputPath || path.join(
            this._config.storageDir,
            `${accountName}_${folder}_${Date.now()}.json`
        );

        fs.writeFileSync(outputPath_resolved, JSON.stringify(emails.messages, null, 2));
        return { success: true, exported: emails.messages.length, path: outputPath_resolved };
    }

    // ── Internal ──────────────────────────────────────────────

    _getClient(accountName) {
        const client = this._connections.get(accountName);
        if (!client) throw new Error(`Not connected to: ${accountName}. Call connect() first.`);
        return client;
    }

    _parseEmailBody(source, bodyStructure) {
        const result = { text: '', html: '', attachments: [] };
        if (!source) return result;

        const sourceStr = typeof source === 'string' ? source : source.toString('utf8');

        // Simple parsing - extract text and HTML parts
        const htmlMatch = sourceStr.match(/Content-Type: text\/html[^]*?\r\n\r\n([\s\S]*?)(?=\r\n--|\r\n\.\r\n|$)/i);
        const textMatch = sourceStr.match(/Content-Type: text\/plain[^]*?\r\n\r\n([\s\S]*?)(?=\r\n--|\r\n\.\r\n|$)/i);

        if (htmlMatch) result.html = htmlMatch[1].trim();
        if (textMatch) result.text = textMatch[1].trim();

        // Fallback: if no structured content found, use raw source
        if (!result.text && !result.html) {
            result.text = sourceStr;
        }

        // Detect attachments
        const attachMatches = sourceStr.match(/Content-Disposition: attachment; filename="([^"]+)"/gi) || [];
        result.attachments = attachMatches.map(m => {
            const nameMatch = m.match(/filename="([^"]+)"/);
            return nameMatch ? { filename: nameMatch[1] } : null;
        }).filter(Boolean);

        return result;
    }

    /**
     * Disconnect from all servers
     */
    async disconnectAll() {
        for (const [name, client] of this._connections) {
            try {
                await client.logout();
            } catch (e) { /* ignore */ }
        }
        this._connections.clear();
        this.emit('disconnected');
    }

    /**
     * Health check
     */
    async healthCheck() {
        const status = {};
        for (const [name] of this._accounts) {
            status[name] = this._connections.has(name) ? 'connected' : 'disconnected';
        }
        return { module: 'EmailManager', initialized: this._initialized, accounts: status };
    }
}

module.exports = { EmailManager };
module.exports.default = EmailManager;
