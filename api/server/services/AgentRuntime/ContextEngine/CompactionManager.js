/**
 * CompactionManager — context compaction to keep the conversation bounded as
 * the agent processes more tasks (Claude Code / Codex / LangChain pattern).
 *
 * Multi-layer cascade (best practice per JetBrains + Arize research):
 *   1. Compress tool outputs first (offload large results to disk, keep
 *      a 2KB preview — Claude Code pre-query optimization).
 *   2. Trim older messages with a sliding window (keep ~20K newest tokens).
 *   3. LLM summarization only as a last resort (lossy, so use sparingly).
 *
 * The agent's behaviour degrades well before the context window is full
 * ("context rot", Chroma Research), so we trigger at 75% capacity.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const TRIGGER_RATIO = 0.75;
const PREVIEW_BYTES = 2048;
const KEEP_NEWEST_MESSAGES = 20;

/**
 * Estimate token count from character count (conservative 4:1 ratio).
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

/**
 * Estimate the total tokens in a conversation state.
 * @param {object} state
 * @returns {number}
 */
function estimateStateTokens(state) {
  if (!state || !state.events) {
    return 0;
  }
  return state.events.reduce((sum, e) => sum + estimateTokens(e.content || ''), 0);
}

/**
 * Compress tool outputs: offload large results to scratch files, keep a
 * preview in-context (Claude Code pattern).
 * @param {object} state
 * @param {string} scratchDir
 * @returns {number} bytes saved
 */
function compressToolOutputs(state, scratchDir) {
  if (!state || !state.events) {
    return 0;
  }
  const dir = scratchDir || path.join(os.tmpdir(), 'harness-scratch');
  let saved = 0;
  for (const event of state.events) {
    if (event.type !== 'tool_result') {
      continue;
    }
    const content = event.content || '';
    if (content.length <= PREVIEW_BYTES * 2) {
      continue;
    }
    try {
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${event.id || 'toolout'}.txt`);
      fs.writeFileSync(file, content);
      event.content = content.slice(0, PREVIEW_BYTES) + `\n...[full output saved to ${file}]`;
      event.compressed = true;
      event.fullOutputPath = file;
      saved += content.length - PREVIEW_BYTES;
    } catch {
      // skip if filesystem unavailable
    }
  }
  return saved;
}

/**
 * Apply a sliding window: keep only the N newest messages (Pi agent pattern).
 * @param {object} state
 * @param {number} keepCount
 */
function slidingWindow(state, keepCount) {
  if (!state || !state.events) {
    return;
  }
  const keep = keepCount || KEEP_NEWEST_MESSAGES;
  if (state.events.length <= keep) {
    return;
  }
  const dropped = state.events.slice(0, state.events.length - keep);
  state.droppedCount = (state.droppedCount || 0) + dropped.length;
  state.events = state.events.slice(-keep);
}

/**
 * Build a summary prompt for LLM-based compaction (last resort).
 * @param {object} state
 * @returns {string}
 */
function buildSummaryPrompt(state) {
  const events = (state && state.events) || [];
  const transcript = events.map((e) => `[${e.type}] ${e.content || ''}`).join('\n');
  return `Summarize the following agent conversation, preserving:
- The original task and current progress
- Any files created or modified
- Any errors encountered and their resolution
- Decisions made and their rationale
- What remains to be done

Transcript:
${transcript}

Summary:`;
}

/**
 * Decide whether compaction should run and which layers to apply.
 * @param {object} session
 * @param {object} opts { maxTokens, llmSummarize }
 * @returns {Promise<boolean>} true if any compaction was applied
 */
async function maybeCompact(session, opts = {}) {
  if (!session || !session.state) {
    return false;
  }
  const maxTokens = opts.maxTokens || 100000;
  const used = estimateStateTokens(session.state);
  if (used < maxTokens * TRIGGER_RATIO) {
    return false;
  }
  let applied = false;
  const savedBytes = compressToolOutputs(session.state, opts.scratchDir);
  if (savedBytes > 0) {
    applied = true;
  }
  const afterLayer1 = estimateStateTokens(session.state);
  if (afterLayer1 >= maxTokens * TRIGGER_RATIO) {
    slidingWindow(session.state, opts.keepNewest);
    applied = true;
  }
  const afterLayer2 = estimateStateTokens(session.state);
  if (afterLayer2 >= maxTokens * TRIGGER_RATIO && opts.llmSummarize) {
    const prompt = buildSummaryPrompt(session.state);
    try {
      const summary = await opts.llmSummarize(prompt);
      if (summary) {
        session.state.events = [{ type: 'compaction', content: summary }];
        session.flags.compacted = true;
        applied = true;
      }
    } catch {
      // LLM summarization failed; keep sliding-window result
    }
  }
  return applied;
}

module.exports = {
  TRIGGER_RATIO,
  PREVIEW_BYTES,
  estimateTokens,
  estimateStateTokens,
  compressToolOutputs,
  slidingWindow,
  buildSummaryPrompt,
  maybeCompact,
};
