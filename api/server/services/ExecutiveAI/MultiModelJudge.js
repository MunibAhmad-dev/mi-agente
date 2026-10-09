'use strict';

/**
 * MultiModelJudge — Face 8.
 * Uses multiple LLMs to evaluate a response, then aggregates their verdicts.
 * Supports OpenAI, Anthropic, and Ollama as judge backends.
 */

const axios = require('axios');

async function judgeWithOpenAI(prompt, response, criteria) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  const judgePrompt = buildJudgePrompt(prompt, response, criteria);
  const resp = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: process.env.JUDGE_OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: judgePrompt }],
      max_tokens: 400,
    },
    { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 30000 },
  );
  return parseJudgeResponse(resp.data.choices[0].message.content, 'openai');
}

async function judgeWithAnthropic(prompt, response, criteria) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const judgePrompt = buildJudgePrompt(prompt, response, criteria);
  const resp = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: process.env.JUDGE_ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: judgePrompt }],
    },
    { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, timeout: 30000 },
  );
  return parseJudgeResponse(resp.data.content[0].text, 'anthropic');
}

async function judgeWithOllama(prompt, response, criteria) {
  const ollamaUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const model = process.env.OLLAMA_JUDGE_MODEL || process.env.OLLAMA_MODEL || 'llama3.2';
  const judgePrompt = buildJudgePrompt(prompt, response, criteria);
  const resp = await axios.post(
    `${ollamaUrl}/api/generate`,
    { model, prompt: judgePrompt, stream: false },
    { timeout: 60000 },
  );
  return parseJudgeResponse(resp.data.response, 'ollama');
}

function buildJudgePrompt(prompt, response, criteria) {
  const criteriaStr = (criteria || ['accuracy', 'completeness', 'clarity', 'relevance']).join(', ');
  return `You are an impartial judge evaluating an AI response.

ORIGINAL QUESTION: ${prompt}

AI RESPONSE: ${response}

Evaluate the response on these criteria: ${criteriaStr}

Respond ONLY in this JSON format:
{"score": <0-10>, "verdict": "excellent|good|adequate|poor|fail", "strengths": ["..."], "weaknesses": ["..."], "reasoning": "..."}`;
}

function parseJudgeResponse(text, provider) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { ...parsed, provider, raw: text };
    }
  } catch {}
  return { score: 5, verdict: 'adequate', strengths: [], weaknesses: [], reasoning: text, provider, raw: text };
}

/**
 * Judge a response using multiple models in parallel.
 * @param {object} opts
 * @param {string} opts.prompt - Original question
 * @param {string} opts.response - Response to evaluate
 * @param {string[]} [opts.criteria] - Evaluation criteria
 * @param {string[]} [opts.judges] - Which judges to use: 'openai', 'anthropic', 'ollama'
 * @returns {Promise<{verdicts, aggregate}>}
 */
async function judge({ prompt, response, criteria, judges }) {
  const judgeList = judges || ['openai', 'anthropic', 'ollama'].filter((j) => {
    if (j === 'openai') return !!process.env.OPENAI_API_KEY;
    if (j === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
    if (j === 'ollama') return true;
    return false;
  });

  if (!judgeList.length) {
    return { verdicts: [], aggregate: { score: 0, verdict: 'no_judges', consensus: false } };
  }

  const judgeMap = { openai: judgeWithOpenAI, anthropic: judgeWithAnthropic, ollama: judgeWithOllama };
  const settled = await Promise.allSettled(
    judgeList.map((j) => (judgeMap[j] || judgeWithOllama)(prompt, response, criteria)),
  );

  const verdicts = settled
    .map((r, i) => r.status === 'fulfilled' ? r.value : { provider: judgeList[i], error: r.reason?.message, score: null })
    .filter((v) => v.score !== null && v.score !== undefined);

  const scores = verdicts.filter((v) => typeof v.score === 'number').map((v) => v.score);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const allVerdicts = verdicts.map((v) => v.verdict).filter(Boolean);
  const consensusVerdict = allVerdicts.length ? mostCommon(allVerdicts) : 'unknown';
  const consensus = allVerdicts.length > 1 && allVerdicts.every((v) => v === allVerdicts[0]);

  return {
    verdicts,
    aggregate: {
      score: Math.round(avgScore * 10) / 10,
      verdict: consensusVerdict,
      consensus,
      judge_count: verdicts.length,
    },
  };
}

function mostCommon(arr) {
  const freq = {};
  arr.forEach((v) => (freq[v] = (freq[v] || 0) + 1));
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
}

module.exports = { judge, buildJudgePrompt };
