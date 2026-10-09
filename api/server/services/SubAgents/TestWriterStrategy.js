/**
 * TestWriterStrategy — Specialized sub-agent for generating tests.
 *
 * Analyzes source code and generates comprehensive test suites:
 *   - Unit tests for functions/methods
 *   - Edge case coverage
 *   - Integration tests for APIs
 *   - Test scaffolding (describe/it blocks)
 */

const STRATEGY = {
  name: 'test_writer',
  role: 'You are a test engineering specialist. Generate comprehensive, well-structured test suites that cover happy paths, edge cases, and error scenarios.',
  tools: ['read_file', 'grep_search', 'glob_search', 'apply_patch'],
  temperature: 0.3,
  systemPrompt:
    'You are an expert test writer. For each function/module:\n' +
    '1. Identify all public functions and their parameters\n' +
    '2. Write tests for happy path (normal usage)\n' +
    '3. Write tests for edge cases (empty, null, boundary values)\n' +
    '4. Write tests for error scenarios (invalid input, failures)\n' +
    "5. Use the project's existing test framework and style\n" +
    '6. Include descriptive test names and clear assertions',
};

/**
 * Build a test generation prompt.
 * @param {string} code
 * @param {object} [context]
 * @param {string} [context.framework] - test framework (jest, mocha, etc.)
 * @param {string} [context.existingTests]
 * @returns {string}
 */
function buildTestPrompt(code, context = {}) {
  const framework = context.framework || 'jest';
  let prompt = `${STRATEGY.systemPrompt}\n\nTest framework: ${framework}\n\nSource code:\n\`\`\`\n${code}\n\`\`\``;
  if (context.existingTests) {
    prompt += `\n\nExisting tests (match this style):\n\`\`\`\n${context.existingTests}\n\`\`\``;
  }
  prompt += `\n\nGenerate a comprehensive test suite for the above code.`;
  return prompt;
}

/**
 * Extract function signatures from code for test planning.
 * @param {string} code
 * @returns {Array<{name: string, params: Array, isAsync: boolean, isExported: boolean}>}
 */
function extractFunctions(code) {
  const functions = [];
  const patterns = [
    /export\s+(async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g,
    /export\s+const\s+(\w+)\s*=\s*(async\s+)?\(([^)]*)\)\s*=>/g,
    /(?:function|const)\s+(\w+)\s*=?\s*(?:\(|async\s*\()([^)]*)\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      functions.push({
        name: match[2] || match[1],
        params: (match[3] || match[2] || '')
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean),
        isAsync: /async/.test(match[1] || match[0]),
        isExported: /export/.test(match[0]),
      });
    }
  }
  return functions.filter((f, i, arr) => arr.findIndex((g) => g.name === f.name) === i);
}

module.exports = {
  STRATEGY,
  buildTestPrompt,
  extractFunctions,
};
