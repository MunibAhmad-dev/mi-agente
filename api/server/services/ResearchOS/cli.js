'use strict';

/**
 * CLI: node src/cli.js "¿Quién es Twilight Sparkle?" [--mode FORENSIC] [--offline docs.json]
 * Prints the final answer with confidence metrics and provenance.
 */

const question = process.argv[2];
if (!question) {
  console.log('usage: node src/cli.js "<question>" [--mode MODE] [--skip-clarification]');
  process.exit(1);
}
const modeIdx = process.argv.indexOf('--mode');
const mode = modeIdx > -1 ? process.argv[modeIdx + 1] : undefined;

const Orchestrator = require('./orchestrator/ResearchOrchestrator');

(async () => {
  try {
    const out = await Orchestrator.research(question, { mode, skipClarification: true });
    console.log('\n=== RESEARCH ANSWER ===');
    console.log(JSON.stringify(out.answer, null, 2));
    console.log('\n=== DEPENDENCY SUMMARY ===');
    console.log(JSON.stringify(out.dependency_summary, null, 2));
    console.log('\n=== STOP DECISION ===');
    console.log(JSON.stringify(out.stop, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('[ResearchOS:cli] failed:', err.message, err.resume_from ? `(resume from ${err.resume_from})` : '');
    process.exit(1);
  }
})();
