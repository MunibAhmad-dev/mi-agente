#!/usr/bin/env node
/**
 * HeadlessSDK — runs the harness headless (no UI), for CI/CD integration.
 * Like Codex headless mode and Claude Code --print.
 *
 * Usage:
 *   node headless.js "Fix the bug in auth.js"
 *   node headless.js --task "..." --model claude-opus-4-7 --max-turns 20
 *   echo "task" | node headless.js
 */

const HarnessEngine = require('./HarnessEngine');

function parseArgs(argv) {
  const args = { task: null, model: null, maxTurns: 20, resume: null, json: false };
  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--model') args.model = argv[++i];
    else if (arg === '--max-turns') args.maxTurns = parseInt(argv[++i], 10);
    else if (arg === '--resume') args.resume = argv[++i];
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: headless.js [task] [--model M] [--max-turns N] [--resume ID] [--json]');
      process.exit(0);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 0) args.task = positional.join(' ');
  return args;
}

async function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data.trim()));
  });
}

/**
 * Run a task headless through the harness.
 * @param {string} task
 * @param {object} opts
 * @returns {Promise<object>}
 */
async function run(task, opts = {}) {
  if (!HarnessEngine.enabled()) {
    return {
      success: false,
      error: 'HARNESS_ENGINE_ENABLED is not true. Set it to run headless.',
    };
  }

  const session = opts.resume
    ? await HarnessEngine.resume(opts.resume)
    : HarnessEngine.createSession({ agentId: 'headless', model: opts.model });

  if (!session) {
    return { success: false, error: 'Failed to create or resume session' };
  }

  // Scaffold
  const scaffold = await HarnessEngine.scaffold(session, { userTask: task });

  // Simulate the agentic loop (simplified — real loop would call LLM + tools)
  let turns = 0;
  const maxTurns = opts.maxTurns || 20;
  let stopped = false;
  let stopReason = null;

  while (turns < maxTurns && !stopped) {
    turns += 1;
    await HarnessEngine.preLLMCall(session, { role: 'user', content: task });
    const stop = HarnessEngine.shouldStop(session);
    if (stop.stop) {
      stopped = true;
      stopReason = stop.reason;
      break;
    }
  }

  await HarnessEngine.checkpoint(session);

  return {
    success: true,
    sessionId: session.id,
    turns,
    stopped,
    stopReason,
    systemPromptLength: scaffold.systemPrompt.length,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  let task = args.task;
  if (!task) {
    task = await readStdin();
  }
  if (!task) {
    console.error('Error: no task provided. Pass as argument or via stdin.');
    process.exit(1);
  }

  try {
    const result = await run(task, args);
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.success) {
        console.log(`✓ Task completed in ${result.turns} turns (session: ${result.sessionId})`);
        if (result.stopped) {
          console.log(`  Stopped: ${result.stopReason}`);
        }
      } else {
        console.error(`✗ ${result.error}`);
        process.exit(1);
      }
    }
  } catch (e) {
    console.error(`Fatal: ${e.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { run, parseArgs };
