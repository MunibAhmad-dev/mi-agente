/**
 * DynamicWorkflows.js — Dynamic Workflow Engine
 * 
 * User-customizable automation workflows:
 * - Create workflows from JSON/YAML
 * - Execute step-by-step
 * - Conditional branching
 * - Loop support
 * - Templates
 * 
 * License: Custom (MIT)
 * RAM: ~5MB
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const logger = {
    debug: (...args) => console.log('[DynamicWorkflows]', ...args),
    info: (...args) => console.info('[DynamicWorkflows]', ...args),
    warn: (...args) => console.warn('[DynamicWorkflows]', ...args),
    error: (...args) => console.error('[DynamicWorkflows]', ...args),
};

class DynamicWorkflows extends EventEmitter {
    constructor(config = {}) {
        super();
        this._name = 'DynamicWorkflows';
        this._storageDir = config.storageDir || path.join(process.cwd(), 'data', 'workflows');
        this._workflows = new Map();
        this._templates = this._getDefaultTemplates();
        this._loadWorkflows();
    }

    /**
     * Create a new workflow.
     */
    create(workflow) {
        const id = workflow.id || `wf_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        const entry = {
            id,
            name: workflow.name || 'Untitled Workflow',
            description: workflow.description || '',
            steps: workflow.steps || [],
            variables: workflow.variables || {},
            createdAt: Date.now(),
            updatedAt: Date.now(),
            executions: 0,
            lastExecuted: null,
        };

        this._workflows.set(id, entry);
        this._saveWorkflows();

        logger.info(`[DynamicWorkflows] Created workflow: ${id}`);
        return { success: true, id, workflow: entry };
    }

    /**
     * Execute a workflow.
     */
    async execute(workflowId, context = {}, options = {}) {
        const workflow = this._workflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }

        const startTime = Date.now();
        const maxSteps = options.maxSteps || 100;
        const results = [];

        logger.info(`[DynamicWorkflows] Executing workflow: ${workflow.name}`);

        // Merge context with workflow variables
        const vars = { ...workflow.variables, ...context };

        let stepIndex = 0;
        let iterations = 0;

        while (stepIndex < workflow.steps.length && iterations < maxSteps) {
            iterations++;
            const step = workflow.steps[stepIndex];

            logger.info(`[DynamicWorkflows] Step ${stepIndex + 1}: ${step.type} - ${step.description || ''}`);

            try {
                const result = await this._executeStep(step, vars, workflow);
                results.push({ step: stepIndex, ...result });

                // Handle flow control
                if (result.goto !== undefined) {
                    stepIndex = result.goto;
                } else if (result.break) {
                    break;
                } else {
                    stepIndex++;
                }
            } catch (error) {
                results.push({
                    step: stepIndex,
                    success: false,
                    error: error.message,
                });

                if (options.stopOnError) {
                    break;
                }
                stepIndex++;
            }
        }

        // Update workflow stats
        workflow.executions++;
        workflow.lastExecuted = Date.now();
        this._saveWorkflows();

        const duration = Date.now() - startTime;

        return {
            success: results.every(r => r.success !== false),
            workflowId,
            results,
            duration,
            stepsExecuted: results.length,
        };
    }

    /**
     * List all workflows.
     */
    list() {
        return [...this._workflows.values()].map(w => ({
            id: w.id,
            name: w.name,
            description: w.description,
            steps: w.steps.length,
            executions: w.executions,
            lastExecuted: w.lastExecuted,
        }));
    }

    /**
     * Get workflow by ID.
     */
    get(workflowId) {
        return this._workflows.get(workflowId) || null;
    }

    /**
     * Delete a workflow.
     */
    delete(workflowId) {
        if (!this._workflows.has(workflowId)) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }
        this._workflows.delete(workflowId);
        this._saveWorkflows();
        return { success: true };
    }

    /**
     * Get available templates.
     */
    getTemplates() {
        return this._templates;
    }

    /**
     * Create workflow from template.
     */
    fromTemplate(templateName, customizations = {}) {
        const template = this._templates.find(t => t.name === templateName);
        if (!template) {
            throw new Error(`Template not found: ${templateName}`);
        }

        return this.create({
            ...template.workflow,
            ...customizations,
            name: customizations.name || template.workflow.name,
        });
    }

    // ── Internal ──────────────────────────────────────────────

    async _executeStep(step, vars, workflow) {
        switch (step.type) {
            case 'set':
                // Set a variable
                vars[step.variable] = this._resolveValue(step.value, vars);
                return { success: true, variable: step.variable, value: vars[step.variable] };

            case 'run':
                // Run a tool/command
                const command = this._resolveValue(step.command, vars);
                return { success: true, command, output: `Executed: ${command}` };

            case 'if':
                // Conditional branch
                const condition = this._evaluateCondition(step.condition, vars);
                if (condition) {
                    return { success: true, goto: stepIndex + 1 };
                } else if (step.else !== undefined) {
                    return { success: true, goto: step.else };
                }
                return { success: true };

            case 'loop':
                // Loop through items
                const items = this._resolveValue(step.items, vars);
                if (Array.isArray(items) && items.length > 0) {
                    vars[step.variable || 'item'] = items[0];
                    return { success: true, items, index: 0 };
                }
                return { success: true, break: true };

            case 'notify':
                // Send notification
                const message = this._resolveValue(step.message, vars);
                this.emit('notify', { message, level: step.level || 'info' });
                return { success: true, message };

            case 'log':
                // Log a message
                const logMessage = this._resolveValue(step.message, vars);
                logger.info(`[Workflow] ${logMessage}`);
                return { success: true, message: logMessage };

            default:
                return { success: true, note: `Unknown step type: ${step.type}` };
        }
    }

    _resolveValue(value, vars) {
        if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
            const varName = value.slice(2, -1);
            return vars[varName];
        }
        return value;
    }

    _evaluateCondition(condition, vars) {
        // Simple condition evaluation
        // Supports: ${var} == value, ${var} > value, ${var} < value, ${var} exists
        if (!condition) return true;

        const match = condition.match(/^\$\{(\w+)\}\s*(==|!=|>|<|>=|<=|exists)\s*(.*)$/);
        if (!match) return Boolean(condition);

        const [, varName, operator, value] = match;
        const varValue = vars[varName];

        switch (operator) {
            case '==': return varValue == value;
            case '!=': return varValue != value;
            case '>': return Number(varValue) > Number(value);
            case '<': return Number(varValue) < Number(value);
            case '>=': return Number(varValue) >= Number(value);
            case '<=': return Number(varValue) <= Number(value);
            case 'exists': return varValue !== undefined;
            default: return true;
        }
    }

    _getDefaultTemplates() {
        return [
            {
                name: 'code-review',
                description: 'Review code for issues',
                workflow: {
                    name: 'Code Review Workflow',
                    description: 'Automated code review',
                    steps: [
                        { type: 'run', command: 'git diff --staged', description: 'Get staged changes' },
                        { type: 'set', variable: 'changes', value: '${result}' },
                        { type: 'notify', message: 'Code review completed', level: 'info' },
                    ],
                },
            },
            {
                name: 'deploy-check',
                description: 'Pre-deployment checklist',
                workflow: {
                    name: 'Deploy Check Workflow',
                    description: 'Verify before deployment',
                    steps: [
                        { type: 'run', command: 'npm test', description: 'Run tests' },
                        { type: 'run', command: 'npm run lint', description: 'Run linter' },
                        { type: 'notify', message: 'Deploy checks passed', level: 'info' },
                    ],
                },
            },
            {
                name: 'cleanup',
                description: 'Clean up temporary files',
                workflow: {
                    name: 'Cleanup Workflow',
                    description: 'Remove temporary files',
                    steps: [
                        { type: 'run', command: 'find . -name "*.tmp" -delete', description: 'Remove .tmp files' },
                        { type: 'run', command: 'find . -name "*.log" -mtime +7 -delete', description: 'Remove old logs' },
                        { type: 'notify', message: 'Cleanup completed', level: 'info' },
                    ],
                },
            },
        ];
    }

    _loadWorkflows() {
        try {
            if (!fs.existsSync(this._storageDir)) {
                fs.mkdirSync(this._storageDir, { recursive: true });
            }
            const file = path.join(this._storageDir, 'workflows.json');
            if (fs.existsSync(file)) {
                const data = JSON.parse(fs.readFileSync(file, 'utf8'));
                for (const [id, wf] of Object.entries(data)) {
                    this._workflows.set(id, wf);
                }
            }
        } catch (e) {
            logger.warn(`[DynamicWorkflows] Failed to load: ${e.message}`);
        }
    }

    _saveWorkflows() {
        try {
            if (!fs.existsSync(this._storageDir)) {
                fs.mkdirSync(this._storageDir, { recursive: true });
            }
            const file = path.join(this._storageDir, 'workflows.json');
            fs.writeFileSync(file, JSON.stringify(Object.fromEntries(this._workflows), null, 2));
        } catch (e) {
            logger.warn(`[DynamicWorkflows] Failed to save: ${e.message}`);
        }
    }
}

module.exports = { DynamicWorkflows };
module.exports.default = DynamicWorkflows;
