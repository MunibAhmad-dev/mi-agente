const crypto = require('crypto');
const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  createMessageFilterPii,
  generateCheckAccess,
  skipAgentCheck,
  applyResumeContext,
  GenerationJobManager,
} = require('@librechat/api');
const { PermissionTypes, Permissions, PermissionBits } = require('librechat-data-provider');
const {
  moderateText,
  // validateModel,
  validateConvoAccess,
  buildEndpointOption,
  canAccessAgentFromBody,
} = require('~/server/middleware');
const { initializeClient } = require('~/server/services/Endpoints/agents');
const AgentController = require('~/server/controllers/agents/request');
const ResumeController = require('~/server/controllers/agents/resume');
const addTitle = require('~/server/services/Endpoints/agents/title');
const { getRoleByName } = require('~/models');

const router = express.Router();

// ── CognitiveBehavior (Face 17) ───────────────────────────────────────────────
// On every chat message: run QuestionUnderstanding → AnswerContract and attach
// to req.cognitiveProfile so downstream middleware/controllers can read it.

let _questionUnderstanding = null;
let _answerContract = null;
let _learningGate = null;
let _promptInjectionDetector = null;

function getQuestionUnderstanding() {
  if (!_questionUnderstanding) {
    try { _questionUnderstanding = require('~/server/services/CognitiveBehavior/QuestionUnderstanding'); } catch { _questionUnderstanding = null; }
  }
  return _questionUnderstanding;
}
function getAnswerContract() {
  if (!_answerContract) {
    try { _answerContract = require('~/server/services/CognitiveBehavior/AnswerContract'); } catch { _answerContract = null; }
  }
  return _answerContract;
}

let _personalityLayer = null;
let _modePrompts = null;
let _behaviorRegistry = null;
let _adaptiveVerbosity = null;
let _promptIR = null;
let _responseQualityGate = null;
let _selfAudit = null;
let _finalAuditLoop = null;
let _contradictionDetector = null;
let _factChecker = null;
let _biasForensics = null;
let _auditTrailWriter = null;
let _directAnswerFirst = null;
let _confidenceCalibration = null;
let _uncertaintyQuantifier = null;
let _riskAwareAutonomy = null;
let _knowledgeGapDetector = null;
let _selfReflection = null;
let _toolSelectionEngine = null;
let _modelPerformanceMemory = null;
let _adaptiveCognition = null;
let _harnessManager = null;
let _decisionEngine = null;
let _regressionBenchmark = null;
let _modelAgnosticTesting = null;
let _sentimentAnalyzer = null;
let _resourceEstimator = null;
let _tokenOptimization = null;
let _counterfactualChecker = null;
let _citationGenerator = null;
let _userCorrectionLearning = null;
let _dynamicPromptEngine = null;

function getPersonalityLayer() {
  if (!_personalityLayer) {
    try { _personalityLayer = require('~/server/services/CognitiveBehavior/PersonalityLayer'); } catch { _personalityLayer = null; }
  }
  return _personalityLayer;
}

function getModePrompts() {
  if (!_modePrompts) {
    try { _modePrompts = require('~/server/services/CognitiveBehavior/ModePrompts'); } catch { _modePrompts = null; }
  }
  return _modePrompts;
}

function getBehaviorRegistry() {
  if (!_behaviorRegistry) {
    try { _behaviorRegistry = require('~/server/services/CognitiveBehavior/BehaviorRegistry'); } catch { _behaviorRegistry = null; }
  }
  return _behaviorRegistry;
}

function getAdaptiveVerbosity() {
  if (!_adaptiveVerbosity) {
    try {
      const { AdaptiveVerbosity } = require('~/server/services/CognitiveBehavior/AdaptiveVerbosity');
      _adaptiveVerbosity = new AdaptiveVerbosity();
    } catch { _adaptiveVerbosity = null; }
  }
  return _adaptiveVerbosity;
}

function getPromptIR() {
  if (!_promptIR) {
    try { _promptIR = require('~/server/services/CognitiveBehavior/PromptIR').getPromptIR(); } catch { _promptIR = null; }
  }
  return _promptIR;
}

function getResponseQualityGate() {
  if (!_responseQualityGate) {
    try { _responseQualityGate = require('~/server/services/CognitiveBehavior/ResponseQualityGate').getResponseQualityGate(); } catch { _responseQualityGate = null; }
  }
  return _responseQualityGate;
}
function getSelfAudit() {
  if (!_selfAudit) {
    try { _selfAudit = require('~/server/services/CognitiveBehavior/SelfAudit').getSelfAudit(); } catch { _selfAudit = null; }
  }
  return _selfAudit;
}
function getFinalAuditLoop() {
  if (!_finalAuditLoop) {
    try { _finalAuditLoop = require('~/server/services/CognitiveBehavior/FinalAuditLoop').getFinalAuditLoop(); } catch { _finalAuditLoop = null; }
  }
  return _finalAuditLoop;
}
function getContradictionDetector() {
  if (!_contradictionDetector) {
    try { _contradictionDetector = require('~/server/services/CognitiveBehavior/ContradictionDetector').getContradictionDetector(); } catch { _contradictionDetector = null; }
  }
  return _contradictionDetector;
}
function getFactChecker() {
  if (!_factChecker) {
    try { _factChecker = require('~/server/services/CognitiveBehavior/FactChecker').getFactChecker(); } catch { _factChecker = null; }
  }
  return _factChecker;
}
function getBiasForensics() {
  if (!_biasForensics) {
    try { _biasForensics = require('~/server/services/CognitiveBehavior/BiasForensics').getBiasForensics(); } catch { _biasForensics = null; }
  }
  return _biasForensics;
}
function getAuditTrailWriter() {
  if (!_auditTrailWriter) {
    try { _auditTrailWriter = require('~/server/services/CognitiveBehavior/AuditTrailWriter').getAuditTrailWriter(); } catch { _auditTrailWriter = null; }
  }
  return _auditTrailWriter;
}
function getDirectAnswerFirst() {
  if (!_directAnswerFirst) {
    try { _directAnswerFirst = require('~/server/services/CognitiveBehavior/DirectAnswerFirst').getDirectAnswerFirst(); } catch { _directAnswerFirst = null; }
  }
  return _directAnswerFirst;
}
function getConfidenceCalibration() {
  if (!_confidenceCalibration) {
    try { _confidenceCalibration = require('~/server/services/CognitiveBehavior/ConfidenceCalibration').getConfidenceCalibration(); } catch { _confidenceCalibration = null; }
  }
  return _confidenceCalibration;
}
function getUncertaintyQuantifier() {
  if (!_uncertaintyQuantifier) {
    try { _uncertaintyQuantifier = require('~/server/services/CognitiveBehavior/UncertaintyQuantifier').getUncertaintyQuantifier(); } catch { _uncertaintyQuantifier = null; }
  }
  return _uncertaintyQuantifier;
}
function getRiskAwareAutonomy() {
  if (!_riskAwareAutonomy) {
    try { _riskAwareAutonomy = require('~/server/services/CognitiveBehavior/RiskAwareAutonomy').getRiskAwareAutonomy(); } catch { _riskAwareAutonomy = null; }
  }
  return _riskAwareAutonomy;
}
function getKnowledgeGapDetector() {
  if (!_knowledgeGapDetector) {
    try { _knowledgeGapDetector = require('~/server/services/CognitiveBehavior/KnowledgeGapDetector').getKnowledgeGapDetector(); } catch { _knowledgeGapDetector = null; }
  }
  return _knowledgeGapDetector;
}
function getSelfReflection() {
  if (!_selfReflection) {
    try { _selfReflection = require('~/server/services/CognitiveBehavior/SelfReflection').getSelfReflection(); } catch { _selfReflection = null; }
  }
  return _selfReflection;
}
function getToolSelectionEngine() {
  if (!_toolSelectionEngine) {
    try { _toolSelectionEngine = require('~/server/services/CognitiveBehavior/ToolSelectionEngine').getToolSelectionEngine(); } catch { _toolSelectionEngine = null; }
  }
  return _toolSelectionEngine;
}
function getModelPerformanceMemory() {
  if (!_modelPerformanceMemory) {
    try { _modelPerformanceMemory = require('~/server/services/CognitiveBehavior/ModelPerformanceMemory').getModelPerformanceMemory(); } catch { _modelPerformanceMemory = null; }
  }
  return _modelPerformanceMemory;
}
function getAdaptiveCognition() {
  if (!_adaptiveCognition) {
    try { _adaptiveCognition = require('~/server/services/CognitiveBehavior/AdaptiveCognition').getAdaptiveCognition(); } catch { _adaptiveCognition = null; }
  }
  return _adaptiveCognition;
}
function getDecisionEngine() {
  if (!_decisionEngine) {
    try { _decisionEngine = require('~/server/services/CognitiveBehavior/DecisionEngine').getDecisionEngine(); } catch { _decisionEngine = null; }
  }
  return _decisionEngine;
}
function getHarnessManager() {
  if (!_harnessManager) {
    try { _harnessManager = require('~/server/services/Harness').getHarnessManager(); } catch { _harnessManager = null; }
  }
  return _harnessManager;
}
function getRegressionBenchmark() {
  if (!_regressionBenchmark) {
    try { _regressionBenchmark = require('~/server/services/CognitiveBehavior/RegressionBenchmark').getRegressionBenchmark(); } catch { _regressionBenchmark = null; }
  }
  return _regressionBenchmark;
}
function getModelAgnosticTesting() {
  if (!_modelAgnosticTesting) {
    try { _modelAgnosticTesting = require('~/server/services/CognitiveBehavior/ModelAgnosticTesting').getModelAgnosticTesting(); } catch { _modelAgnosticTesting = null; }
  }
  return _modelAgnosticTesting;
}
function getSentimentAnalyzer() {
  if (!_sentimentAnalyzer) {
    try { _sentimentAnalyzer = require('~/server/services/CognitiveBehavior/SentimentAnalyzer').getSentimentAnalyzer(); } catch { _sentimentAnalyzer = null; }
  }
  return _sentimentAnalyzer;
}
function getResourceEstimator() {
  if (!_resourceEstimator) {
    try { _resourceEstimator = require('~/server/services/CognitiveBehavior/ResourceEstimator').getResourceEstimator(); } catch { _resourceEstimator = null; }
  }
  return _resourceEstimator;
}
function getTokenOptimization() {
  if (!_tokenOptimization) {
    try { _tokenOptimization = require('~/server/services/CognitiveBehavior/TokenOptimization').getTokenOptimization(); } catch { _tokenOptimization = null; }
  }
  return _tokenOptimization;
}
function getCounterfactualChecker() {
  if (!_counterfactualChecker) {
    try { _counterfactualChecker = require('~/server/services/CognitiveBehavior/CounterfactualChecker').getCounterfactualChecker(); } catch { _counterfactualChecker = null; }
  }
  return _counterfactualChecker;
}
function getCitationGenerator() {
  if (!_citationGenerator) {
    try { _citationGenerator = require('~/server/services/CognitiveBehavior/CitationGenerator').getCitationGenerator(); } catch { _citationGenerator = null; }
  }
  return _citationGenerator;
}
function getUserCorrectionLearning() {
  if (!_userCorrectionLearning) {
    try { _userCorrectionLearning = require('~/server/services/CognitiveBehavior/UserCorrectionLearning').getUserCorrectionLearning(); } catch { _userCorrectionLearning = null; }
  }
  return _userCorrectionLearning;
}
function getDynamicPromptEngine() {
  if (!_dynamicPromptEngine) {
    try { _dynamicPromptEngine = require('~/server/services/CognitiveBehavior/DynamicPromptEngine').getDynamicPromptEngine(); } catch { _dynamicPromptEngine = null; }
  }
  return _dynamicPromptEngine;
}

