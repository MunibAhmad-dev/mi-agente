'use strict';

/**
 * DynamicPromptEngine.js — Gen B Batch-C Phase 2.
 * Builds prompts dynamically from templates + runtime context.
 */

class DynamicPromptEngine {
  constructor() {
    this._templates = new Map();
    this.stats = { registered: 0, renders: 0, inlineRenders: 0 };
    this._registerBuiltins();
  }

  /**
   * Register a template with {{var}} placeholders.
   * @param {string} id
   * @param {string} template
   * @param {string[]} vars  - declared variable names (for documentation)
   */
  registerTemplate(id, template, vars = []) {
    try {
      if (!id || typeof template !== 'string') return { error: 'id and template are required' };
      this._templates.set(id, { id, template, vars });
      this.stats.registered++;
      return { id, vars };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Render a registered template with context.
   * @param {string} templateId
   * @param {object} context
   * @returns {string}
   */
  render(templateId, context = {}) {
    try {
      const tpl = this._templates.get(templateId);
      if (!tpl) return `[Error: template '${templateId}' not found]`;
      this.stats.renders++;
      return this._process(tpl.template, context);
    } catch (err) {
      return `[Error: ${err.message}]`;
    }
  }

  /**
   * Render a template string inline without registering.
   * @param {string} template
   * @param {object} context
   * @returns {string}
   */
  renderInline(template, context = {}) {
    try {
      if (typeof template !== 'string') return '[Error: template must be a string]';
      this.stats.inlineRenders++;
      return this._process(template, context);
    } catch (err) {
      return `[Error: ${err.message}]`;
    }
  }

  /**
   * Return all built-in template definitions.
   * @returns {object[]}
   */
  getBuiltinTemplates() {
    try {
      const builtins = [
        'code_review', 'explain_concept', 'debug_error',
        'research_summary', 'task_decomposition', 'critique',
      ];
      return builtins
        .filter((id) => this._templates.has(id))
        .map((id) => {
          const t = this._templates.get(id);
          return { id: t.id, vars: t.vars, template: t.template };
        });
    } catch (err) {
      return [];
    }
  }

  // ── private ──────────────────────────────────────────────────────────────────

  _process(template, context) {
    // Handle {{#if varName}}...{{/if}} blocks first
    let result = template.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, varName, inner) => {
      return context[varName] ? inner : '';
    });

    // Replace {{var}} placeholders
    result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return context[key] !== undefined ? String(context[key]) : `{{${key}}}`;
    });

    return result.trim();
  }

  _registerBuiltins() {
    const builtins = [
      {
        id: 'code_review',
        vars: ['language', 'code', 'focus'],
        template: `Review the following {{language}} code.
{{#if focus}}Focus especially on: {{focus}}{{/if}}

Code:
\`\`\`{{language}}
{{code}}
\`\`\`

Provide: (1) a brief summary, (2) identified issues, (3) improvement suggestions.`,
      },
      {
        id: 'explain_concept',
        vars: ['concept', 'audience', 'depth'],
        template: `Explain the concept of "{{concept}}" clearly.
{{#if audience}}Target audience: {{audience}}{{/if}}
{{#if depth}}Depth level: {{depth}}{{/if}}

Include: definition, key points, a practical example.`,
      },
      {
        id: 'debug_error',
        vars: ['error', 'context', 'language'],
        template: `Debug the following error.
{{#if language}}Language: {{language}}{{/if}}

Error:
{{error}}
{{#if context}}
Context:
{{context}}
{{/if}}

Identify the root cause and provide a fix.`,
      },
      {
        id: 'research_summary',
        vars: ['topic', 'sources', 'format'],
        template: `Summarize research on: {{topic}}
{{#if sources}}
Sources:
{{sources}}
{{/if}}
{{#if format}}Output format: {{format}}{{/if}}

Provide: key findings, evidence, conclusion, gaps.`,
      },
      {
        id: 'task_decomposition',
        vars: ['task', 'constraints', 'output_format'],
        template: `Decompose the following task into actionable sub-tasks.

Task: {{task}}
{{#if constraints}}Constraints: {{constraints}}{{/if}}
{{#if output_format}}Output format: {{output_format}}{{/if}}

List each sub-task with its purpose and dependencies.`,
      },
      {
        id: 'critique',
        vars: ['content', 'criteria', 'tone'],
        template: `Provide a critique of the following content.
{{#if criteria}}Evaluation criteria: {{criteria}}{{/if}}
{{#if tone}}Tone: {{tone}}{{/if}}

Content:
{{content}}

Assess strengths, weaknesses, and specific improvement actions.`,
      },
    ];

    for (const { id, vars, template } of builtins) {
      this._templates.set(id, { id, template, vars });
    }
  }

  getStats() {
    return { ...this.stats, templateCount: this._templates.size };
  }
}

let _instance = null;
function getDynamicPromptEngine() {
  if (!_instance) _instance = new DynamicPromptEngine();
  return _instance;
}

module.exports = { DynamicPromptEngine, getDynamicPromptEngine };
