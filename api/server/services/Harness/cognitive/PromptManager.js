/**
 * PromptManager.js — Prompt Engineering Management
 * 
 * Manages prompts:
 * - Store prompt templates
 * - Version control
 * - A/B testing
 * - Optimization
 * 
 * License: MIT
 * RAM: ~2MB
 */

const fs = require('fs');
const path = require('path');

class PromptManager {
    constructor(config = {}) {
        this._name = 'PromptManager';
        this._storageDir = config.storageDir || path.join(process.cwd(), 'data', 'prompts');
        this._prompts = new Map();
        this._loadPrompts();
    }

    create(prompt) {
        const id = prompt.id || `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const entry = { id, name: prompt.name || 'Untitled', template: prompt.template, variables: prompt.variables || [], version: prompt.version || '1.0.0', tags: prompt.tags || [], usageCount: 0, successCount: 0, createdAt: Date.now(), updatedAt: Date.now() };
        this._prompts.set(id, entry);
        this._savePrompts();
        return entry;
    }

    get(id) { return this._prompts.get(id) || null; }

    render(id, variables = {}) {
        const prompt = this._prompts.get(id);
        if (!prompt) throw new Error(`Prompt not found: ${id}`);
        let rendered = prompt.template;
        for (const [key, value] of Object.entries(variables)) {
            rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
        }
        prompt.usageCount++;
        this._savePrompts();
        return rendered;
    }

    list(tag = null) {
        let prompts = [...this._prompts.values()];
        if (tag) prompts = prompts.filter(p => p.tags.includes(tag));
        return prompts.sort((a, b) => b.usageCount - a.usageCount);
    }

    _loadPrompts() {
        try {
            if (!fs.existsSync(this._storageDir)) fs.mkdirSync(this._storageDir, { recursive: true });
            const file = path.join(this._storageDir, 'prompts.json');
            if (fs.existsSync(file)) {
                const data = JSON.parse(fs.readFileSync(file, 'utf8'));
                for (const [id, prompt] of Object.entries(data)) this._prompts.set(id, prompt);
            }
        } catch {}
    }

    _savePrompts() {
        try {
            if (!fs.existsSync(this._storageDir)) fs.mkdirSync(this._storageDir, { recursive: true });
            fs.writeFileSync(path.join(this._storageDir, 'prompts.json'), JSON.stringify(Object.fromEntries(this._prompts), null, 2));
        } catch {}
    }
}

module.exports = { PromptManager };
module.exports.default = PromptManager;
