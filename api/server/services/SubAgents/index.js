/**
 * SubAgents — Registry of specialized sub-agent strategies.
 *
 * Each strategy defines:
 *   - name, role, systemPrompt
 *   - allowed tools
 *   - temperature
 *   - prompt builder + output parser
 *
 * The AgentRuntime can spawn these sub-agents to delegate specialized work.
 */

const CodeReviewerStrategy = require('./CodeReviewerStrategy');
const DebuggerStrategy = require('./DebuggerStrategy');
const TestWriterStrategy = require('./TestWriterStrategy');
const SecurityAuditorStrategy = require('./SecurityAuditorStrategy');

const STRATEGIES = {
  code_reviewer: CodeReviewerStrategy,
  debugger: DebuggerStrategy,
  test_writer: TestWriterStrategy,
  security_auditor: SecurityAuditorStrategy,
};

/**
 * Get a strategy by name.
 * @param {string} name
 * @returns {object|null}
 */
function getStrategy(name) {
  return STRATEGIES[name] || null;
}

/**
 * List all available strategies.
 * @returns {string[]}
 */
function listStrategies() {
  return Object.keys(STRATEGIES);
}

module.exports = {
  STRATEGIES,
  getStrategy,
  listStrategies,
  CodeReviewerStrategy,
  DebuggerStrategy,
  TestWriterStrategy,
  SecurityAuditorStrategy,
};
