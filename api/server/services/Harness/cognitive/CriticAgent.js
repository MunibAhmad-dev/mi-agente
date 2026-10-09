/**
 * CriticAgent.js — LLM-based Critic/Evaluator
 * 
 * Evaluates the agent's work using a separate LLM call:
 * - Detects bugs, errors, improvements
 * - Suggests corrections
 * - Uses different model than the main agent
 */

const logger = {
    debug: (...args) => console.log('[CriticAgent]', ...args),
    info: (...args) => console.info('[CriticAgent]', ...args),
    warn: (...args) => console.warn('[CriticAgent]', ...args),
    error: (...args) => console.error('[CriticAgent]', ...args),
};

class CriticAgent {
    constructor(config = {}) {
        this._name = 'CriticAgent';
        this._llmProvider = config.llmProvider || null;
        this._model = config.model || null; // Use different model for critique
        this._enabled = config.enabled !== false;
    }

    setLLMProvider(provider) { this._llmProvider = provider; }
    setCriticModel(model) { this._model = model; }

    /**
     * Evaluate the agent's work.
     */
    async evaluate(task, result, context = {}) {
        if (!this._enabled || !this._llmProvider) {
            return { evaluated: false, reason: 'CriticAgent disabled or no LLM provider' };
        }

        logger.info(`[CriticAgent] Evaluating result for: "${task.substring(0, 80)}..."`);

        try {
            const prompt = `You are a code reviewer and quality evaluator. Analyze this result:

TASK: ${task}

RESULT:
${typeof result === 'string' ? result : JSON.stringify(result, null, 2).substring(0, 3000)}

Evaluate:
1. Is the task completed correctly?
2. Are there any bugs or errors?
3. Are there improvements needed?
4. Is the code quality acceptable?
5. Are there security concerns?

Provide your evaluation as:
- PASS or FAIL
- Issues found (list)
- Suggestions (list)
- Severity: low/medium/high/critical`;

            const response = await this._llmProvider.chat({
                messages: [{ role: 'user', content: prompt }],
                maxTokens: 1000,
                temperature: 0.2,
            });

            const evaluation = this._parseEvaluation(response.content);

            logger.info(`[CriticAgent] Evaluation: ${evaluation.pass ? 'PASS' : 'FAIL'} (${evaluation.issues.length} issues)`);

            return {
                evaluated: true,
                ...evaluation,
            };

        } catch (error) {
            logger.error(`[CriticAgent] Evaluation failed: ${error.message}`);
            return { evaluated: false, error: error.message };
        }
    }

    /**
     * Quick check if code has obvious issues.
     */
    quickCheck(code) {
        const issues = [];

        // Check for common issues
        if (code.includes('TODO') || code.includes('FIXME')) {
            issues.push({ message: 'Contains TODO/FIXME comments', severity: 'low' });
        }
        if (code.includes('console.log') && !code.includes('logger')) {
            issues.push({ message: 'Contains console.log (should use logger)', severity: 'low' });
        }
        if (code.includes('eval(')) {
            issues.push({ message: 'Contains eval() - security risk', severity: 'high' });
        }
        if (code.includes('password') && code.includes('=')) {
            issues.push({ message: 'Possible hardcoded password', severity: 'critical' });
        }
        if (code.length > 500 && !code.includes('function') && !code.includes('class')) {
            issues.push({ message: 'Large code block without functions/classes', severity: 'medium' });
        }

        return {
            pass: issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0,
            issues,
        };
    }

    _parseEvaluation(content) {
        const pass = content.toUpperCase().includes('PASS') && !content.toUpperCase().includes('FAIL');

        const issues = [];
        const suggestions = [];

        const lines = content.split('\n');
        let section = '';

        for (const line of lines) {
            if (line.toLowerCase().includes('issue')) section = 'issues';
            else if (line.toLowerCase().includes('suggest')) section = 'suggestions';
            else if (line.startsWith('-') || line.startsWith('*') || line.startsWith(`${1}.`)) {
                const item = line.replace(/^[-*\d.]+\s*/, '').trim();
                if (section === 'issues' && item) issues.push({ message: item });
                else if (section === 'suggestions' && item) suggestions.push({ message: item });
            }
        }

        return { pass, issues, suggestions, raw: content };
    }
}

module.exports = { CriticAgent };
module.exports.default = CriticAgent;
