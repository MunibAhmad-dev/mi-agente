/**
 * ComputerUseVision.js — Computer Use with Vision
 * 
 * Uses screenshots + LLM vision to control the computer:
 * - Take screenshots
 * - Analyze with LLM vision
 * - Click, type, scroll on detected elements
 * - DOM analysis for web automation
 */

const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[ComputerUseVision]', ...args),
    info: (...args) => console.info('[ComputerUseVision]', ...args),
    warn: (...args) => console.warn('[ComputerUseVision]', ...args),
    error: (...args) => console.error('[ComputerUseVision]', ...args),
};

class ComputerUseVision extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'ComputerUseVision';
        this._llmProvider = config.llmProvider || null;
        this._screenshotDir = config.screenshotDir || null;
        this._browserManager = config.browserManager || null;
    }

    setLLMProvider(provider) { this._llmProvider = provider; }
    setBrowserManager(bm) { this._browserManager = bm; }

    getToolDefinitions() {
        return [
            {
                type: 'function',
                function: {
                    name: 'screenshot_and_analyze',
                    description: 'Take a screenshot and analyze what is on screen. Returns description and suggested actions.',
                    parameters: {
                        type: 'object',
                        properties: {
                            prompt: { type: 'string', description: 'What to look for in the screenshot' },
                        },
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'computer_action',
                    description: 'Perform a computer action (click, type, scroll, key) based on visual analysis.',
                    parameters: {
                        type: 'object',
                        properties: {
                            action: { type: 'string', description: 'Action type: click, type, scroll, key' },
                            coordinates: { type: 'array', items: { type: 'number' }, description: 'X,Y coordinates for click' },
                            text: { type: 'string', description: 'Text to type' },
                            key: { type: 'string', description: 'Key to press (e.g., Enter, Tab)' },
                        },
                        required: ['action'],
                    },
                },
            },
        ];
    }

    async execute(toolName, params, context = {}) {
        switch (toolName) {
            case 'screenshot_and_analyze': return this.screenshotAndAnalyze(params, context);
            case 'computer_action': return this.computerAction(params, context);
            default: throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    /**
     * Take a screenshot and analyze it.
     */
    async screenshotAndAnalyze(params = {}, context = {}) {
        const { prompt = 'Describe what is on screen' } = params;

        logger.info(`[ComputerUseVision] Taking screenshot and analyzing`);

        // Take screenshot (using Playwright if available)
        let screenshot;
        if (this._browserManager) {
            screenshot = await this._browserManager.screenshot();
        } else {
            // Fallback: return instruction
            return {
                success: false,
                message: 'No browser manager available. Use BrowserManager for screenshots.',
            };
        }

        if (!this._llmProvider) {
            return {
                success: false,
                message: 'No LLM provider available for visual analysis.',
            };
        }

        // Analyze with LLM vision
        try {
            const response = await this._llmProvider.chat({
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot.toString('base64')}` } },
                    ],
                }],
                maxTokens: 1000,
            });

            return {
                success: true,
                analysis: response.content,
                screenshotSize: screenshot.length,
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Perform a computer action.
     */
    async computerAction(params, context = {}) {
        const { action, coordinates, text, key } = params;

        logger.info(`[ComputerUseVision] Action: ${action}`);

        if (!this._browserManager) {
            return { success: false, message: 'No browser manager available' };
        }

        try {
            switch (action) {
                case 'click':
                    if (!coordinates || coordinates.length !== 2) {
                        return { success: false, message: 'Click requires [x, y] coordinates' };
                    }
                    await this._browserManager.click(coordinates[0], coordinates[1]);
                    return { success: true, action: 'click', coordinates };

                case 'type':
                    if (!text) {
                        return { success: false, message: 'Type requires text' };
                    }
                    await this._browserManager.type(text);
                    return { success: true, action: 'type', text };

                case 'scroll':
                    await this._browserManager.scroll(coordinates ? coordinates[1] || 0 : 300);
                    return { success: true, action: 'scroll' };

                case 'key':
                    if (!key) {
                        return { success: false, message: 'Key press requires key name' };
                    }
                    await this._browserManager.pressKey(key);
                    return { success: true, action: 'key', key };

                default:
                    return { success: false, message: `Unknown action: ${action}` };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = { ComputerUseVision };
module.exports.default = ComputerUseVision;