// Map QuestionUnderstanding answer_type → ModePrompts mode id
const ANSWER_TYPE_TO_MODE = {
  code: 'coding',
  procedural: 'coding',
  analytical: 'analysis',
  comparison: 'analysis',
  creative: 'creative',
  explanation: 'teaching',
  list: 'chat',
  factual: 'research',
  opinion: 'chat',
  unknown: 'chat',
};

// Map answer_type → BehaviorRegistry pack id
const ANSWER_TYPE_TO_PACK = {
  code: 'coding-assistant',
  procedural: 'coding-assistant',
  analytical: 'research-mode',
  factual: 'research-mode',
  explanation: 'tutor-mode',
  creative: 'chat-mode',
  default: 'chat-mode',
};
function getLearningGate() {
  if (!_learningGate) {
    try { _learningGate = require('~/server/services/Learning/LearningEvaluationGate').LearningEvaluationGate; } catch { _learningGate = null; }
  }
  return _learningGate;
}
function getPromptInjectionDetector() {
  if (!_promptInjectionDetector) {
    try { _promptInjectionDetector = require('~/server/services/Harness/cognitive/evidence/PromptInjectionDetector').PromptInjectionDetector; } catch { _promptInjectionDetector = null; }
  }
  return _promptInjectionDetector;
}

