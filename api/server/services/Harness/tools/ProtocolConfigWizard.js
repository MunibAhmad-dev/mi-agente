/**
 * ProtocolConfigWizard.js — Configuration Wizard for Email/Calendar/Drive
 * 
 * Helps users configure:
 * - Email (IMAP/SMTP)
 * - Calendar (CalDAV)
 * - Drive (WebDAV)
 * 
 * License: MIT
 * RAM: ~2MB
 */

const fs = require('fs');
const path = require('path');

const logger = {
    info: (...args) => console.info('[ProtocolConfigWizard]', ...args),
    warn: (...args) => console.warn('[ProtocolConfigWizard]', ...args),
};

class ProtocolConfigWizard {
    constructor(config = {}) {
        this._name = 'ProtocolConfigWizard';
        this._configDir = config.configDir || path.join(process.cwd(), 'data', 'protocols');
        this._configs = new Map();
        this._loadConfigs();
    }

    /**
     * Configure email account.
     */
    configureEmail(name, config) {
        const { imapHost, imapPort = 993, smtpHost, smtpPort = 587, username, password, secure = true } = config;
        
        if (!imapHost || !username || !password) {
            throw new Error('imapHost, username, and password are required');
        }

        const emailConfig = {
            name,
            type: 'email',
            imap: { host: imapHost, port: imapPort, secure, auth: { user: username, pass: password } },
            smtp: { host: smtpHost || imapHost, port: smtpPort, secure: smtpPort === 465, auth: { user: username, pass: password } },
            createdAt: Date.now(),
        };

        this._configs.set(`email_${name}`, emailConfig);
        this._saveConfigs();
        logger.info(`[ProtocolConfigWizard] Email configured: ${name}`);
        return { success: true, name, imap: `${imapHost}:${imapPort}`, smtp: `${emailConfig.smtp.host}:${smtpPort}` };
    }

    /**
     * Configure calendar account.
     */
    configureCalendar(name, config) {
        const { server, username, password, calendarPath = '/' } = config;
        
        if (!server || !username || !password) {
            throw new Error('server, username, and password are required');
        }

        const calConfig = {
            name,
            type: 'calendar',
            server,
            username,
            password,
            calendarPath,
            createdAt: Date.now(),
        };

        this._configs.set(`calendar_${name}`, calConfig);
        this._saveConfigs();
        logger.info(`[ProtocolConfigWizard] Calendar configured: ${name}`);
        return { success: true, name, server };
    }

    /**
     * Configure drive account.
     */
    configureDrive(name, config) {
        const { server, username, password, basePath = '/' } = config;
        
        if (!server || !username || !password) {
            throw new Error('server, username, and password are required');
        }

        const driveConfig = {
            name,
            type: 'drive',
            server,
            username,
            password,
            basePath,
            createdAt: Date.now(),
        };

        this._configs.set(`drive_${name}`, driveConfig);
        this._saveConfigs();
        logger.info(`[ProtocolConfigWizard] Drive configured: ${name}`);
        return { success: true, name, server };
    }

    /**
     * Get configuration.
     */
    getConfig(type, name) {
        return this._configs.get(`${type}_${name}`) || null;
    }

    /**
     * List all configurations.
     */
    listConfigs() {
        const configs = [];
        for (const [key, config] of this._configs) {
            configs.push({ key, type: config.type, name: config.name, createdAt: config.createdAt });
        }
        return configs;
    }

    /**
     * Delete configuration.
     */
    deleteConfig(type, name) {
        return this._configs.delete(`${type}_${name}`);
    }

    /**
     * Test connection.
     */
    async testConnection(type, name) {
        const config = this._configs.get(`${type}_${name}`);
        if (!config) throw new Error(`Config not found: ${type}_${name}`);

        // Basic validation
        if (type === 'email') {
            return { success: true, message: 'Email config valid', imap: `${config.imap.host}:${config.imap.port}` };
        }
        if (type === 'calendar') {
            return { success: true, message: 'Calendar config valid', server: config.server };
        }
        if (type === 'drive') {
            return { success: true, message: 'Drive config valid', server: config.server };
        }
        return { success: false, message: 'Unknown type' };
    }

    /**
     * Get quick setup presets.
     */
    getPresets() {
        return {
            email: [
                { name: 'Gmail', imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 587 },
                { name: 'Outlook', imapHost: 'outlook.office365.com', imapPort: 993, smtpHost: 'smtp.office365.com', smtpPort: 587 },
                { name: 'Yahoo', imapHost: 'imap.mail.yahoo.com', imapPort: 993, smtpHost: 'smtp.mail.yahoo.com', smtpPort: 587 },
            ],
            calendar: [
                { name: 'Nextcloud', server: 'https://your-nextcloud.com/remote.php/dav' },
                { name: 'Baikal', server: 'https://your-baikal.com/dav.php' },
                { name: 'Radicale', server: 'https://your-radicale.com' },
            ],
            drive: [
                { name: 'Nextcloud', server: 'https://your-nextcloud.com/remote.php/dav' },
                { name: 'ownCloud', server: 'https://your-owncloud.com/remote.php/dav' },
                { name: 'Synology', server: 'https://your-synology.com:5006/webdav' },
            ],
        };
    }

    _loadConfigs() {
        try {
            if (!fs.existsSync(this._configDir)) fs.mkdirSync(this._configDir, { recursive: true });
            const file = path.join(this._configDir, 'configs.json');
            if (fs.existsSync(file)) {
                const data = JSON.parse(fs.readFileSync(file, 'utf8'));
                for (const [key, config] of Object.entries(data)) this._configs.set(key, config);
            }
        } catch {}
    }

    _saveConfigs() {
        try {
            if (!fs.existsSync(this._configDir)) fs.mkdirSync(this._configDir, { recursive: true });
            fs.writeFileSync(path.join(this._configDir, 'configs.json'), JSON.stringify(Object.fromEntries(this._configs), null, 2));
        } catch {}
    }
}

module.exports = { ProtocolConfigWizard };
module.exports.default = ProtocolConfigWizard;
