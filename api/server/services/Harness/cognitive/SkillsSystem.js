/**
 * SkillsSystem.js — Reusable Knowledge Packages
 * 
 * Claude Code-style skills:
 * - Store reusable procedures
 * - Load skills by name
 * - Auto-detect applicable skills
 * - Skill marketplace ready
 * 
 * License: MIT + better-sqlite3 (Public Domain)
 * RAM: ~5MB
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[SkillsSystem]', ...args),
    info: (...args) => console.info('[SkillsSystem]', ...args),
    warn: (...args) => console.warn('[SkillsSystem]', ...args),
    error: (...args) => console.error('[SkillsSystem]', ...args),
};

class SkillsSystem extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'SkillsSystem';
        this._storageDir = config.storageDir || path.join(process.cwd(), 'data', 'skills');
        this._skills = new Map();
        this._loadSkills();
    }

    /**
     * Create a new skill.
     */
    create(skill) {
        const id = skill.id || `skill_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        const entry = {
            id,
            name: skill.name || 'Untitled Skill',
            description: skill.description || '',
            category: skill.category || 'general',
            triggers: skill.triggers || [], // Keywords that activate this skill
            steps: skill.steps || [],
            tools: skill.tools || [],
            examples: skill.examples || [],
            version: skill.version || '1.0.0',
            author: skill.author || 'system',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            usageCount: 0,
            successCount: 0,
        };

        this._skills.set(id, entry);
        this._saveSkills();

        logger.info(`[SkillsSystem] Created skill: ${entry.name} (${id})`);
        return { success: true, id, skill: entry };
    }

    /**
     * Get a skill by ID.
     */
    get(skillId) {
        return this._skills.get(skillId) || null;
    }

    /**
     * Find skills applicable to a task.
     */
    findApplicable(task) {
        const taskLower = task.toLowerCase();
        const applicable = [];

        for (const [id, skill] of this._skills) {
            let score = 0;

            // Check triggers
            for (const trigger of skill.triggers) {
                if (taskLower.includes(trigger.toLowerCase())) {
                    score += 5;
                }
            }

            // Check name
            if (taskLower.includes(skill.name.toLowerCase())) {
                score += 3;
            }

            // Check description
            if (taskLower.includes(skill.description.toLowerCase().substring(0, 20))) {
                score += 2;
            }

            // Check category
            if (skill.category && taskLower.includes(skill.category)) {
                score += 1;
            }

            if (score > 0) {
                applicable.push({ ...skill, score });
            }
        }

        return applicable.sort((a, b) => b.score - a.score);
    }

    /**
     * Execute a skill.
     */
    async execute(skillId, context = {}) {
        const skill = this._skills.get(skillId);
        if (!skill) {
            throw new Error(`Skill not found: ${skillId}`);
        }

        skill.usageCount++;
        this._saveSkills();

        logger.info(`[SkillsSystem] Executing skill: ${skill.name}`);

        return {
            skillId,
            name: skill.name,
            steps: skill.steps,
            tools: skill.tools,
            context: {
                ...context,
                skillName: skill.name,
                skillDescription: skill.description,
            },
        };
    }

    /**
     * Record skill success.
     */
    recordSuccess(skillId) {
        const skill = this._skills.get(skillId);
        if (skill) {
            skill.successCount++;
            this._saveSkills();
        }
    }

    /**
     * List all skills.
     */
    list(category = null) {
        let skills = [...this._skills.values()];
        if (category) {
            skills = skills.filter(s => s.category === category);
        }
        return skills.sort((a, b) => b.usageCount - a.usageCount);
    }

    /**
     * Delete a skill.
     */
    delete(skillId) {
        if (!this._skills.has(skillId)) {
            throw new Error(`Skill not found: ${skillId}`);
        }
        this._skills.delete(skillId);
        this._saveSkills();
        return { success: true };
    }

    /**
     * Get skill categories.
     */
    getCategories() {
        const categories = {};
        for (const skill of this._skills.values()) {
            categories[skill.category] = (categories[skill.category] || 0) + 1;
        }
        return categories;
    }

    /**
     * Get skill statistics.
     */
    getStats() {
        const skills = [...this._skills.values()];
        return {
            total: skills.length,
            totalUsage: skills.reduce((sum, s) => sum + s.usageCount, 0),
            totalSuccess: skills.reduce((sum, s) => sum + s.successCount, 0),
            categories: this.getCategories(),
        };
    }

    // ── Internal ──────────────────────────────────────────────

    _loadSkills() {
        try {
            if (!fs.existsSync(this._storageDir)) {
                fs.mkdirSync(this._storageDir, { recursive: true });
            }
            const file = path.join(this._storageDir, 'skills.json');
            if (fs.existsSync(file)) {
                const data = JSON.parse(fs.readFileSync(file, 'utf8'));
                for (const [id, skill] of Object.entries(data)) {
                    this._skills.set(id, skill);
                }
            }
            // Load default skills if none exist
            if (this._skills.size === 0) {
                this._loadDefaultSkills();
            }
        } catch (e) {
            logger.warn(`[SkillsSystem] Failed to load: ${e.message}`);
            this._loadDefaultSkills();
        }
    }

    _loadDefaultSkills() {
        const defaults = [
            {
                id: 'skill_coding',
                name: 'Code Generation',
                description: 'Generate, edit, and refactor code in any language',
                category: 'coding',
                triggers: ['code', 'write code', 'implement', 'create function', 'refactor'],
                steps: ['Analyze requirements', 'Plan structure', 'Implement code', 'Verify syntax', 'Test'],
                tools: ['read_file', 'write_file', 'edit_file', 'execute_command', 'grep'],
            },
            {
                id: 'skill_debugging',
                name: 'Debug & Fix',
                description: 'Diagnose and fix errors, bugs, and issues',
                category: 'coding',
                triggers: ['debug', 'fix', 'error', 'bug', 'broken', 'not working'],
                steps: ['Read error message', 'Locate source', 'Analyze root cause', 'Apply fix', 'Verify fix'],
                tools: ['read_file', 'grep', 'edit_file', 'execute_command'],
            },
            {
                id: 'skill_testing',
                name: 'Write Tests',
                description: 'Create and run unit tests, integration tests',
                category: 'coding',
                triggers: ['test', 'spec', 'unit test', 'coverage', 'assert'],
                steps: ['Analyze code to test', 'Design test cases', 'Write test file', 'Run tests', 'Report results'],
                tools: ['read_file', 'write_file', 'execute_command'],
            },
            {
                id: 'skill_documentation',
                name: 'Documentation',
                description: 'Generate docs, README, API reference, comments',
                category: 'documentation',
                triggers: ['document', 'readme', 'docs', 'api reference', 'comment'],
                steps: ['Read code', 'Extract API surface', 'Generate documentation', 'Write to file'],
                tools: ['read_file', 'write_file', 'grep'],
            },
            {
                id: 'skill_web_search',
                name: 'Web Research',
                description: 'Search the web for information, APIs, solutions',
                category: 'research',
                triggers: ['search', 'find', 'look up', 'research', 'google'],
                steps: ['Formulate query', 'Search web', 'Extract results', 'Summarize findings'],
                tools: ['web_search', 'web_scraper'],
            },
            {
                id: 'skill_git',
                name: 'Git Operations',
                description: 'Git commit, branch, merge, resolve conflicts',
                category: 'devops',
                triggers: ['git', 'commit', 'branch', 'merge', 'pull request'],
                steps: ['Check status', 'Stage changes', 'Commit with message', 'Push/pull as needed'],
                tools: ['execute_command', 'read_file'],
            },
            {
                id: 'skill_refactoring',
                name: 'Refactor Code',
                description: 'Improve code structure without changing behavior',
                category: 'coding',
                triggers: ['refactor', 'clean up', 'improve', 'simplify', 'optimize'],
                steps: ['Read target code', 'Identify improvements', 'Plan refactoring', 'Apply changes', 'Verify tests pass'],
                tools: ['read_file', 'edit_file', 'grep', 'execute_command'],
            },
            {
                id: 'skill_file_operations',
                name: 'File Operations',
                description: 'Create, read, edit, move, delete files and directories',
                category: 'filesystem',
                triggers: ['file', 'folder', 'directory', 'create', 'delete', 'move'],
                steps: ['Locate target', 'Perform operation', 'Verify result'],
                tools: ['read_file', 'write_file', 'edit_file', 'list_directory', 'create_directory', 'delete_file', 'move_file'],
            },
            {
                id: 'skill_terminal',
                name: 'Terminal Commands',
                description: 'Execute shell commands, scripts, installations',
                category: 'devops',
                triggers: ['run', 'execute', 'terminal', 'shell', 'command', 'install'],
                steps: ['Formulate command', 'Execute safely', 'Parse output', 'Handle errors'],
                tools: ['execute_command', 'execute_background'],
            },
            {
                id: 'skill_context_engineering',
                name: 'Context Engineering',
                description: 'Optimize context, compress tokens, manage memory',
                category: 'optimization',
                triggers: ['context', 'token', 'compress', 'memory', 'summarize'],
                steps: ['Analyze context size', 'Identify redundancies', 'Compress selectively', 'Verify quality'],
                tools: ['read_file', 'grep', 'glob'],
            },
            {
                id: 'skill_planning',
                name: 'Task Planning',
                description: 'Break down complex tasks into steps',
                category: 'planning',
                triggers: ['plan', 'break down', 'step by step', 'organize', 'approach'],
                steps: ['Understand goal', 'Identify dependencies', 'Create step list', 'Prioritize', 'Execute'],
                tools: ['read_file', 'grep', 'glob'],
            },
            {
                id: 'skill_memory_management',
                name: 'Memory Management',
                description: 'Store and retrieve knowledge, lessons, experiences',
                category: 'knowledge',
                triggers: ['remember', 'recall', 'memory', 'knowledge', 'lesson'],
                steps: ['Check existing memory', 'Store new knowledge', 'Index for retrieval', 'Verify retrieval'],
                tools: ['read_file', 'write_file'],
            },
        ];

        for (const skill of defaults) {
            this._skills.set(skill.id, {
                ...skill,
                version: '1.0.0',
                author: 'system',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                usageCount: 0,
                successCount: 0,
            });
        }

        logger.info(`[SkillsSystem] Loaded ${defaults.length} default skills`);
        this._saveSkills();
    }

    _saveSkills() {
        try {
            if (!fs.existsSync(this._storageDir)) {
                fs.mkdirSync(this._storageDir, { recursive: true });
            }
            const file = path.join(this._storageDir, 'skills.json');
            fs.writeFileSync(file, JSON.stringify(Object.fromEntries(this._skills), null, 2));
        } catch (e) {
            logger.warn(`[SkillsSystem] Failed to save: ${e.message}`);
        }
    }
}

module.exports = { SkillsSystem };
module.exports.default = SkillsSystem;