const wireCognitiveBehavior = (req, res, next) => {
  const text = req.body?.text || req.body?.messages?.[0]?.content || '';
  if (!text) return next();

  // Face 15 — prompt injection detection: block before any AI processing.
  try {
    const PID = getPromptInjectionDetector();
    if (PID) {
      const detector = new PID();
      const result = detector.detect(text);
      req.injectionResult = result;
      if (result && !result.safe) {
        const severity = result.findings?.[0]?.severity || 'high';
        return res.status(400).json({ error: 'Prompt injection detected', severity });
      }
    }
  } catch { /* non-fatal — never block legitimate requests */ }
  try {
    const qu = getQuestionUnderstanding();
    const ac = getAnswerContract();
    if (qu && ac) {
      const profile = qu.understand(text);
      const contract = ac.buildContract(profile);
      req.cognitiveProfile = profile;
      req.answerContract = contract;

      // PromptIR — improve/clarify the raw prompt before LLM processing (Face 17)
      try {
        const pir = getPromptIR();
        if (pir) {
          const pirResult = pir.improve(text, { intent: profile?.answer_type, answerType: profile?.answer_type, domain: profile?.domain });
          req.promptIR = pirResult;
          // Only apply improvement when it adds real substance (not just minor cleanup)
          if (pirResult.wasImproved && pirResult.changes.some((c) => c !== 'normalized_whitespace_punctuation')) {
            req.body.text = pirResult.improved;
          }
        }
      } catch { /* non-fatal */ }

      // BehaviorRegistry — select and apply behavior pack (Face 17 Phase 4)
      try {
        const br = getBehaviorRegistry();
        if (br) {
          const packId = ANSWER_TYPE_TO_PACK[profile?.answer_type] || ANSWER_TYPE_TO_PACK.default;
          const pack = br.get(packId);
          if (pack && pack.system_prompt_fragment) {
            req.behaviorPack = pack;
            req.behaviorPackFragment = pack.system_prompt_fragment;
          }
        }
      } catch { /* non-fatal */ }

      // AdaptiveVerbosity — read session verbosity level and adjust (Face 17 Phase 5)
      try {
        const av = getAdaptiveVerbosity();
        if (av) {
          const sessionId = req.body?.conversationId || req.user?.id || 'default';
          const verbResult = av.processMessage(sessionId, req.body.text || text);
          req.verbosityLevel = verbResult.level;
        }
      } catch { /* non-fatal */ }

      // PersonalityLayer + ModePrompts injection (Face 17 Phase 3 + 6).
      // Build a cognitive context fragment and prepend it to req.body.text so the
      // LLM receives mode-specific + personality instructions as part of the user turn.
      try {
        const pl = getPersonalityLayer();
        const mp = getModePrompts();
        if (pl && mp) {
          const modeId = ANSWER_TYPE_TO_MODE[profile.answer_type] || 'chat';
          const mode = mp.getMode(modeId);
          const personality = pl.getPersonality('default');
          const personalityFragment = pl.toSystemPromptFragment(personality);
          const behaviorFragment = req.behaviorPackFragment || '';

          // Only inject when mode system text adds meaningful context
          if (mode && mode.system && modeId !== 'chat') {
            const parts = [mode.system, personalityFragment, behaviorFragment].filter(Boolean).join('\n');
            const cogFragment = `<cognitive_context mode="${modeId}" personality="${personality.id}">\n${parts}\n</cognitive_context>`;
            // Save the original user message so wireExecutiveLoop plans from real user intent.
            req.body._originalText = req.body._originalText || req.body.text || text;
            // Route to system context so the LLM sees it but the UI doesn't display it.
            req.body._systemContext = (req.body._systemContext || '') + cogFragment + '\n\n';
            req.cognitiveMode = modeId;
          }
          req.cognitivePersonality = personality;
        }
      } catch { /* non-fatal — PersonalityLayer/ModePrompts optional */ }

      // Face 17 + 16 — ResponseQualityGate + LearningEvaluationGate on every response.
      // Intercept res.json to score the final AI response.
      const _origJson = res.json.bind(res);
      res.json = (body) => {
        try {
          const responseText =
            body?.message?.content ||
            body?.choices?.[0]?.message?.content ||
            body?.response ||
            (typeof body === 'string' ? body : null);
          if (responseText) {
            // ResponseQualityGate (Face 17)
            try {
              const rqg = getResponseQualityGate();
              if (rqg && req.answerContract) {
                const qResult = rqg.gate(responseText, req.answerContract, {
                  verbosityLevel: req.verbosityLevel || 'moderate',
                  prompt: req.body?.text || '',
                });
                req.responseQuality = qResult;
              }
            } catch { /* non-fatal */ }

            // LearningEvaluationGate (Face 16)
            if (req.answerContract) {
              try {
                const { scoreAlignment } = ac;
                const alignment = scoreAlignment(responseText, req.answerContract);
                const gate = getLearningGate();
                if (gate) {
                  const GateClass = gate;
                  const g = new GateClass();
                  const normalized = alignment.score / 100;
                  g.gate({ model_id: req.body?.model || 'unknown', baseline_score: 0, new_score: normalized, metric: 'alignment' });
                }
              } catch { /* non-fatal */ }
            }

            // FeedbackAdapter — trigger self-improvement check (Face 16)
            try {
              const { getFeedbackAdapter } = require('~/server/services/Learning/FeedbackAdapter');
              getFeedbackAdapter().triggerIfNeeded(getLearningGate()?.instance, getPromptIR());
            } catch { /* non-fatal */ }

            // Gen B Phase 28 — SelfAudit: score response relevance vs. prompt
            try {
              const sa = getSelfAudit();
              const prompt = req.body?._originalText || req.body?.text || '';
              if (sa && typeof sa.audit === 'function') {
                const auditResult = sa.audit(responseText, prompt, req.answerContract || null);
                req.selfAuditResult = auditResult;
              }
            } catch { /* non-fatal */ }

            // Gen B Phase 26 — ContradictionDetector: flag contradictory statements
            try {
              const cd = getContradictionDetector();
              if (cd && typeof cd.detect === 'function') {
                const contradictions = cd.detect(responseText);
                if (contradictions && contradictions.length > 0) req.contradictions = contradictions;
              }
            } catch { /* non-fatal */ }

            // Gen B Phase 13 — FactChecker: check factual claims in response
            try {
              const fc = getFactChecker();
              if (fc && typeof fc.checkAll === 'function') {
                const factResults = fc.checkAll(responseText);
                if (factResults && factResults.length > 0) req.factCheckResults = factResults;
              }
            } catch { /* non-fatal */ }

            // Gen B Phase 30 — BiasForensics: surface ideological/framing biases in response
            try {
              const bf = getBiasForensics();
              if (bf && typeof bf.analyzeArticle === 'function') {
                const biasReport = bf.analyzeArticle(responseText);
                if (biasReport?.biasScore > 0.3) req.biasReport = biasReport;
              }
            } catch { /* non-fatal */ }

            // Gen B Phase 42 — DirectAnswerFirst: verify response leads with the answer
            try {
              const daf = getDirectAnswerFirst();
              const prompt = req.body?._originalText || req.body?.text || '';
              if (daf && typeof daf.analyze === 'function') {
                const dafResult = daf.analyze(prompt, responseText);
                req.directAnswerCheck = dafResult;
              }
            } catch { /* non-fatal */ }

            // Gen B Phase 24 — UncertaintyQuantifier: quantify how uncertain the response is
            try {
              const uq = getUncertaintyQuantifier();
              if (uq && typeof uq.quantify === 'function') {
                const uncertainty = uq.quantify(responseText);
                req.uncertaintyScore = uncertainty;
                // ConfidenceCalibration: adjust raw uncertainty score with session history
                try {
                  const cc = getConfidenceCalibration();
                  if (cc && typeof cc.adjust === 'function' && typeof uncertainty === 'number') {
                    req.calibratedUncertainty = cc.adjust(uncertainty);
                  }
                } catch { /* non-fatal */ }
              }
            } catch { /* non-fatal */ }

            // Gen B Phase 21 — UserCorrectionLearning: apply learned corrections to response
            try {
              const ucl = getUserCorrectionLearning();
              const sessionId = req.body?.conversationId || userId || 'default';
              if (ucl && typeof ucl.applyLearning === 'function') {
                const improved = ucl.applyLearning(sessionId, responseText);
                req.correctionApplied = improved !== responseText;
              }
            } catch { /* non-fatal */ }

            // Gen B Phase 19 — CounterfactualChecker: validate counterfactual reasoning
            try {
              const cfc = getCounterfactualChecker();
              const prompt = req.body?._originalText || req.body?.text || '';
              if (cfc && typeof cfc.check === 'function') {
                const cfResult = cfc.check(responseText, { domain: req.body._agentIntent, context: prompt });
                if (cfResult) req.counterfactualCheck = cfResult;
              }
            } catch { /* non-fatal */ }

            // Gen B Phase 43 — CitationGenerator: generate citations for factual claims
            try {
              const cg = getCitationGenerator();
              if (cg && typeof cg.formatBibliography === 'function') {
                const sessionId = req.body?.conversationId || userId || 'default';
                const bibliography = cg.formatBibliography(sessionId);
                if (bibliography) req.bibliography = bibliography;
              }
            } catch { /* non-fatal */ }

            // Gen B Phase 36 — SelfReflection: reflect on response vs. prompt quality
            try {
              const sr = getSelfReflection();
              const prompt = req.body?._originalText || req.body?.text || '';
              if (sr && typeof sr.reflect === 'function') {
                const quality = req.selfAuditResult?.score || req.responseQuality?.score;
                const reflection = sr.reflect(prompt, responseText, quality);
                req.selfReflection = reflection;
              }
            } catch { /* non-fatal */ }

            // Gen B Phase 39 — AuditTrailWriter: log agent response event
            try {
              const atw = getAuditTrailWriter();
              const sessionId = req.body?.conversationId || userId || 'default';
              if (atw && typeof atw.log === 'function') {
                atw.log({
                  sessionId,
                  event: 'agent_response',
                  qualityScore: req.responseQuality?.score,
                  selfAuditScore: req.selfAuditResult?.score,
                  ts: Date.now(),
                });
              }
            } catch { /* non-fatal */ }

            // Gen B Phase 46 — FinalAuditLoop: async full audit (fire-and-forget, never blocks)
            try {
              const fal = getFinalAuditLoop();
              if (fal && typeof fal.runAudit === 'function') {
                const sessionId = req.body?.conversationId || userId || 'default';
                fal.runAudit({ sessionId, response: responseText, qualityScore: req.responseQuality?.score }).catch(() => {});
              }
            } catch { /* non-fatal */ }

            // Face 8 — MultiModelJudge: async quality evaluation via multiple LLMs (fire-and-forget)
            try {
              const mmj = getMultiModelJudge();
              if (mmj && typeof mmj.judge === 'function' && responseText) {
                const prompt = req.body?._originalText || req.body?.text || '';
                mmj.judge({ prompt, response: responseText }).then((verdict) => {
                  req.multiModelVerdict = verdict;
                }).catch(() => {});
              }
            } catch { /* non-fatal */ }

            // MemoryFacade — record AI response as episodic memory
            try {
              const mf = getMemoryFacade();
              if (mf && responseText && userId) {
                mf.recordEpisode(userId, responseText.slice(0, 500), ['ai_response']);
              }
            } catch { /* non-fatal */ }

            // Face 8 — ConstitutionEngine: validate AI response against constitution
            try {
              const ce = getConstitutionEngine();
              if (ce && typeof ce.validate === 'function' && responseText) {
                const result = ce.validate(responseText);
                req.constitutionCheck = result;
                if (!result.passed) {
                  req.constitutionResponseViolations = result.violations;
                }
              }
            } catch { /* non-fatal */ }

            // SemanticCache: store successful response for future cache hits
            try {
              const sc = getSemanticCache();
              const prompt = req.body?._originalText || req.body?.text || '';
              if (sc && typeof sc.set === 'function' && prompt && responseText) {
                sc.set(prompt, responseText);
              }
            } catch { /* non-fatal */ }

            // FailureMemory: record any errors/failures observed in the response
            try {
              const fm = getFailureMemory();
              const prompt = req.body?._originalText || req.body?.text || '';
              if (fm && typeof fm.record === 'function' && req.constitutionResponseViolations?.length > 0) {
                fm.record(prompt, 'constitution_violation', { violations: req.constitutionResponseViolations });
              }
            } catch { /* non-fatal */ }

            // Gen B — OutputFormatter: detect response format (code/table/list/prose)
            try {
              const of = getOutputFormatter();
              if (of && typeof of.detect === 'function') {
                const detection = of.detect(responseText);
                req.responseFormatDetection = detection;
              }
            } catch { /* non-fatal */ }

            // Gen B — EvidenceEngine: extract and score factual claims in response
            try {
              const ee = getEvidenceEngine();
              if (ee && typeof ee.extractClaims === 'function') {
                const claims = ee.extractClaims(responseText);
                if (claims && claims.length > 0) req.evidenceClaims = claims.slice(0, 10);
              }
            } catch { /* non-fatal */ }

            // Gen B — FallbackChain: dequeue completed priority task if one was enqueued
            try {
              const pq = getPriorityQueue();
              if (pq && typeof pq.dequeue === 'function' && req.priorityTaskId) {
                pq.dequeue();
              }
            } catch { /* non-fatal */ }

            // Gen B — HandoffProtocol: list pending handoffs for awareness (non-blocking)
            try {
              const hp = getHandoffProtocol();
              if (hp && typeof hp.listPending === 'function') {
                const pending = hp.listPending();
                if (pending && pending.length > 0) req.pendingHandoffs = pending.length;
              }
            } catch { /* non-fatal */ }

            // Gen B — UniversalAgentAbstraction: async fire-and-forget route scoring
            try {
              const uaa = getUniversalAgentAbstraction();
              if (uaa && typeof uaa.route === 'function') {
                const prompt = req.body?._originalText || req.body?.text || '';
                uaa.route(prompt, { intent: req.body._agentIntent, complexity: req.body._taskComplexity }).then((result) => {
                  if (result) req.uaaRouteScore = result;
                }).catch(() => {});
              }
            } catch { /* non-fatal */ }

            // Gen B — BehaviorBenchmark: run 3 built-in quality benchmarks post-response
            try {
              const bb = getBehaviorBenchmark();
              if (bb && typeof bb.run === 'function') {
                const query = req.body?._originalText || req.body?.text || '';
                const benchCtx = { query, expectedLength: 400 };
                const qr = bb.run('response_quality', responseText, benchCtx);
                const sr = bb.run('safety', responseText, benchCtx);
                const hr = bb.run('helpfulness', responseText, benchCtx);
                req.benchmarkScores = { quality: qr.score, safety: sr.score, helpfulness: hr.score };
              }
            } catch { /* non-fatal */ }

            // Gen B — MemorySystem: record this interaction as an episodic event
            try {
              const ms = getMemorySystem();
              if (ms && typeof ms.recordEvent === 'function') {
                const sessionId = req.body?.conversationId || req.user?.id || 'default';
                ms.recordEvent('agent_response', {
                  sessionId,
                  userId: req.user?.id,
                  outcome: 'success',
                  tags: [req.body._agentIntent, req.body._taskComplexity].filter(Boolean),
                  metadata: { benchmarkScores: req.benchmarkScores, responseLength: responseText.length },
                });
              }
            } catch { /* non-fatal */ }

            // Gen B Phase 20 — BuilderCritic: score the response and attach critique for downstream logging
            try {
              const bc = getBuilderCritic();
              if (bc && typeof bc.critique === 'function' && responseText.length > 50) {
                const result = bc.critique(responseText);
                req.builderCriticScore = result.score;
                req.builderCriticPassed = result.passed;
                if (!result.passed && result.feedback.length > 0) {
                  logger.debug('[BuilderCritic] Response below threshold:', result.feedback.join('; '));
                }
              }
            } catch { /* non-fatal */ }

            // Gen B Phase 44 — ModelAgnosticTesting: run built-in behavioral contracts on response
            try {
              const mat = getModelAgnosticTesting();
              if (mat && typeof mat.runInline === 'function' && responseText.length > 20) {
                const tests = [
                  { name: 'isSafe', matcher: 'isSafe', required: true },
                  { name: 'isSubstantial', matcher: 'isSubstantial' },
                ];
                const matResult = mat.runInline(responseText, tests);
                req.modelAgnosticResult = { passed: matResult.passed, score: matResult.score };
                if (!matResult.passed) {
                  const failed = (matResult.results || []).filter((r) => !r.passed).map((r) => r.name);
                  logger.debug('[ModelAgnosticTesting] Behavioral contract failed:', failed.join(', '));
                }
              }
            } catch { /* non-fatal */ }

            // Gen B Phase 40 — RegressionBenchmark: record quality metric for regression detection
            try {
              const rb = getRegressionBenchmark();
              if (rb && typeof rb.record === 'function' && req.benchmarkScores) {
                const sessionId = req.body?.conversationId || req.user?.id || 'default';
                rb.record(sessionId, 'quality_score', req.benchmarkScores.quality || 0);
                rb.record(sessionId, 'response_length', Math.min(responseText.length / 1000, 1));
                const detection = rb.detectRegression(sessionId, 'quality_score');
                if (detection && detection.regression) {
                  logger.warn('[RegressionBenchmark] Quality regression detected — trend:', detection.trend, 'magnitude:', detection.magnitude);
                }
              }
            } catch { /* non-fatal */ }
          }
        } catch { /* non-fatal — never block the response */ }
        return _origJson(body);
      };
    }
  } catch { /* non-fatal */ }
  return next();
};

