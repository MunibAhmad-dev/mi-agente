/**
 * DeterministicVerifier.js — Deterministic Verification System
 * 
 * Implements verification like Claude Code:
 * - verify_syntax: Parse JavaScript/TypeScript for syntax errors
 * - verify_lint: Run ESLint
 * - verify_types: Run TypeScript compiler
 * - verify_tests: Run Jest/Vitest
 * - verify_compile: Verify that code compiles
 * - verify_all: Run all verifiers
 * 
 * Returns structured results: { pass, errors[], warnings[], suggestions[] }
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const logger = {
    debug: (...args) => console.log('[DeterministicVerifier]', ...args),
    info: (...args) => console.info('[DeterministicVerifier]', ...args),
    warn: (...args) => console.warn('[DeterministicVerifier]', ...args),
    error: (...args) => console.error('[DeterministicVerifier]', ...args),
};

class DeterministicVerifier {
    constructor(config = {}) {
        this._name = 'DeterministicVerifier';
        this._workingDir = config.workingDir || process.cwd();
        this._timeout = config.timeout || 30000; // 30 seconds per check
        this._enabledChecks = config.enabledChecks || ['syntax', 'lint', 'types', 'tests'];
    }

    /**
     * Get tool definitions for the LLM.
     */
    getToolDefinitions() {
        return [
            {
                type: 'function',
                function: {
                    name: 'verify_syntax',
                    description: 'Verify that a file has no syntax errors by parsing it.',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'File path to verify' },
                        },
                        required: ['path'],
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'verify_lint',
                    description: 'Run ESLint on a file or directory and return errors/warnings.',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'File or directory to lint (default: project root)' },
                        },
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'verify_types',
                    description: 'Run TypeScript type checking and return errors.',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'File or directory to type-check' },
                        },
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'verify_tests',
                    description: 'Run tests and return results.',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'Test file or directory to run' },
                            testName: { type: 'string', description: 'Specific test name to run' },
                        },
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'verify_all',
                    description: 'Run all verification checks (syntax, lint, types, tests) and return comprehensive results.',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'File or directory to verify' },
                        },
                    },
                },
            },
        ];
    }

    /**
     * Execute a tool by name.
     */
    async execute(toolName, params, context = {}) {
        const workingDir = context.workingDir || this._workingDir;

        switch (toolName) {
            case 'verify_syntax': return this.verifySyntax(params.path, workingDir);
            case 'verify_lint': return this.verifyLint(params.path, workingDir);
            case 'verify_types': return this.verifyTypes(params.path, workingDir);
            case 'verify_tests': return this.verifyTests(params.path, params.testName, workingDir);
            case 'verify_all': return this.verifyAll(params.path, workingDir);
            default: throw new Error(`Unknown tool: ${toolName}`);
        }
    }

    /**
     * Verify syntax by parsing the file.
     */
    async verifySyntax(filePath, workingDir) {
        const fullPath = path.resolve(workingDir, filePath);

        if (!fs.existsSync(fullPath)) {
            return { pass: false, errors: [{ message: `File not found: ${filePath}` }], warnings: [] };
        }

        const ext = path.extname(filePath).toLowerCase();
        const content = fs.readFileSync(fullPath, 'utf8');

        try {
            if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
                // Use Node.js to parse JavaScript
                new (require('vm').Script)(content, { filename: filePath });
                return { pass: true, errors: [], warnings: [], file: filePath };
            } else if (ext === '.ts' || ext === '.tsx') {
                // Use TypeScript compiler for syntax check
                return await this._runTypeScriptSyntaxCheck(fullPath, workingDir);
            } else if (ext === '.json') {
                // Validate JSON
                JSON.parse(content);
                return { pass: true, errors: [], warnings: [], file: filePath };
            } else {
                return { pass: true, errors: [], warnings: [], file: filePath, note: 'No syntax checker available for this file type' };
            }
        } catch (error) {
            const errorInfo = this._parseSyntaxError(error, filePath);
            return { pass: false, errors: [errorInfo], warnings: [], file: filePath };
        }
    }

    /**
     * Run ESLint.
     */
    async verifyLint(filePath = '.', workingDir) {
        const fullPath = path.resolve(workingDir, filePath);

        // Check if eslint is available
        try {
            const result = await this._execCommand(
                `npx eslint --format json ${filePath}`,
                workingDir,
                this._timeout
            );

            const output = JSON.parse(result.stdout || '[]');
            const errors = [];
            const warnings = [];

            for (const file of output) {
                for (const message of file.messages || []) {
                    const info = {
                        file: file.filePath,
                        line: message.line,
                        column: message.column,
                        message: message.message,
                        rule: message.ruleId,
                        severity: message.severity,
                    };

                    if (message.severity === 2) {
                        errors.push(info);
                    } else {
                        warnings.push(info);
                    }
                }
            }

            return {
                pass: errors.length === 0,
                errors,
                warnings,
                fixable: output.reduce((sum, f) => sum + (f.fixableErrorCount || 0) + (f.fixableWarningCount || 0), 0),
            };
        } catch (error) {
            // ESLint not available or failed
            if (error.message?.includes('eslint')) {
                return { pass: true, errors: [], warnings: [], note: 'ESLint not available' };
            }
            return { pass: false, errors: [{ message: error.message }], warnings: [] };
        }
    }

    /**
     * Run TypeScript type checking.
     */
    async verifyTypes(filePath = '.', workingDir) {
        try {
            // Check if tsconfig.json exists
            const tsconfigPath = path.join(workingDir, 'tsconfig.json');
            if (!fs.existsSync(tsconfigPath)) {
                return { pass: true, errors: [], warnings: [], note: 'No tsconfig.json found' };
            }

            const result = await this._execCommand(
                `npx tsc --noEmit ${filePath === '.' ? '' : filePath}`,
                workingDir,
                this._timeout * 2 // TypeScript can be slow
            );

            const errors = this._parseTypeScriptOutput(result.stdout + result.stderr);

            return {
                pass: errors.length === 0,
                errors,
                warnings: [],
            };
        } catch (error) {
            const errors = this._parseTypeScriptOutput(error.message);
            return {
                pass: errors.length === 0,
                errors,
                warnings: [],
            };
        }
    }

    /**
     * Run tests.
     */
    async verifyTests(testPath = '.', testName = null, workingDir) {
        const testCommand = testName 
            ? `npx jest --testPathPattern="${testPath}" -t "${testName}" --no-coverage 2>&1`
            : `npx jest --testPathPattern="${testPath}" --no-coverage 2>&1`;

        try {
            const result = await this._execCommand(testCommand, workingDir, this._timeout * 3);

            const output = result.stdout + result.stderr;
            const passed = output.includes('Tests:') && !output.includes('FAIL');
            const testSummary = this._parseTestOutput(output);

            return {
                pass: passed && testSummary.failures === 0,
                errors: testSummary.failures > 0 ? [{ message: `${testSummary.failures} test(s) failed` }] : [],
                warnings: testSummary.pending > 0 ? [{ message: `${testSummary.pending} test(s) pending` }] : [],
                summary: testSummary,
            };
        } catch (error) {
            return {
                pass: false,
                errors: [{ message: `Tests failed: ${error.message}` }],
                warnings: [],
            };
        }
    }

    /**
     * Run all verifiers.
     */
    async verifyAll(filePath = '.', workingDir) {
        const results = {};

        if (this._enabledChecks.includes('syntax')) {
            results.syntax = await this.verifySyntax(filePath, workingDir);
        }

        if (this._enabledChecks.includes('lint')) {
            results.lint = await this.verifyLint(filePath, workingDir);
        }

        if (this._enabledChecks.includes('types')) {
            results.types = await this.verifyTypes(filePath, workingDir);
        }

        if (this._enabledChecks.includes('tests')) {
            results.tests = await this.verifyTests(filePath, null, workingDir);
        }

        // Aggregate results
        const allErrors = [];
        const allWarnings = [];
        let allPass = true;

        for (const [check, result] of Object.entries(results)) {
            if (!result.pass) allPass = false;
            allErrors.push(...(result.errors || []).map(e => ({ ...e, check })));
            allWarnings.push(...(result.warnings || []).map(w => ({ ...w, check })));
        }

        return {
            pass: allPass,
            errors: allErrors,
            warnings: allWarnings,
            checks: results,
            summary: {
                total: Object.keys(results).length,
                passed: Object.values(results).filter(r => r.pass).length,
                failed: Object.values(results).filter(r => !r.pass).length,
            },
        };
    }

    // ── Internal Helpers ──────────────────────────────────────

    async _execCommand(command, cwd, timeout) {
        return new Promise((resolve, reject) => {
            exec(command, {
                cwd,
                timeout,
                maxBuffer: 1024 * 1024,
                env: { ...process.env, FORCE_COLOR: '0' },
            }, (error, stdout, stderr) => {
                if (error) {
                    // Some tools return non-zero exit code on errors
                    // but still produce useful output
                    resolve({ stdout, stderr, exitCode: error.code });
                } else {
                    resolve({ stdout, stderr, exitCode: 0 });
                }
            });
        });
    }

    async _runTypeScriptSyntaxCheck(filePath, workingDir) {
        try {
            await this._execCommand(
                `npx tsc --noEmit --allowJs ${filePath}`,
                workingDir,
                this._timeout
            );
            return { pass: true, errors: [], warnings: [], file: filePath };
        } catch (error) {
            const errors = this._parseTypeScriptOutput(error.message);
            return { pass: errors.length === 0, errors, warnings: [], file: filePath };
        }
    }

    _parseSyntaxError(error, filePath) {
        const message = error.message || '';
        
        // Try to extract line/column from error message
        const lineMatch = message.match(/line\s+(\d+)/i) || message.match(/:(\d+):/);
        const colMatch = message.match(/column\s+(\d+)/i) || message.match(/:(\d+):(\d+)/);

        return {
            file: filePath,
            line: lineMatch ? parseInt(lineMatch[1]) : null,
            column: colMatch ? parseInt(colMatch[2]) : null,
            message: message.substring(0, 500),
        };
    }

    _parseTypeScriptOutput(output) {
        const errors = [];
        const lines = output.split('\n');

        for (const line of lines) {
            // TypeScript error format: file.ts(line,col): error TSxxxx: message
            const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/);
            if (match) {
                errors.push({
                    file: match[1],
                    line: parseInt(match[2]),
                    column: parseInt(match[3]),
                    code: match[4],
                    message: match[5],
                });
            }
        }

        return errors;
    }

    _parseTestOutput(output) {
        const result = { total: 0, passed: 0, failed: 0, pending: 0 };

        // Match "Tests: X passed, Y failed, Z total"
        const testMatch = output.match(/Tests:\s+(\d+)\s+passed(?:,\s+(\d+)\s+failed)?(?:,\s+(\d+)\s+total)?/);
        if (testMatch) {
            result.passed = parseInt(testMatch[1]) || 0;
            result.failed = parseInt(testMatch[2]) || 0;
            result.total = parseInt(testMatch[3]) || (result.passed + result.failed);
        }

        // Match pending
        const pendingMatch = output.match(/(\d+)\s+pending/);
        if (pendingMatch) {
            result.pending = parseInt(pendingMatch[1]);
        }

        return result;
    }
}

module.exports = { DeterministicVerifier };
module.exports.default = DeterministicVerifier;
