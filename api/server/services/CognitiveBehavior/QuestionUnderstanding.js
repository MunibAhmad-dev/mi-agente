'use strict';

/**
 * QuestionUnderstandingEngine — Face 17 Phase 1.
 * Extracts structured intent from raw user input before any response is generated.
 * Fields: subject, entities[], answer_type, cardinality, complexity, language, domain.
 */

const ANSWER_TYPES = ['factual', 'procedural', 'analytical', 'creative', 'opinion', 'code', 'list', 'comparison', 'explanation', 'unknown'];
const DOMAINS = ['programming', 'science', 'history', 'mathematics', 'language', 'business', 'medical', 'legal', 'creative', 'general'];
const CARDINALITY = { SINGLE: 'single', MULTIPLE: 'multiple', OPEN: 'open', BOOLEAN: 'boolean' };

const QUESTION_PATTERNS = [
  { re: /^(what|which)\s/i, type: 'factual', cardinality: CARDINALITY.SINGLE },
  { re: /^(how many|how much)\s/i, type: 'factual', cardinality: CARDINALITY.SINGLE },
  { re: /^(how (do|to|can|should))\s/i, type: 'procedural', cardinality: CARDINALITY.MULTIPLE },
  { re: /^(why|explain|what causes)\s/i, type: 'explanation', cardinality: CARDINALITY.OPEN },
  { re: /^(compare|difference between|vs\.?)\s/i, type: 'comparison', cardinality: CARDINALITY.MULTIPLE },
  { re: /^(list|give me|name|enumerate)\s/i, type: 'list', cardinality: CARDINALITY.MULTIPLE },
  { re: /^(write|create|generate|build|make)\s/i, type: 'creative', cardinality: CARDINALITY.SINGLE },
  { re: /^(is|are|does|do|can|should|would|will)\s/i, type: 'factual', cardinality: CARDINALITY.BOOLEAN },
  { re: /\bcode\b|\bfunction\b|\bscript\b|\bprogram\b/i, type: 'code', cardinality: CARDINALITY.SINGLE },
];

const ENTITY_PATTERNS = [
  { re: /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b/g, type: 'proper_noun' },
  { re: /`([^`]+)`/g, type: 'code_ref' },
  { re: /"([^"]+)"/g, type: 'quoted' },
  { re: /\b(https?:\/\/[^\s]+)/g, type: 'url' },
];

function extractSubject(text) {
  const cleaned = text.replace(/^(what|how|why|who|when|where|which|is|are|can|do|does)\s+/i, '').trim();
  const firstClause = cleaned.split(/[,?!.]/)[0];
  return firstClause.substring(0, 120).trim();
}

function extractEntities(text) {
  const entities = [];
  const seen = new Set();
  for (const { re, type } of ENTITY_PATTERNS) {
    const pattern = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m;
    while ((m = pattern.exec(text)) !== null) {
      const val = (m[1] || m[0]).trim();
      if (val.length > 1 && !seen.has(val.toLowerCase())) {
        seen.add(val.toLowerCase());
        entities.push({ value: val, type });
      }
    }
  }
  return entities.slice(0, 20);
}

function detectDomain(text) {
  const lower = text.toLowerCase();
  if (/\b(function|class|api|code|bug|variable|algorithm|database|sql|json|http)\b/.test(lower)) return 'programming';
  if (/\b(theorem|equation|integral|derivative|probability|matrix|algebra)\b/.test(lower)) return 'mathematics';
  if (/\b(atom|molecule|species|photon|dna|evolution|physics|chemistry|biology)\b/.test(lower)) return 'science';
  if (/\b(revenue|profit|market|strategy|customer|sales|business|startup)\b/.test(lower)) return 'business';
  if (/\b(law|contract|legal|court|rights|statute|regulation|attorney)\b/.test(lower)) return 'legal';
  if (/\b(symptom|diagnosis|medication|disease|treatment|health|medical)\b/.test(lower)) return 'medical';
  if (/\b(war|century|empire|president|revolution|ancient|historical)\b/.test(lower)) return 'history';
  if (/\b(poem|story|novel|lyrics|creative|fiction|narrative)\b/.test(lower)) return 'creative';
  return 'general';
}

function estimateComplexity(text) {
  const words = text.split(/\s+/).length;
  const clauses = text.split(/[,;:]/).length;
  const hasNested = /\b(if|when|unless|although|however|furthermore)\b/i.test(text);
  if (words > 50 || clauses > 4 || hasNested) return 'high';
  if (words > 20 || clauses > 2) return 'medium';
  return 'low';
}

/**
 * Parse a user message into a structured QuestionProfile.
 * @param {string} text - Raw user message
 * @returns {object} QuestionProfile
 */
function understand(text) {
  if (!text || typeof text !== 'string') {
    return { subject: '', entities: [], answer_type: 'unknown', cardinality: CARDINALITY.OPEN, complexity: 'low', domain: 'general', raw: text || '' };
  }

  const trimmed = text.trim();
  let answer_type = 'unknown';
  let cardinality = CARDINALITY.OPEN;

  for (const { re, type, cardinality: card } of QUESTION_PATTERNS) {
    if (re.test(trimmed)) {
      answer_type = type;
      cardinality = card;
      break;
    }
  }

  if (answer_type === 'unknown') {
    answer_type = trimmed.endsWith('?') ? 'factual' : 'analytical';
  }

  return {
    subject: extractSubject(trimmed),
    entities: extractEntities(trimmed),
    answer_type,
    cardinality,
    complexity: estimateComplexity(trimmed),
    domain: detectDomain(trimmed),
    word_count: trimmed.split(/\s+/).length,
    is_question: trimmed.endsWith('?') || /^(what|how|why|who|when|where|which|is|are|can|do|does)\s/i.test(trimmed),
    raw: trimmed,
  };
}

/**
 * Understand an array of messages (takes the last user message).
 */
function understandMessages(messages) {
  if (!Array.isArray(messages)) return understand('');
  const last = [...messages].reverse().find((m) => m.role === 'user');
  return understand(last ? (typeof last.content === 'string' ? last.content : (last.content?.[0]?.text || '')) : '');
}

module.exports = { understand, understandMessages, ANSWER_TYPES, DOMAINS, CARDINALITY };