// ── ResearchEngine — Face 10/21 ───────────────────────────────────────────────
// After CognitiveBehavior classifies the intent, check whether the message is a
// research query. If yes, run getResearchEngine().query() with a 3 000 ms timeout
// so slow ResearchOS jobs never stall the chat pipeline. Result stored in
// req.researchContext and, when an answer exists, prepended to req.body.text.

let _researchEngineInstance = null;

function getResearchEngineInstance() {
  if (!_researchEngineInstance) {
    try {
      _researchEngineInstance = require('~/server/services/Research/ResearchEngine').getResearchEngine();
    } catch { _researchEngineInstance = null; }
  }
  return _researchEngineInstance;
}

const wireResearchEngine = async (req, _res, next) => {
  try {
    const text = req.body?.text || req.body?.messages?.[0]?.content || '';
    if (!text) return next();

    const engine = getResearchEngineInstance();
    if (!engine) return next();

    // Only run when the cognitive profile says "research"/"factual" OR the engine's own heuristic fires.
    const isResearch =
      req.cognitiveProfile?.answer_type === 'research' ||
      req.cognitiveProfile?.answer_type === 'factual' ||
      engine.isResearchQuery(text);

    if (!isResearch) return next();

    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 3000));
    const result = await Promise.race([engine.query(text, {}), timeout]);

    if (result && result.answer && !result.fallback) {
      req.researchContext = result;
      // Prepend research context so the LLM can cite it in its reply.
      req.body.text = `[Research context: ${result.answer}]\n\n${req.body.text || text}`;
    }
  } catch { /* non-fatal — never block a legitimate chat request */ }
  next();
};

// ── ExecutiveLoop intent classification + memory context injection ───────────
// Two-phase approach (FASE 2 fix):
//   Phase A (synchronous, always runs): keyword classify() injects intent tag
//     into every chat request at zero latency.
//   Phase B (async, AGENT_RUNTIME_WIRED=true): full 12-step loop runs with
//     a 4 s timeout; its directive replaces phase A if it arrives in time.

let _execRun = null;
let _classify = null;
let _crossMemory = null;
let _director = null;
let _worldModel = null;
let _contextResolution = null;
let _askVsAct = null;
let _responseControlSystem = null;

// Gen B phases — lazy singletons
let _memoryFacade = null;
let _multiModelJudge = null;
let _constitutionEngine = null;
let _semanticCache = null;
let _loopDetection = null;
let _failureMemory = null;
let _taskComplexityEngine = null;
let _multiTurnMemory = null;
let _entityTracker = null;
let _minimumEffectiveAction = null;
let _reversibleExecution = null;
let _scopeGuardian = null;
let _goalStateMonitor = null;
let _timeAwareness = null;
let _progressEngine = null;

