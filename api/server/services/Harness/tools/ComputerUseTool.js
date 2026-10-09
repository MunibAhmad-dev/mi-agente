/**
 * ComputerUseTool.js — Computer Use Tool Adapter
 * 
 * Wraps the existing ComputerUse.js (540 lines, cross-platform)
 * as a proper tool registered in the AgentLoop.
 * 
 * Provides 16 functions:
 * - screenshot, click, doubleClick, rightClick
 * - moveMouse, scroll, drag
 * - typeText, pressKey, hotkey
 * - getWindowList, focusWindow, resizeWindow
 * - clipboardRead, clipboardWrite
 * - browserAction
 */

const { ComputerUse } = require('../ComputerUse');

const logger = {
    debug: (...args) => console.log('[ComputerUseTool]', ...args),
    info: (...args) => console.info('[ComputerUseTool]', ...args),
    warn: (...args) => console.warn('[ComputerUseTool]', ...args),
    error: (...args) => console.error('[ComputerUseTool]', ...args),
};

class ComputerUseTool {
    constructor(config = {}) {
        this._name = 'ComputerUseTool';
        this._computerUse = new ComputerUse(config);
    }

    getToolDefinitions() {
        return [
            {
                type: 'function',
                function: {
                    name: 'computer_screenshot',
                    description: 'Take a screenshot of the current desktop screen. Returns the screenshot as base64 image data.',
                    parameters: {
                        type: 'object',
                        properties: {
                            region: { type: 'string', description: 'Optional region: "full", "active_window", or "x,y,width,height"' },
                        },
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'computer_click',
                    description: 'Click at specified screen coordinates.',
                    parameters: {
                        type: 'object',
                        properties: {
                            x: { type: 'number', description: 'X coordinate' },
                            y: { type: 'number', description: 'Y coordinate' },
                            button: { type: 'string', description: 'Button: left, right, middle', enum: ['left', 'right', 'middle'] },
                        },
                        required: ['x', 'y'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'computer_double_click',
                    description: 'Double-click at specified screen coordinates.',
                    parameters: {
                        type: 'object',
                        properties: {
                            x: { type: 'number', description: 'X coordinate' },
                            y: { type: 'number', description: 'Y coordinate' },
                        },
                        required: ['x', 'y'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'computer_move_mouse',
                    description: 'Move the mouse to specified coordinates.',
                    parameters: {
                        type: 'object',
                        properties: {
                            x: { type: 'number', description: 'X coordinate' },
                            y: { type: 'number', description: 'Y coordinate' },
                        },
                        required: ['x', 'y'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'computer_scroll',
                    description: 'Scroll the mouse wheel at current position.',
                    parameters: {
                        type: 'object',
                        properties: {
                            direction: { type: 'string', description: 'up or down', enum: ['up', 'down'] },
                            amount: { type: 'number', description: 'Scroll amount (default 3)' },
                        },
                        required: ['direction'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'computer_type',
                    description: 'Type text as keyboard input at current cursor position.',
                    parameters: {
                        type: 'object',
                        properties: {
                            text: { type: 'string', description: 'Text to type' },
                            delay: { type: 'number', description: 'Delay between keystrokes in ms (default 50)' },
                        },
                        required: ['text'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'computer_press_key',
                    description: 'Press a single key or key combination.',
                    parameters: {
                        type: 'object',
                        properties: {
                            key: { type: 'string', description: 'Key name: Enter, Tab, Backspace, Delete, Escape, Space, arrows, F1-F12, or combo like "ctrl+c"' },
                        },
                        required: ['key'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'computer_hotkey',
                    description: 'Press a keyboard shortcut (hotkey combination).',
                    parameters: {
                        type: 'object',
                        properties: {
                            keys: { type: 'array', items: { type: 'string' }, description: 'Keys to press simultaneously, e.g. ["ctrl", "shift", "esc"]' },
                        },
                        required: ['keys'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'computer_drag',
                    description: 'Drag from one position to another.',
                    parameters: {
                        type: 'object',
                        properties: {
                            fromX: { type: 'number', description: 'Start X' },
                            fromY: { type: 'number', description: 'Start Y' },
                            toX: { type: 'number', description: 'End X' },
                            toY: { type: 'number', description: 'End Y' },
                        },
                        required: ['fromX', 'fromY', 'toX', 'toY'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'computer_clipboard_read',
                    description: 'Read the current clipboard content.',
                    parameters: { type: 'object', properties: {} },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'computer_clipboard_write',
                    description: 'Write text to the clipboard.',
                    parameters: {
                        type: 'object',
                        properties: {
                            text: { type: 'string', description: 'Text to copy to clipboard' },
                        },
                        required: ['text'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'computer_window_list',
                    description: 'List all open windows on the desktop.',
                    parameters: { type: 'object', properties: {} },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'computer_window_focus',
                    description: 'Focus/bring a window to the front by title.',
                    parameters: {
                        type: 'object',
                        properties: {
                            title: { type: 'string', description: 'Window title (partial match)' },
                        },
                        required: ['title'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'computer_window_resize',
                    description: 'Resize a window.',
                    parameters: {
                        type: 'object',
                        properties: {
                            title: { type: 'string', description: 'Window title' },
                            width: { type: 'number', description: 'New width' },
                            height: { type: 'number', description: 'New height' },
                        },
                        required: ['title', 'width', 'height'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'computer_mouse_position',
                    description: 'Get the current mouse cursor position.',
                    parameters: { type: 'object', properties: {} },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'computer_screen_size',
                    description: 'Get the screen resolution.',
                    parameters: { type: 'object', properties: {} },
                },
            },
        ];
    }

    async execute(toolName, params, context = {}) {
        try {
            switch (toolName) {
                case 'computer_screenshot':
                    return await this._computerUse.screenshot(params);
                case 'computer_click':
                    return await this._computerUse.click(params.x, params.y, params.button || 'left');
                case 'computer_double_click':
                    return await this._computerUse.doubleClick(params.x, params.y);
                case 'computer_move_mouse':
                    return await this._computerUse.moveMouse(params.x, params.y);
                case 'computer_scroll':
                    return await this._computerUse.scroll(params.direction === 'up' ? 3 : -3);
                case 'computer_type':
                    return await this._computerUse.typeText(params.text);
                case 'computer_press_key':
                    return await this._computerUse.pressKey(params.key);
                case 'computer_hotkey':
                    return await this._computerUse.hotkey(...(params.keys || []));
                case 'computer_drag':
                    return await this._computerUse.drag(params.fromX, params.fromY, params.toX, params.toY);
                case 'computer_clipboard_read':
                    return await this._computerUse.clipboardRead();
                case 'computer_clipboard_write':
                    return await this._computerUse.clipboardWrite(params.text);
                case 'computer_window_list':
                    return await this._computerUse.getWindowList();
                case 'computer_window_focus':
                    return await this._computerUse.focusWindow(params.title);
                case 'computer_window_resize':
                    return await this._computerUse.resizeWindow(params.title, params.width, params.height);
                case 'computer_mouse_position':
                    return await this._computerUse.getMousePosition();
                case 'computer_screen_size':
                    return await this._computerUse.getScreenSize();
                default:
                    throw new Error(`Unknown tool: ${toolName}`);
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = { ComputerUseTool };
module.exports.default = ComputerUseTool;
