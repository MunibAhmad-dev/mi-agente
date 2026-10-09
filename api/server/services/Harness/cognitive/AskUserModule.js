/**
 * AskUserModule.js — Human-in-the-Loop Communication
 * 
 * Allows the agent to ask the user questions:
 * - Multiple choice options
 * - Free text input
 * - Confirmation dialogs
 * - Timeout handling
 * - WebSocket-based real-time communication
 */

const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[AskUserModule]', ...args),
    info: (...args) => console.info('[AskUserModule]', ...args),
    warn: (...args) => console.warn('[AskUserModule]', ...args),
    error: (...args) => console.error('[AskUserModule]', ...args),
};

class AskUserModule extends EventEmitter {
    constructor(config = {}) {
        super();
        this._timeout = config.timeout || 300000; // 5 minutes
        this._pendingQuestions = new Map();
    }

    /**
     * Ask the user a question with options.
     */
    async askQuestion(question, options = {}) {
        const questionId = `q_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        logger.info(`[AskUserModule] Asking: "${question.substring(0, 100)}..."`);

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this._pendingQuestions.delete(questionId);
                resolve({
                    answered: false,
                    answer: options.defaultAnswer || null,
                    reason: 'timeout',
                });
            }, options.timeout || this._timeout);

            this._pendingQuestions.set(questionId, {
                question,
                options: options.choices || [],
                resolve: (answer) => {
                    clearTimeout(timer);
                    this._pendingQuestions.delete(questionId);
                    resolve({ answered: true, answer });
                },
                timer,
            });

            // Emit event for UI/WebSocket handling
            this.emit('question', {
                id: questionId,
                question,
                choices: options.choices || [],
                timeout: options.timeout || this._timeout,
            });
        });
    }

    /**
     * Ask for confirmation (yes/no).
     */
    async confirm(message, options = {}) {
        const result = await this.askQuestion(message, {
            choices: [
                { label: 'Yes', value: true },
                { label: 'No', value: false },
            ],
            defaultAnswer: options.default || false,
            timeout: options.timeout,
        });

        return result.answer === true;
    }

    /**
     * Ask the user to choose from options.
     */
    async choose(question, choices, options = {}) {
        return this.askQuestion(question, {
            choices,
            defaultAnswer: options.default,
            timeout: options.timeout,
        });
    }

    /**
     * Ask for free text input.
     */
    async askText(question, options = {}) {
        return this.askQuestion(question, {
            choices: [], // Empty choices = free text
            defaultAnswer: options.default,
            timeout: options.timeout,
        });
    }

    /**
     * Submit an answer to a pending question.
     */
    submitAnswer(questionId, answer) {
        const pending = this._pendingQuestions.get(questionId);
        if (pending) {
            pending.resolve(answer);
            return { success: true };
        }
        return { success: false, error: 'Question not found or already answered' };
    }

    /**
     * Get pending questions.
     */
    getPendingQuestions() {
        const pending = [];
        for (const [id, info] of this._pendingQuestions) {
            pending.push({
                id,
                question: info.question,
                options: info.options,
            });
        }
        return pending;
    }

    // ── WebSocket Integration ─────────────────────────────────────

    /**
     * Attach a WebSocket server for real-time communication.
     * @param {Object} wss - WebSocket.Server instance
     */
    attachWebSocket(wss) {
        this._wss = wss;

        wss.on('connection', (ws) => {
            logger.info('[AskUserModule] WebSocket client connected');

            // Send pending questions to new client
            const pending = this.getPendingQuestions();
            if (pending.length > 0) {
                ws.send(JSON.stringify({
                    type: 'pending_questions',
                    questions: pending
                }));
            }

            ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    this._handleWSMessage(ws, msg);
                } catch (err) {
                    logger.error('[AskUserModule] Invalid WS message:', err.message);
                }
            });

            ws.on('close', () => {
                logger.info('[AskUserModule] WebSocket client disconnected');
            });
        });

        // When a new question is asked, broadcast to all clients
        this.on('question', (question) => {
            if (this._wss) {
                const payload = JSON.stringify({
                    type: 'question',
                    question
                });
                this._wss.clients.forEach((client) => {
                    if (client.readyState === 1) { // OPEN
                        client.send(payload);
                    }
                });
            }
        });

        logger.info('[AskUserModule] WebSocket attached');
    }

    /**
     * Handle incoming WebSocket messages.
     */
    _handleWSMessage(ws, msg) {
        switch (msg.type) {
            case 'answer':
                this.submitAnswer(msg.questionId, msg.answer);
                ws.send(JSON.stringify({
                    type: 'answer_received',
                    questionId: msg.questionId,
                    success: true
                }));
                break;

            case 'confirm':
                this.submitAnswer(msg.questionId, msg.confirmed === true);
                ws.send(JSON.stringify({
                    type: 'answer_received',
                    questionId: msg.questionId,
                    success: true
                }));
                break;

            case 'get_pending':
                ws.send(JSON.stringify({
                    type: 'pending_questions',
                    questions: this.getPendingQuestions()
                }));
                break;

            case 'cancel':
                const pending = this._pendingQuestions.get(msg.questionId);
                if (pending) {
                    pending.resolve({ answered: false, answer: null, reason: 'cancelled' });
                }
                break;

            default:
                logger.warn(`[AskUserModule] Unknown message type: ${msg.type}`);
        }
    }

    /**
     * Create an HTTP endpoint for AskUser (REST fallback).
     */
    createExpressRouter() {
        const express = require('express');
        const router = express.Router();

        // Get pending questions
        router.get('/pending', (req, res) => {
            res.json({ questions: this.getPendingQuestions() });
        });

        // Submit answer
        router.post('/answer', (req, res) => {
            const { questionId, answer } = req.body;
            const result = this.submitAnswer(questionId, answer);
            res.json(result);
        });

        // Ask a question (for testing)
        router.post('/ask', async (req, res) => {
            const { question, choices, timeout } = req.body;
            const result = await this.askQuestion(question, { choices, timeout });
            res.json(result);
        });

        return router;
    }
}

module.exports = { AskUserModule };
module.exports.default = AskUserModule;