function getMemoryFacade() {
  if (!_memoryFacade) {
    try { _memoryFacade = require('~/server/services/Memory/MemoryFacade'); } catch { _memoryFacade = null; }
  }
  return _memoryFacade;
}
function getMultiModelJudge() {
  if (!_multiModelJudge) {
    try { _multiModelJudge = require('~/server/services/ExecutiveAI/MultiModelJudge'); } catch { _multiModelJudge = null; }
  }
  return _multiModelJudge;
}
function getConstitutionEngine() {
  if (!_constitutionEngine) {
    try { _constitutionEngine = require('~/server/services/ExecutiveAI/ConstitutionEngine').getConstitutionEngine(); } catch { _constitutionEngine = null; }
  }
  return _constitutionEngine;
}
function getSemanticCache() {
  if (!_semanticCache) {
    try { _semanticCache = require('~/server/services/CognitiveBehavior/SemanticCache').getSemanticCache(); } catch { _semanticCache = null; }
  }
  return _semanticCache;
}
function getLoopDetection() {
  if (!_loopDetection) {
    try { _loopDetection = require('~/server/services/CognitiveBehavior/LoopDetection').getLoopDetection(); } catch { _loopDetection = null; }
  }
  return _loopDetection;
}
function getFailureMemory() {
  if (!_failureMemory) {
    try { _failureMemory = require('~/server/services/CognitiveBehavior/FailureMemory').getFailureMemory(); } catch { _failureMemory = null; }
  }
  return _failureMemory;
}
function getTaskComplexityEngine() {
  if (!_taskComplexityEngine) {
    try { _taskComplexityEngine = require('~/server/services/CognitiveBehavior/TaskComplexityEngine').getTaskComplexityEngine(); } catch { _taskComplexityEngine = null; }
  }
  return _taskComplexityEngine;
}
function getMultiTurnMemory() {
  if (!_multiTurnMemory) {
    try { _multiTurnMemory = require('~/server/services/CognitiveBehavior/MultiTurnMemory').getMultiTurnMemory(); } catch { _multiTurnMemory = null; }
  }
  return _multiTurnMemory;
}
function getEntityTracker() {
  if (!_entityTracker) {
    try { _entityTracker = require('~/server/services/CognitiveBehavior/EntityTracker').getEntityTracker(); } catch { _entityTracker = null; }
  }
  return _entityTracker;
}
function getMinimumEffectiveAction() {
  if (!_minimumEffectiveAction) {
    try { _minimumEffectiveAction = require('~/server/services/CognitiveBehavior/MinimumEffectiveAction').getMinimumEffectiveAction(); } catch { _minimumEffectiveAction = null; }
  }
  return _minimumEffectiveAction;
}
function getReversibleExecution() {
  if (!_reversibleExecution) {
    try { _reversibleExecution = require('~/server/services/CognitiveBehavior/ReversibleExecution').getReversibleExecution(); } catch { _reversibleExecution = null; }
  }
  return _reversibleExecution;
}
function getScopeGuardian() {
  if (!_scopeGuardian) {
    try { _scopeGuardian = require('~/server/services/CognitiveBehavior/ScopeGuardian').getScopeGuardian(); } catch { _scopeGuardian = null; }
  }
  return _scopeGuardian;
}
function getGoalStateMonitor() {
  if (!_goalStateMonitor) {
    try { _goalStateMonitor = require('~/server/services/CognitiveBehavior/GoalStateMonitor').getGoalStateMonitor(); } catch { _goalStateMonitor = null; }
  }
  return _goalStateMonitor;
}
function getTimeAwareness() {
  if (!_timeAwareness) {
    try { _timeAwareness = require('~/server/services/CognitiveBehavior/TimeAwareness').getTimeAwareness(); } catch { _timeAwareness = null; }
  }
  return _timeAwareness;
}
function getProgressEngine() {
  if (!_progressEngine) {
    try { _progressEngine = require('~/server/services/CognitiveBehavior/ProgressEngine').getProgressEngine(); } catch { _progressEngine = null; }
  }
  return _progressEngine;
}

let _fallbackChain = null;
let _outputFormatter = null;
let _evidenceEngine = null;
let _priorityQueue = null;
let _capabilityRegistry = null;
let _handoffProtocol = null;
let _promptVersioning = null;
let _providerAbstraction = null;
let _universalAgentAbstraction = null;
let _interruptionHandler = null;
let _behaviorBenchmark = null;
let _memorySystem = null;
let _behaviorPolicy = null;
let _alternativeHypothesisEngine = null;
let _builderCritic = null;

function getFallbackChain() {
  if (!_fallbackChain) {
    try { _fallbackChain = require('~/server/services/CognitiveBehavior/FallbackChain').getFallbackChain(); } catch { _fallbackChain = null; }
  }
  return _fallbackChain;
}
function getOutputFormatter() {
  if (!_outputFormatter) {
    try { _outputFormatter = require('~/server/services/CognitiveBehavior/OutputFormatter').getOutputFormatter(); } catch { _outputFormatter = null; }
  }
  return _outputFormatter;
}
function getEvidenceEngine() {
  if (!_evidenceEngine) {
    try { _evidenceEngine = require('~/server/services/CognitiveBehavior/EvidenceEngine').getEvidenceEngine(); } catch { _evidenceEngine = null; }
  }
  return _evidenceEngine;
}
function getPriorityQueue() {
  if (!_priorityQueue) {
    try { _priorityQueue = require('~/server/services/CognitiveBehavior/PriorityQueue').getPriorityQueue(); } catch { _priorityQueue = null; }
  }
  return _priorityQueue;
}
function getCapabilityRegistry() {
  if (!_capabilityRegistry) {
    try { _capabilityRegistry = require('~/server/services/CognitiveBehavior/CapabilityRegistry').getCapabilityRegistry(); } catch { _capabilityRegistry = null; }
  }
  return _capabilityRegistry;
}
function getHandoffProtocol() {
  if (!_handoffProtocol) {
    try { _handoffProtocol = require('~/server/services/CognitiveBehavior/HandoffProtocol').getHandoffProtocol(); } catch { _handoffProtocol = null; }
  }
  return _handoffProtocol;
}
function getPromptVersioning() {
  if (!_promptVersioning) {
    try { _promptVersioning = require('~/server/services/CognitiveBehavior/PromptVersioning').getPromptVersioning(); } catch { _promptVersioning = null; }
  }
  return _promptVersioning;
}
function getProviderAbstraction() {
  if (!_providerAbstraction) {
    try { _providerAbstraction = require('~/server/services/CognitiveBehavior/ProviderAbstraction').getProviderAbstraction(); } catch { _providerAbstraction = null; }
  }
  return _providerAbstraction;
}
function getUniversalAgentAbstraction() {
  if (!_universalAgentAbstraction) {
    try { _universalAgentAbstraction = require('~/server/services/CognitiveBehavior/UniversalAgentAbstraction').getUniversalAgentAbstraction(); } catch { _universalAgentAbstraction = null; }
  }
  return _universalAgentAbstraction;
}
function getInterruptionHandler() {
  if (!_interruptionHandler) {
    try { _interruptionHandler = require('~/server/services/CognitiveBehavior/InterruptionHandler').getInterruptionHandler(); } catch { _interruptionHandler = null; }
  }
  return _interruptionHandler;
}
function getBehaviorBenchmark() {
  if (!_behaviorBenchmark) {
    try { _behaviorBenchmark = require('~/server/services/CognitiveBehavior/BehaviorBenchmark').getBehaviorBenchmark(); } catch { _behaviorBenchmark = null; }
  }
  return _behaviorBenchmark;
}
function getMemorySystem() {
  if (!_memorySystem) {
    try { _memorySystem = require('~/server/services/CognitiveBehavior/MemorySystem').getMemorySystem(); } catch { _memorySystem = null; }
  }
  return _memorySystem;
}
function getBehaviorPolicy() {
  if (!_behaviorPolicy) {
    try { _behaviorPolicy = require('~/server/services/CognitiveBehavior/BehaviorPolicy').getBehaviorPolicy(); } catch { _behaviorPolicy = null; }
  }
  return _behaviorPolicy;
}
function getAlternativeHypothesisEngine() {
  if (!_alternativeHypothesisEngine) {
    try { _alternativeHypothesisEngine = require('~/server/services/CognitiveBehavior/AlternativeHypothesisEngine').getAlternativeHypothesisEngine(); } catch { _alternativeHypothesisEngine = null; }
  }
  return _alternativeHypothesisEngine;
}
function getBuilderCritic() {
  if (!_builderCritic) {
    try { _builderCritic = require('~/server/services/CognitiveBehavior/BuilderCritic').getBuilderCritic(); } catch { _builderCritic = null; }
  }
  return _builderCritic;
}

function getContextResolution() {
  if (!_contextResolution) {
    try { _contextResolution = require('~/server/services/CognitiveBehavior/ContextResolution'); } catch { _contextResolution = null; }
  }
  return _contextResolution;
}
function getAskVsActFn() {
  if (!_askVsAct) {
    try { _askVsAct = require('~/server/services/CognitiveBehavior/AskVsAct'); } catch { _askVsAct = null; }
  }
  return _askVsAct;
}
function getResponseControlSystemFn() {
  if (!_responseControlSystem) {
    try { _responseControlSystem = require('~/server/services/CognitiveBehavior/ResponseControlSystem'); } catch { _responseControlSystem = null; }
  }
  return _responseControlSystem;
}

function getDirector() {
  if (!_director) {
    try { _director = require('~/server/services/ExecutiveLoop/Director'); } catch { _director = null; }
  }
  return _director;
}
function getWorldModelForChat() {
  if (!_worldModel) {
    try { _worldModel = require('~/server/services/Harness/cognitive/WorldModel').getWorldModel(); } catch { _worldModel = null; }
  }
  return _worldModel;
}

function getExecRun() {
  if (!_execRun) {
    try { _execRun = require('~/server/services/ExecutiveLoop/ExecutiveLoop').run; } catch { _execRun = null; }
  }
  return _execRun;
}

function getClassify() {
  if (!_classify) {
    try { _classify = require('~/server/services/ExecutiveLoop/IntentClassifier').classify; } catch { _classify = null; }
  }
  return _classify;
}

function getCrossMemory() {
  if (!_crossMemory) {
    try {
      const { CrossSessionMemory } = require('~/server/services/Harness/cognitive/CrossSessionMemory');
      _crossMemory = new CrossSessionMemory();
    } catch { _crossMemory = null; }
  }
  return _crossMemory;
}

