'use strict';

/**
 * ReputationMonitorService — Face 19-20: Digital Reputation Monitoring.
 *
 * Periodically scans the web for mentions of a target (person/brand/company)
 * using the Search engine (DDG → Bing → Brave chain) and stores scan results.
 *
 * Architecture:
 *   Scheduler → runScan(targetId) → SearchRuntime → analyze → ReputationScan
 */

const { ReputationTarget, ReputationScan } = require('~/models/ReputationMonitor');
const { AlertSystem } = require('~/server/services/DigitalReputation');

const logger = {
  info: (...a) => console.log('[ReputationMonitor]', ...a),
  warn: (...a) => console.warn('[ReputationMonitor]', ...a),
  error: (...a) => console.error('[ReputationMonitor]', ...a),
};

/**
 * Simple sentiment classifier based on keyword lists.
 * Returns { positive, negative, neutral, overall }.
 */
function classifySentiment(texts = []) {
  const POS_WORDS = ['great', 'excellent', 'award', 'success', 'best', 'top', 'praised',
    'recommended', 'leading', 'innovative', 'trusted', 'love', 'good', 'perfect'];
  const NEG_WORDS = ['fraud', 'scam', 'lawsuit', 'scandal', 'controversy', 'fired',
    'accused', 'failure', 'bad', 'worst', 'hate', 'complaint', 'fined', 'bankrupt'];

  let pos = 0, neg = 0, neu = 0;
  for (const text of texts) {
    const lower = text.toLowerCase();
    const hasPos = POS_WORDS.some((w) => lower.includes(w));
    const hasNeg = NEG_WORDS.some((w) => lower.includes(w));
    if (hasPos && !hasNeg) pos++;
    else if (hasNeg && !hasPos) neg++;
    else neu++;
  }
  const total = pos + neg + neu || 1;
  let overall = 'neutral';
  if (pos / total > 0.5) overall = 'positive';
  else if (neg / total > 0.3) overall = 'negative';
  else if (pos > 0 && neg > 0) overall = 'mixed';
  return { positive: pos, negative: neg, neutral: neu, overall };
}

/**
 * Run a single scan for a target.
 * @param {string|object} targetOrId — ReputationTarget doc or its _id
 * @returns {Promise<ReputationScan>}
 */
async function runScan(targetOrId) {
  const target = typeof targetOrId === 'object'
    ? targetOrId
    : await ReputationTarget.findById(targetOrId);

  if (!target) throw new Error('Reputation target not found');

  const keywords = [target.name, ...(target.keywords || [])];
  const query = keywords.join(' ');

  logger.info(`Scanning "${target.name}" — query: "${query}"`);

  let searchResults = [];
  let scanError = null;

  try {
    const { SearchRuntime } = require('~/server/services/SearchRuntime/SearchRuntime');
    const rt = new SearchRuntime();
    const { results } = await rt.execute({
      type: 'search',
      query,
      parameters: { maxResults: 20 },
    });
    searchResults = results || [];
  } catch (e) {
    scanError = e.message;
    logger.error(`Search failed for "${target.name}":`, e.message);
  }

  const snippets = searchResults.map((r) => r.snippet || r.title || '');
  const sentiment = classifySentiment(snippets);

  // Detect alerts (negative keywords in top results)
  const ALERT_TERMS = ['lawsuit', 'fraud', 'scam', 'scandal', 'bankrupt', 'arrested', 'fined'];
  const alerts = [];
  for (const r of searchResults) {
    const text = `${r.title} ${r.snippet}`.toLowerCase();
    for (const term of ALERT_TERMS) {
      if (text.includes(term)) {
        alerts.push(`"${term}" found in: ${r.url || r.title}`);
        break;
      }
    }
  }

  const summary = searchResults.length > 0
    ? `Found ${searchResults.length} mentions. Sentiment: ${sentiment.overall}. ${alerts.length > 0 ? `${alerts.length} alert(s).` : 'No alerts.'}`
    : `No results found for "${target.name}".`;

  // Fire AlertSystem rules against this scan event
  try {
    const alertSys = new AlertSystem();
    await alertSys.process({
      type: 'reputation_scan',
      entity: target.name,
      sentiment: sentiment.overall,
      alert_count: alerts.length,
      mentions: searchResults.length,
      alerts,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    logger.warn('AlertSystem.process failed (non-fatal):', e.message);
  }

  const scan = await ReputationScan.create({
    targetId: target._id,
    targetName: target.name,
    query,
    sources: target.sources,
    results: searchResults.slice(0, 50),
    mentions: searchResults.length,
    sentiment,
    alerts,
    summary,
    error: scanError,
  });

  // Update target's lastScannedAt
  await ReputationTarget.findByIdAndUpdate(target._id, { lastScannedAt: new Date() });

  return scan;
}

/**
 * Scan all active targets that are due for a scan.
 */
async function scanDueTargets() {
  const now = new Date();
  const targets = await ReputationTarget.find({ isActive: true });
  const due = targets.filter((t) => {
    if (!t.lastScannedAt) return true;
    const nextScan = new Date(t.lastScannedAt.getTime() + t.scanIntervalHours * 3600 * 1000);
    return now >= nextScan;
  });

  logger.info(`Scheduled scan: ${due.length}/${targets.length} targets due`);
  const results = [];
  for (const t of due) {
    try {
      const scan = await runScan(t);
      results.push({ targetId: t._id, targetName: t.name, scanId: scan._id, ok: true });
    } catch (e) {
      results.push({ targetId: t._id, targetName: t.name, error: e.message, ok: false });
    }
  }
  return results;
}

/**
 * Claim types per the Evidence-First principle of Face 19-20.
 */
const CLAIM_TYPES = ['FACT', 'OPINION', 'RUMOR', 'ALLEGATION', 'SPECULATION', 'SATIRE', 'OUTDATED'];

/**
 * Extract and classify claims from scan results using LLM.
 * Returns array of { text, type, source, url, confidence }.
 */
async function extractClaims(scan) {
  const results = (scan.results || []).slice(0, 15);
  if (results.length === 0) return [];

  let llmFn;
  try {
    const { callLLM } = require('~/server/services/LLMGateway/LLMGateway');
    llmFn = callLLM;
  } catch {
    try {
      const OpenAI = require('openai');
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      llmFn = async (prompt) => {
        const r = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1500,
        });
        return r.choices[0].message.content;
      };
    } catch {
      return [];
    }
  }

  const snippets = results.map((r, i) =>
    `[${i + 1}] Source: ${r.url || 'unknown'}\nTitle: ${r.title || ''}\nSnippet: ${r.snippet || ''}`,
  ).join('\n\n');

  const prompt = `You are an evidence analyst. Given these search results about "${scan.targetName}", extract 5-10 distinct claims. For each claim, classify it strictly as one of: FACT, OPINION, RUMOR, ALLEGATION, SPECULATION, SATIRE, OUTDATED.

RULES:
- FACT: verifiable, supported by primary evidence
- OPINION: subjective judgment or commentary
- RUMOR: circulating but unverified
- ALLEGATION: accusation not yet proven
- SPECULATION: inference without direct evidence
- SATIRE: clearly satirical content
- OUTDATED: factually old/superseded information
- Never classify something as FACT just because many sources repeat it (circular propagation)

Search results:
${snippets}

Respond ONLY with valid JSON array:
[{"text":"<claim>","type":"<TYPE>","source":"<domain>","url":"<url or empty>","confidence":0.0-1.0}]`;

  try {
    let raw = typeof llmFn === 'function' ? await llmFn(prompt) : '';
    raw = (raw || '').trim();
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    return parsed
      .filter((c) => c.text && CLAIM_TYPES.includes(c.type))
      .map((c) => ({ ...c, confidence: Math.min(1, Math.max(0, Number(c.confidence) || 0.5)) }));
  } catch (e) {
    logger.warn('extractClaims parse error:', e.message);
    return [];
  }
}

