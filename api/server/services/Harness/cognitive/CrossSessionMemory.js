/**
 * CrossSessionMemory.js — Cross-Session Memory System
 * 
 * Persists context between sessions:
 * - Store session summaries
 * - Load relevant context for new sessions
 * - Prioritize by relevance and recency
 * - Privacy-aware (user controls what's stored)
 * 
 * License: Custom (MIT)
 * RAM: ~5MB
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// MongoDB helper — gracefully disabled when DB unavailable
let _mc = null;
function mc() {
  if (_mc) return _mc;
  try { _mc = require('~/models/MemoryCollections'); } catch { _mc = null; }
  return _mc;
}

function isValidObjectId(id) {
  return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
}

const logger = {
    debug: (...args) => console.log('[CrossSessionMemory]', ...args),
    info: (...args) => console.info('[CrossSessionMemory]', ...args),
    warn: (...args) => console.warn('[CrossSessionMemory]', ...args),
    error: (...args) => console.error('[CrossSessionMemory]', ...args),
};

class CrossSessionMemory extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'CrossSessionMemory';
        this._storageDir = config.storageDir || path.join(process.cwd(), 'data', 'session-memory');
        this._maxSessions = config.maxSessions || 100;
        this._maxContextTokens = config.maxContextTokens || 4000;
        this._sessions = new Map();
        this._loadSessions();
    }

    /**
     * Save a session summary.
     */
    saveSession(session) {
        const id = session.id || `session_${Date.now()}`;

        const entry = {
            id,
            userId: session.userId || 'default',
            summary: session.summary || '',
            keyFacts: session.keyFacts || [],
            toolsUsed: session.toolsUsed || [],
            decisions: session.decisions || [],
            errors: session.errors || [],
            taskType: session.taskType || 'general',
            timestamp: Date.now(),
            duration: session.duration || 0,
            messages: session.messageCount || 0,
        };

        this._sessions.set(id, entry);
        this._pruneOldSessions();
        this._saveSessions();

        // Write-through to MongoDB HistoricalMemory (fire-and-forget)
        if (isValidObjectId(entry.userId)) {
          const lib = mc();
          if (lib) {
            lib.recordHistoricalEvent(entry.userId, {
              sessionId: id,
              event: 'cross_session:saved',
              context: {
                summary: entry.summary,
                taskType: entry.taskType,
                keyFacts: entry.keyFacts,
                toolsUsed: entry.toolsUsed,
              },
              outcome: 'success',
              score: 1,
              tags: [entry.taskType || 'general'],
              metadata: { decisions: entry.decisions, errors: entry.errors },
            }).catch(() => {});
          }
        }

        logger.info(`[CrossSessionMemory] Saved session: ${id}`);
        return { success: true, id };
    }

    /**
     * Get context for a new session based on relevance.
     */
    getContext(userId = 'default', query = '', limit = 5) {
        // Get all sessions for this user
        const userSessions = [...this._sessions.values()]
            .filter(s => s.userId === userId)
            .sort((a, b) => b.timestamp - a.timestamp);

        if (userSessions.length === 0) return { context: '', sessions: [] };

        // Score sessions by relevance
        const scored = userSessions.map(session => {
            let score = 0;

            // Recency score (more recent = higher)
            const age = Date.now() - session.timestamp;
            const dayAge = age / (1000 * 60 * 60 * 24);
            score += Math.max(0, 10 - dayAge);

            // Query relevance score
            if (query) {
                const queryLower = query.toLowerCase();
                if (session.summary.toLowerCase().includes(queryLower)) score += 5;
                if (session.keyFacts.some(f => f.toLowerCase().includes(queryLower))) score += 3;
                if (session.taskType.toLowerCase().includes(queryLower)) score += 2;
            }

            // Complexity score (more complex = more useful)
            if (session.toolsUsed.length > 3) score += 2;
            if (session.decisions.length > 2) score += 2;

            return { ...session, score };
        });

        // Sort by score and take top N
        const relevant = scored
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        // Build context string
        let context = '## Previous Session Context\n\n';
        for (const session of relevant) {
            context += `### ${new Date(session.timestamp).toLocaleDateString()}\n`;
            context += `${session.summary}\n`;
            if (session.keyFacts.length > 0) {
                context += `Key facts: ${session.keyFacts.join(', ')}\n`;
            }
            context += '\n';
        }

        return {
            context,
            sessions: relevant.map(s => ({
                id: s.id,
                date: new Date(s.timestamp).toISOString(),
                summary: s.summary.substring(0, 200),
                taskType: s.taskType,
            })),
        };
    }

    /**
     * Get user's session history.
     */
    getHistory(userId = 'default', limit = 20) {
        return [...this._sessions.values()]
            .filter(s => s.userId === userId)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit)
            .map(s => ({
                id: s.id,
                date: new Date(s.timestamp).toISOString(),
                summary: s.summary.substring(0, 200),
                taskType: s.taskType,
                toolsUsed: s.toolsUsed,
                duration: s.duration,
            }));
    }

    /**
     * Delete a session.
     */
    deleteSession(sessionId) {
        this._sessions.delete(sessionId);
        this._saveSessions();
        return { success: true };
    }

    /**
     * Get statistics.
     */
    getStats() {
        const sessions = [...this._sessions.values()];
        const users = new Set(sessions.map(s => s.userId));

        return {
            totalSessions: sessions.length,
            uniqueUsers: users.size,
            avgDuration: sessions.length > 0 
                ? sessions.reduce((sum, s) => sum + s.duration, 0) / sessions.length 
                : 0,
            avgMessages: sessions.length > 0
                ? sessions.reduce((sum, s) => sum + s.messages, 0) / sessions.length
                : 0,
        };
    }

    /**
     * Search sessions by content.
     */
    search(query, userId = 'default') {
        const queryLower = query.toLowerCase();
        return [...this._sessions.values()]
            .filter(s => s.userId === userId)
            .filter(s => 
                s.summary.toLowerCase().includes(queryLower) ||
                s.keyFacts.some(f => f.toLowerCase().includes(queryLower))
            )
            .sort((a, b) => b.timestamp - a.timestamp)
            .map(s => ({
                id: s.id,
                date: new Date(s.timestamp).toISOString(),
                summary: s.summary.substring(0, 200),
                matchedFacts: s.keyFacts.filter(f => f.toLowerCase().includes(queryLower)),
            }));
    }

    // ── Internal ──────────────────────────────────────────────

    _pruneOldSessions() {
        if (this._sessions.size > this._maxSessions) {
            const sorted = [...this._sessions.entries()]
                .sort((a, b) => a[1].timestamp - b[1].timestamp);
            
            const toDelete = sorted.slice(0, sorted.length - this._maxSessions);
            for (const [id] of toDelete) {
                this._sessions.delete(id);
            }
        }
    }

    _loadSessions() {
        try {
            if (!fs.existsSync(this._storageDir)) {
                fs.mkdirSync(this._storageDir, { recursive: true });
            }
            const file = path.join(this._storageDir, 'sessions.json');
            if (fs.existsSync(file)) {
                const data = JSON.parse(fs.readFileSync(file, 'utf8'));
                for (const [id, session] of Object.entries(data)) {
                    this._sessions.set(id, session);
                }
            }
        } catch (e) {
            logger.warn(`[CrossSessionMemory] Failed to load: ${e.message}`);
        }
    }

    _saveSessions() {
        try {
            if (!fs.existsSync(this._storageDir)) {
                fs.mkdirSync(this._storageDir, { recursive: true });
            }
            const file = path.join(this._storageDir, 'sessions.json');
            fs.writeFileSync(file, JSON.stringify(Object.fromEntries(this._sessions), null, 2));
        } catch (e) {
            logger.warn(`[CrossSessionMemory] Failed to save: ${e.message}`);
        }
    }
}

module.exports = { CrossSessionMemory };
module.exports.default = CrossSessionMemory;