const wireExecutiveLoop = async (req, _res, next) => {
  // Use the pre-injection text when available so the planner sees the real user
  // intent rather than the <cognitive_context> XML block prepended by wireCognitiveBehavior.
  const message = req.body?._originalText || req.body?.text || req.body?.messages?.[0]?.text || '';
  const userId = req.user?.id || req.user?._id?.toString();

  if (message && userId) {
    // Attach unified memory context (MemoryFacade: multicapa + cross-session + world-model)
    try {
      const mf = getMemoryFacade();
      if (mf) {
        const { context, sources } = mf.getContext(userId, message, { episodicLimit: 3 });
        if (sources.length > 0 && context) {
          req.memoryContext = context;
          req.body._memorySourceCount = sources.length;
          mf.recordEpisode(userId, message, ['user_message']);
        }
      }
    } catch { /* non-fatal */ }

    // Face 8 — ConstitutionEngine: validate incoming message against project constitution
    try {
      const ce = getConstitutionEngine();
      if (ce && typeof ce.validate === 'function') {
        const result = ce.validate(message);
        req.body._constitutionActive = true;
        if (!result.passed) {
          req.constitutionViolations = result.violations;
        }
      }
    } catch { /* non-fatal */ }

    // LoopDetection: detect if user is repeating the same query (agent stuck in loop)
    try {
      const ld = getLoopDetection();
      if (ld && typeof ld.check === 'function') {
        const loopResult = ld.check(sessionId || userId, message);
        if (loopResult.isLoop) {
          req.body._loopDetected = true;
          req.body._loopCount = loopResult.count;
        }
      }
    } catch { /* non-fatal */ }

    // FailureMemory: warn if this task type has failed before in this session
    try {
      const fm = getFailureMemory();
      if (fm && typeof fm.getWarnings === 'function') {
        const warnings = fm.getWarnings(message);
        if (warnings && warnings.length > 0) req.failureWarnings = warnings;
      }
    } catch { /* non-fatal */ }

    // SemanticCache: check if we have a recent cached response for this query
    try {
      const sc = getSemanticCache();
      if (sc && typeof sc.get === 'function') {
        const cached = sc.get(message);
        if (cached) req.semanticCacheHit = cached;
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 3 — ContextResolution: resolve pronouns + entities before dispatch
    try {
      const cr = getContextResolution();
      if (cr && typeof cr.getContextResolution === 'function') {
        const history = req.body?.messages || [];
        const resolved = cr.getContextResolution().resolve(message, history);
        req.contextResolution = resolved;
        // Use resolved message if pronoun-filling changed anything meaningful
        if (resolved.resolvedMessage && resolved.resolvedMessage !== message && resolved.pronounResolutions && Object.keys(resolved.pronounResolutions).length > 0) {
          req.body._resolvedMessage = resolved.resolvedMessage;
        }
      }
    } catch { /* non-fatal */ }

    // Phase A — synchronous intent classification + Director decision (always, zero latency)
    try {
      const classifyFn = getClassify();
      if (classifyFn) {
        const intentResult = classifyFn(message);
        req.intentResult = intentResult;
        // Stamp intent onto request so downstream middleware and logs can use it
        req.body._agentIntent = intentResult.intent;

        // FASE 4 — Executive Director: immediately decide approach using WorldModel context
        try {
          const director = getDirector();
          if (director) {
            const wm = getWorldModelForChat();
            const worldContext = wm ? wm.getContextSummary() : '';
            // Update world model with this request
            if (wm) wm.updateEnv({ activeUser: userId, lastMessage: message.slice(0, 100), lastIntent: intentResult.intent });
            const direction = director.decide(intentResult, message, worldContext);
            req.directorDecision = direction;
            req.body._agentApproach = direction.approach;

            // Gen B Phase 7 — AskVsAct: decide whether to ask or act before dispatch
            try {
              const ava = getAskVsActFn();
              if (ava && typeof ava.getAskVsAct === 'function') {
                const avaInstance = ava.getAskVsAct();
                const avaResult = avaInstance.evaluate(message, { confidence: intentResult.confidence, irreversible: direction.approach === 'plan_and_execute' });
                req.askVsActResult = avaResult;
                req.body._agentAction = avaResult.action;
                // If agent should ask, prepend a clarifying note to the text so LLM asks the right questions
                if (avaResult.action === 'ask' && avaResult.clarifyingQuestions?.length) {
                  req.body._clarifyingQuestions = avaResult.clarifyingQuestions;
                }
              }
            } catch { /* non-fatal */ }

            // Gen B Phase 8 — DecisionEngine: make explicit yes/no/ask decision before dispatch
            try {
              const de = getDecisionEngine();
              if (de && typeof de.decide === 'function') {
                const question = `Should agent act on: "${message.slice(0, 150)}"?`;
                const deResult = de.decide(question, {
                  riskLevel: req.body._riskLevel || 'low',
                  irreversible: req.body._reversible === false,
                  constraints: req.body._agentAction === 'ask' ? ['clarification needed'] : [],
                });
                req.body._engineDecision = deResult.decision;
                req.body._engineConfidence = deResult.confidence;
              }
            } catch { /* non-fatal */ }

            // Gen B Phase 38 — ResponseControlSystem: select sampling profile based on intent
            try {
              const rcs = getResponseControlSystemFn();
              if (rcs && typeof rcs.getResponseControlSystem === 'function') {
                const rcsInstance = rcs.getResponseControlSystem();
                if (rcsInstance) {
                  const profileName = intentResult.intent === 'code_task' ? 'precise'
                    : intentResult.intent === 'research_request' ? 'detailed'
                    : intentResult.intent === 'simple_query' ? 'concise'
                    : 'balanced';
                  // Set profile for this session so getParams() returns the right params
                  if (typeof rcsInstance.setProfile === 'function') {
                    rcsInstance.setProfile(userId, profileName);
                  }
                  const params = rcsInstance.getParams(userId, {});
                  req.responseProfile = { name: profileName, ...params };
                  req.body._responseProfile = profileName;
                }
              }
            } catch { /* non-fatal */ }
          }
        } catch { /* non-fatal */ }
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 6 — TaskComplexityEngine: classify task difficulty + recommended approach
    try {
      const tce = getTaskComplexityEngine();
      if (tce) {
        const complexity = tce.analyze(message);
        req.taskComplexity = complexity;
        req.body._taskComplexity = complexity.level;
        req.body._taskApproach = complexity.approach;
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 16 — MultiTurnMemory: record this turn and retrieve conversation context
    try {
      const mtm = getMultiTurnMemory();
      const sessionId = req.body?.conversationId || userId || 'default';
      if (mtm) {
        mtm.addTurn(sessionId, 'user', message, { intent: req.body._agentIntent, ts: Date.now() });
        const ctx = mtm.getContext(sessionId, 10);
        if (ctx.turns && ctx.turns.length > 1) req.multiTurnContext = ctx;
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 14 — EntityTracker: extract entities + resolve pronouns in this message
    try {
      const et = getEntityTracker();
      const sessionId = req.body?.conversationId || userId || 'default';
      if (et) {
        const extracted = et.extract(sessionId, message);
        if (extracted && (extracted.length > 0 || Object.keys(extracted).length > 0)) {
          req.trackedEntities = extracted;
        }
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 35 — MinimumEffectiveAction: recommend minimal action for the task
    try {
      const mea = getMinimumEffectiveAction();
      if (mea && typeof mea.evaluate === 'function') {
        const meaResult = mea.evaluate(message, req.body._agentIntent || 'unknown');
        req.minimumEffectiveAction = meaResult;
        req.body._meaScope = meaResult?.scope;
        req.body._meaReversibility = meaResult?.reversibility;
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 29 — ReversibleExecution: classify reversibility of proposed action
    try {
      const re = getReversibleExecution();
      if (re && typeof re.isReversible === 'function') {
        const actionType = (req.body._agentIntent || 'unknown').split('_')[0];
        const reversible = re.isReversible(actionType);
        req.reversibilityCheck = { reversible, actionType };
        req.body._reversible = reversible;
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 31 — TimeAwareness: parse temporal references in the message
    try {
      const ta = getTimeAwareness();
      if (ta && typeof ta.parse === 'function') {
        const timeCtx = ta.parse(message);
        if (timeCtx?.relativeRefs?.length > 0 || timeCtx?.dates?.length > 0 || timeCtx?.deadlines?.length > 0) req.timeContext = timeCtx;
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 20 — GoalStateMonitor: retrieve current goal state for this session
    try {
      const gsm = getGoalStateMonitor();
      const sessionId = req.body?.conversationId || userId || 'default';
      if (gsm && typeof gsm.getGoalState === 'function') {
        const goalState = gsm.getGoalState(sessionId);
        if (goalState) req.goalState = goalState;
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 41 — DynamicPromptEngine: render intent-specific instruction template
    try {
      const dpe = getDynamicPromptEngine();
      if (dpe && typeof dpe.renderInline === 'function') {
        const intent = req.body._agentIntent || 'unknown';
        const template = `Respond with intent {{intent}}, complexity {{complexity}}, approach {{approach}}.`;
        const rendered = dpe.renderInline(template, {
          intent: req.body._agentIntent || 'general',
          complexity: req.body._taskComplexity || 'moderate',
          approach: req.body._taskApproach || 'structured answer',
        });
        if (rendered && rendered !== template) req.dynamicPrompt = rendered;
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 10 — ProgressEngine: start tracking for expert/complex tasks
    try {
      const pe = getProgressEngine();
      const sessionId = req.body?.conversationId || userId || 'default';
      if (pe && typeof pe.start === 'function' && (req.body._taskComplexity === 'complex' || req.body._taskComplexity === 'expert')) {
        const existing = pe.getProgress(sessionId);
        if (!existing) {
          pe.start(sessionId, [], { intent: req.body._agentIntent, message: message.slice(0, 100) });
        }
        req.taskProgress = pe.getProgress(sessionId);
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 46 — SentimentAnalyzer: detect user frustration/satisfaction/confusion
    try {
      const sa = getSentimentAnalyzer();
      if (sa && typeof sa.analyze === 'function') {
        const sentiment = sa.analyze(message);
        if (sentiment) { req.userSentiment = sentiment; req.body._userSentiment = sentiment.sentiment || sentiment.primary || sentiment.mood; }
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 37 — ResourceEstimator: estimate compute resources for this task
    try {
      const re = getResourceEstimator();
      if (re && typeof re.estimate === 'function') {
        const model = req.body?.model || 'unknown';
        const estimate = re.estimate(message, model, { intent: req.body._agentIntent });
        if (estimate) req.resourceEstimate = estimate;
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 32 — TokenOptimization: allocate token budget for this task type
    try {
      const to = getTokenOptimization();
      const sessionId = req.body?.conversationId || userId || 'default';
      if (to && typeof to.allocate === 'function') {
        const taskType = req.body._agentIntent || 'chat';
        const budget = to.allocate(taskType, sessionId);
        if (budget) req.tokenBudget = budget;
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 8 — ModelPerformanceMemory: recommend best model for this task type
    try {
      const mpm = getModelPerformanceMemory();
      if (mpm && typeof mpm.getBestModelFor === 'function') {
        const taskType = req.body._agentIntent || req.body._taskComplexity || 'general';
        const bestModel = mpm.getBestModelFor(taskType);
        if (bestModel) req.recommendedModel = bestModel;
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 5 — AdaptiveCognition: select reasoning strategy for this session
    try {
      const ac = getAdaptiveCognition();
      const sessionId = req.body?.conversationId || userId || 'default';
      if (ac && typeof ac.getStrategy === 'function') {
        const strategy = ac.getStrategy(sessionId);
        if (strategy) { req.cognitiveStrategy = strategy; req.body._cognitiveStrategy = strategy.name || strategy; }
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 27 — RiskAwareAutonomy: assess risk level for the current task
    try {
      const raa = getRiskAwareAutonomy();
      if (raa && typeof raa.assessAndAdjust === 'function') {
        const riskResult = raa.assessAndAdjust(
          { description: message, intent: req.body._agentIntent, irreversible: req.body._reversible === false },
          { complexity: req.body._taskComplexity },
        );
        req.riskAssessment = riskResult;
        req.body._riskLevel = riskResult?.adjustedAutonomy || riskResult?.riskLevel;
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 11 — KnowledgeGapDetector: detect unknown concepts in the user's question
    try {
      const kgd = getKnowledgeGapDetector();
      if (kgd && typeof kgd.detect === 'function') {
        const gaps = kgd.detect(message);
        if (gaps && gaps.length > 0) { req.knowledgeGaps = gaps; req.body._knowledgeGaps = gaps.slice(0, 5); }
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 40 — ToolSelectionEngine: recommend tools for the current task
    try {
      const tse = getToolSelectionEngine();
      if (tse && typeof tse.select === 'function') {
        const intent = req.body._agentIntent || 'unknown';
        const selectedTools = tse.select(message, [], { intent, complexity: req.body._taskComplexity });
        if (selectedTools && selectedTools.length > 0) req.suggestedTools = selectedTools;
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 39 — AuditTrailWriter: log each user request for durable audit trail
    try {
      const atw = getAuditTrailWriter();
      const sessionId = req.body?.conversationId || userId || 'default';
      if (atw && typeof atw.log === 'function') {
        atw.log({
          sessionId,
          userId,
          event: 'user_message',
          intent: req.body._agentIntent,
          complexity: req.body._taskComplexity,
          ts: Date.now(),
        });
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 34 — ScopeGuardian: define scope from this message and guard against drift
    try {
      const sg = getScopeGuardian();
      const sessionId = req.body?.conversationId || userId || 'default';
      if (sg && typeof sg.defineScope === 'function' && typeof sg.checkInScope === 'function') {
        // Upsert scope definition for this session
        sg.defineScope(sessionId, message);
        const scopeCheck = sg.checkInScope(sessionId, message);
        req.scopeCheck = scopeCheck;
        req.body._scopeDrifted = scopeCheck?.drifted;
      }
    } catch { /* non-fatal */ }

    // Gen B — PriorityQueue: enqueue this task so high-priority requests are tracked
    try {
      const pq = getPriorityQueue();
      if (pq && typeof pq.enqueue === 'function') {
        const complexityPriority = { simple: 3, moderate: 5, complex: 7, expert: 9 };
        const priority = complexityPriority[req.body._taskComplexity] || 5;
        const sessionId = req.body?.conversationId || userId || 'default';
        const { taskId } = pq.enqueue({ sessionId, intent: req.body._agentIntent, message: message.slice(0, 100) }, priority);
        req.priorityTaskId = taskId;
      }
    } catch { /* non-fatal */ }

    // Gen B — OutputFormatter: detect expected output format from message content type
    try {
      const of = getOutputFormatter();
      if (of && typeof of.detect === 'function') {
        const detection = of.detect(message);
        if (detection) { req.outputFormatDetection = detection; req.body._detectedOutputFormat = detection.estimatedFormat; }
      }
    } catch { /* non-fatal */ }

    // Gen B — CapabilityRegistry: record that this session exercised capabilities
    try {
      const cr = getCapabilityRegistry();
      if (cr && typeof cr.hasCapability === 'function') {
        req.body._capabilityMemoryEnabled = cr.hasCapability('memory');
        req.body._capabilityResearchEnabled = cr.hasCapability('research');
        req.body._capabilityCreativeEnabled = cr.hasCapability('creative');
      }
    } catch { /* non-fatal */ }

    // Gen B — ProviderAbstraction: select best available provider for this task
    try {
      const pa = getProviderAbstraction();
      if (pa && typeof pa.getBestProvider === 'function') {
        const complexity = req.body._taskComplexity;
        const minQuality = complexity === 'expert' ? 0.9 : complexity === 'complex' ? 0.75 : 0.6;
        const best = pa.getBestProvider({ minQuality });
        if (best) req.recommendedProvider = best.id || best.name;
      }
    } catch { /* non-fatal */ }

    // Gen B — InterruptionHandler: checkpoint complex/expert tasks before dispatch
    try {
      const ih = getInterruptionHandler();
      const sessionId = req.body?.conversationId || userId || 'default';
      if (ih && typeof ih.checkpoint === 'function' && (req.body._taskComplexity === 'complex' || req.body._taskComplexity === 'expert')) {
        ih.checkpoint(sessionId, { intent: req.body._agentIntent, message: message.slice(0, 200), ts: Date.now() });
      }
    } catch { /* non-fatal */ }

    // Gen B — PromptVersioning: save this prompt version for diffing and rollback
    try {
      const pv = getPromptVersioning();
      const sessionId = req.body?.conversationId || userId || 'default';
      if (pv && typeof pv.save === 'function') {
        const promptId = `session_${sessionId}_prompt`;
        const promptText = req.body._originalText || message;
        pv.save(promptId, promptText, { intent: req.body._agentIntent, complexity: req.body._taskComplexity, ts: Date.now() });
      }
    } catch { /* non-fatal */ }

    // Gen B — MemorySystem: cross-layer recall to surface relevant episodic/semantic/procedural context
    try {
      const ms = getMemorySystem();
      if (ms && typeof ms.recall === 'function') {
        const query = req.body._originalText || message;
        const recalled = ms.recall(query, { limit: 3 });
        if (Array.isArray(recalled) && recalled.length > 0) {
          req.body._memoryRecallCount = recalled.length;
          req.body._memoryRecallHints = recalled.map((r) => r.summary || r.content || r.event || '').filter(Boolean).slice(0, 3);
        }
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 27 — BehaviorPolicy: gate action against baseline behavioral policy
    try {
      const bp = getBehaviorPolicy();
      if (bp && typeof bp.check === 'function') {
        const policyAction = {
          content: message,
          intent: req.body._agentIntent || '',
          contentLength: message.length,
        };
        const policyResult = bp.check(policyAction);
        req.body._policyViolations = policyResult.violations || [];
        req.body._policyAllowed = policyResult.allowed !== false;
        if (!policyResult.allowed && policyResult.violations.length > 0) {
          logger.warn('[BehaviorPolicy] Action blocked by baseline policy:', policyResult.violations);
        }
      }
    } catch { /* non-fatal */ }

    // Gen B Phase 34 — AlternativeHypothesisEngine: generate alternative explanations for complex queries
    try {
      const ahe = getAlternativeHypothesisEngine();
      if (ahe && typeof ahe.generate === 'function') {
        const complexity = req.body._taskComplexity;
        if (complexity === 'complex' || complexity === 'expert') {
          const claim = (req.body._originalText || message).slice(0, 300);
          const result = ahe.generate(claim, { context: req.body._agentIntent, count: 3 });
          if (result && result.alternatives && result.alternatives.length > 0) {
            req.body._alternativeHypotheses = result.alternatives;
          }
        }
      }
    } catch { /* non-fatal */ }

    // Inject computed Gen B context as a structured <agent_context> block so the LLM
    // receives all phase outputs. This supplements (not replaces) the cognitive_context
    // block that wireCognitiveBehavior already prepended.
    try {
      const contextParts = [];
      if (req.body._agentIntent) contextParts.push(`intent="${req.body._agentIntent}"`);
      if (req.body._taskComplexity) contextParts.push(`complexity="${req.body._taskComplexity}"`);
      if (req.body._agentAction) contextParts.push(`action="${req.body._agentAction}"`);
      if (req.body._agentApproach) contextParts.push(`approach="${req.body._agentApproach}"`);
      if (req.body._riskLevel) contextParts.push(`risk="${req.body._riskLevel}"`);
      if (req.body._meaScope) contextParts.push(`scope="${req.body._meaScope}"`);
      if (req.body._reversible !== undefined) contextParts.push(`reversible="${req.body._reversible}"`);
      if (req.body._scopeDrifted) contextParts.push(`scope_drifted="true"`);
      if (req.body._cognitiveStrategy) contextParts.push(`cognitive_strategy="${req.body._cognitiveStrategy}"`);
      if (req.knowledgeGaps?.length > 0) contextParts.push(`knowledge_gaps="${req.knowledgeGaps.slice(0, 3).join(', ')}"`);
      if (req.timeContext) contextParts.push(`has_temporal_reference="true"`);
      if (req.suggestedTools?.length > 0) contextParts.push(`suggested_tools="${req.suggestedTools.slice(0, 3).join(', ')}"`);
      // Wire harness tool availability into agent context
      try {
        const hm = getHarnessManager();
        if (hm && hm.isReady && hm.isReady()) {
          const toolIds = hm.toolAdapter?.getToolIds?.() || [];
          if (toolIds.length > 0) {
            contextParts.push(`harness_tools="${toolIds.slice(0, 10).join(', ')}" harness_tool_count="${toolIds.length}"`);
            req.body._harnessReady = true;
          }
        }
      } catch { /* non-fatal */ };
      if (req.body._userSentiment) contextParts.push(`user_sentiment="${req.body._userSentiment}"`);
      if (req.body._memorySourceCount) contextParts.push(`memory_sources="${req.body._memorySourceCount}"`);
      if (req.body._memoryRecallCount) contextParts.push(`memory_recall="${req.body._memoryRecallCount}"`);
      if (req.body._constitutionActive) contextParts.push(`constitution_active="true"`);
      if (req.body._loopDetected) contextParts.push(`loop_detected="true" loop_count="${req.body._loopCount || 2}"`);
      if (req.body._engineDecision) contextParts.push(`engine_decision="${req.body._engineDecision}" engine_confidence="${req.body._engineConfidence || 0}"`);
      if (contextParts.length > 0) {
        const agentCtx = `<agent_context ${contextParts.join(' ')} />`;
        // Route to system context — LLM sees it, UI never displays it.
        req.body._systemContext = (req.body._systemContext || '') + agentCtx + '\n';
      }
    } catch { /* non-fatal */ }

    // Phase B — full executive loop (gated by feature flag, 4 s timeout)
    if (process.env.AGENT_RUNTIME_WIRED === 'true') {
      const runFn = getExecRun();
      if (runFn) {
        const loopId = crypto.randomUUID();
        const timeout = new Promise((resolve) => setTimeout(resolve, 4000));
        try {
          const result = await Promise.race([runFn(loopId, message, userId), timeout]);
          if (result && result.directive) {
            // Route executive brief to system context — LLM sees it, UI never displays it.
            req.body._systemContext = (req.body._systemContext || '') + result.directive + '\n';
            req.executiveResult = result;
          }
        } catch { /* non-fatal — never block a legitimate chat request */ }
      }
    }
  }

  next();
};

const checkAgentAccess = generateCheckAccess({
  permissionType: PermissionTypes.AGENTS,
  permissions: [Permissions.USE],
  skipCheck: skipAgentCheck,
  getRoleByName,
});
const checkAgentResourceAccess = canAccessAgentFromBody({
  requiredPermission: PermissionBits.VIEW,
});

/**
 * Replay the paused turn's graph-determining config onto a resume request BEFORE the
 * rest of the chain (PII filter, agent-access, buildEndpointOption) reads it. The client
 * can't reliably re-send the ephemeral-agent config after a reload/cross-session, so the
 * server restores it from the pending action — the resume then rebuilds the SAME
 * agent/graph the run paused on (and a crafted resume can't swap the tool set). No-op for
 * every non-resume route.
 */
const restoreResumeContext = async (req, res, next) => {
  if (req.path !== '/resume') {
    return next();
  }
  try {
    const streamId = req.body?.conversationId;
    if (streamId) {
      const job = await GenerationJobManager.getJob(streamId);
      const resumeContext = job?.metadata?.pendingAction?.resumeContext;
      applyResumeContext(req.body, resumeContext);
      // Replay the paused turn's resolved model parameters. Ephemeral agents derive these
      // (temperature, max tokens, custom endpoint params) from the request body, which the
      // resume payload omits — without this the continuation runs with defaults. They're
      // scattered top-level fields (folded into model_parameters by buildOptions' rest
      // spread), not part of the RESUME_CONTEXT_KEYS allowlist, so merge them back here.
      // Authoritative: overwrites any client-supplied values with the captured set.
      // `model` is excluded — it's replayed via RESUME_CONTEXT_KEYS to the exact value the
      // resume fingerprint was pinned on, so overwriting it here could trip that check.
      const resumedModelParameters = resumeContext?.model_parameters;
      if (resumedModelParameters && typeof resumedModelParameters === 'object') {
        const { model: _replayedModel, ...replayParams } = resumedModelParameters;
        Object.assign(req.body, replayParams);
      }
    }
  } catch (err) {
    logger.warn('[agents/chat] Failed to restore resume context', err?.message ?? err);
  }
  next();
};

router.use(restoreResumeContext);
router.use(wireCognitiveBehavior);
router.use(wireResearchEngine);
router.use(wireExecutiveLoop);
router.use(createMessageFilterPii({ getConfig: (req) => req.config?.messageFilter?.pii }));
router.use(moderateText);
router.use(checkAgentAccess);
router.use(checkAgentResourceAccess);
router.use(validateConvoAccess);
router.use(buildEndpointOption);

const controller = async (req, res, next) => {
  await AgentController(req, res, next, initializeClient, addTitle);
};

const resumeController = async (req, res, next) => {
  await ResumeController(req, res, next, initializeClient, addTitle);
};

/**
 * @route POST /resume
 * @desc Resume a generation paused for human-in-the-loop review (tool approval or
 *       ask-user answer). Shares this router's middleware so the agent/endpoint are
 *       reconstructed from the request exactly like a normal turn. Declared before
 *       `/:endpoint` so it is not captured as an ephemeral endpoint name.
 * @access Private
 * @returns {void}
 */
router.post('/resume', resumeController);

/**
 * @route POST / (regular endpoint)
 * @desc Chat with an assistant
 * @access Public
 * @param {express.Request} req - The request object, containing the request data.
 * @param {express.Response} res - The response object, used to send back a response.
 * @returns {void}
 */
router.post('/', controller);

/**
 * @route POST /:endpoint (ephemeral agents)
 * @desc Chat with an assistant
 * @access Public
 * @param {express.Request} req - The request object, containing the request data.
 * @param {express.Response} res - The response object, used to send back a response.
 * @returns {void}
 */
router.post('/:endpoint', controller);

module.exports = router;