/**
 * Generate action templates based on claims and target name.
 * Returns { correctionRequest, platformReport, takedownRequest, publicResponse }.
 */
function generateActions(targetName, claims = []) {
  const falseAllegations = claims.filter((c) => c.type === 'ALLEGATION' || c.type === 'RUMOR');
  const factualErrors = claims.filter((c) => c.type === 'OUTDATED');

  const correctionRequest = `Subject: Request for Correction — ${targetName}

Dear [Editor/Publisher],

We are writing to request a correction to content published on [URL] regarding ${targetName}.

The following claim requires factual correction:
"[SPECIFIC CLAIM]"

Evidence supporting the correction:
- [EVIDENCE 1 — source, date, URL]
- [EVIDENCE 2 — source, date, URL]

The accurate information is: [CORRECT INFORMATION]

We respectfully request that you update or correct the above content at your earliest convenience. We are available to provide additional documentation upon request.

[Contact Information]`;

  const platformReport = `Subject: Content Report — Inaccurate Information about ${targetName}

Platform: [Platform Name]
Content URL: [URL]
Report Date: ${new Date().toISOString().split('T')[0]}

Entity affected: ${targetName}
Nature of issue: [Factually inaccurate / Policy violation / Outdated information]

Claims identified as requiring review:
${falseAllegations.map((c, i) => `${i + 1}. "${c.text}" (Classified: ${c.type})`).join('\n') || '- [Describe specific inaccurate content]'}

Supporting evidence:
- [Evidence document 1]
- [Evidence document 2]

Requested action: [Correction / Removal / Label as disputed / Context addition]

Note: This report is based on factual evidence only. We distinguish between criticism (which is protected) and factually inaccurate content.`;

  const takedownRequest = `FORMAL NOTICE — Content Removal Request

To: [Platform/Host/ISP Legal Department]
Re: ${targetName}
Date: ${new Date().toISOString().split('T')[0]}

We hereby formally request removal of the following content:
URL: [CONTENT URL]

Legal basis for removal: [Defamation / Privacy violation / Copyright infringement / Other]

IMPORTANT: This request is made only where there is a legitimate legal basis. Content that constitutes protected opinion, fair commentary, or legitimate journalism is NOT subject to this notice.

Supporting documentation attached:
☐ Evidence of factual inaccuracy
☐ Legal analysis
☐ Prior correction request (unanswered)

Contact: [Legal contact information]`;

  const publicResponse = `Public Statement — ${targetName}
Date: ${new Date().toISOString().split('T')[0]}

We have become aware of claims circulating online regarding ${targetName}. We wish to address these directly and transparently.

${falseAllegations.length > 0
    ? `Regarding allegations:\nThe following claims are inaccurate: [SPECIFIC CLAIMS]\nThe facts are: [CORRECT INFORMATION]\nEvidence: [LINK TO DOCUMENTATION]`
    : `We have reviewed the content in question and found [SUMMARY OF REVIEW].`}

${factualErrors.length > 0 ? `\nRegarding outdated information:\nSome circulating content refers to past situations that have since changed. [EXPLAIN CURRENT STATUS]` : ''}

We remain committed to transparency and are available to provide documentation to any journalist or platform that requires verification.

[Authorized signature]`;

  return { correctionRequest, platformReport, takedownRequest, publicResponse };
}

module.exports = { runScan, scanDueTargets, classifySentiment, extractClaims, generateActions, CLAIM_TYPES };
