const { logger } = require('@librechat/data-schemas');
const { createMessage } = require('./anthropicClient');

const DEFAULT_MAX_TURNS = 6;

/**
 * Generic agentic tool-calling loop, in the spirit of how Grok/GPT/Claude
 * "function calling" works: the model is given a list of tool definitions and
 * autonomously decides *if*, *when*, and *how many times* to call them before
 * producing a final answer. This file has no knowledge of what the tools do —
 * callers pass in `tools` (Anthropic-format JSON Schema definitions) and an
 * `executeTool(name, input)` function; this loop only handles the
 * request/response wiring and turn-limiting.
 *
 * This is deliberately generic so it isn't tied to the Agent Architect: any
 * future feature that wants "the model decides which tool to call" (e.g. a
 * live tool-calling agent in chat, not just planning) can reuse this file
 * as-is.
 *
 * @param {object} params
 * @param {string} params.system - system prompt
 * @param {Array<{role: string, content: any}>} params.messages - initial conversation
 * @param {Array<object>} params.tools - Anthropic tool definitions
 * @param {(name: string, input: object) => Promise<any>} params.executeTool -
 *   called with the tool name + parsed input; return value is JSON-stringified
 *   and sent back to the model as the tool_result.
 * @param {string} [params.model]
 * @param {number} [params.maxTurns] - hard cap on model<->tool round-trips
 * @param {(name: string, input: object) => boolean} [params.isTerminal] -
 *   if a called tool should end the loop immediately (e.g. a `submit_plan`
 *   tool), return true; the loop returns that tool call instead of continuing.
 * @returns {Promise<{
 *   finalText: string | null,
 *   terminalToolCall: { name: string, input: object } | null,
 *   turns: number,
 *   transcript: Array<object>,
 * }>}
 */
async function runToolCallLoop({
  system,
  messages,
  tools,
  executeTool,
  model,
  maxTurns = DEFAULT_MAX_TURNS,
  isTerminal,
}) {
  const conversation = [...messages];
  let turns = 0;

  while (turns < maxTurns) {
    turns += 1;

    const response = await createMessage({
      system,
      messages: conversation,
      tools,
      model,
    });

    conversation.push({ role: 'assistant', content: response.content });

    const toolUseBlocks = (response.content || []).filter((block) => block.type === 'tool_use');

    if (toolUseBlocks.length === 0) {
      const textBlock = (response.content || []).find((block) => block.type === 'text');
      return {
        finalText: textBlock?.text ?? null,
        terminalToolCall: null,
        turns,
        transcript: conversation,
      };
    }

    // Check for a terminal tool call (e.g. submit_plan) before executing the
    // rest — we still need to answer any *other* tool_use blocks in the same
    // turn with a tool_result, otherwise the API rejects the next message.
    let terminal = null;
    const toolResults = [];

    for (const block of toolUseBlocks) {
      if (isTerminal?.(block.name, block.input)) {
        terminal = { name: block.name, input: block.input };
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: 'Plan received.',
        });
        continue;
      }

      try {
        const result = await executeTool(block.name, block.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: typeof result === 'string' ? result : JSON.stringify(result ?? null),
        });
      } catch (err) {
        logger.warn(`[toolCallLoop] Tool "${block.name}" failed: ${err.message}`);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Error executing tool: ${err.message}`,
          is_error: true,
        });
      }
    }

    if (terminal) {
      return { finalText: null, terminalToolCall: terminal, turns, transcript: conversation };
    }

    conversation.push({ role: 'user', content: toolResults });
  }

  logger.warn(`[toolCallLoop] Reached maxTurns (${maxTurns}) without a final answer.`);
  return { finalText: null, terminalToolCall: null, turns, transcript: conversation };
}

module.exports = { runToolCallLoop, DEFAULT_MAX_TURNS };
